import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeClient } from "@/lib/stripe";
import { activateReferralsForOrg } from "@/lib/referral";
import type { SubscriptionStatus } from "@/types/database";

/**
 * Webhook Stripe — espelha a estrutura de app/api/webhooks/cakto/route.ts
 * (fail-closed sem secret, allowlist de eventos, um bloco por evento,
 * update em subscriptions + insert em audit_logs).
 *
 * Resolução de org difere da Cakto por necessidade, não por gosto: a Cakto
 * não tem nenhum campo pra carimbar uma referência nossa de antemão, então
 * o webhook dela SÓ pode resolver por email (auth.admin.listUsers). Aqui,
 * checkout.session.completed carrega client_reference_id=org_id (carimbado
 * em app/api/checkout/stripe/route.ts) — resolução direta, sem busca. Os
 * eventos seguintes (invoice.*, customer.subscription.*) trazem o ID da
 * subscription Stripe, que a essa altura já está gravado em
 * subscriptions.stripe_subscription_id — resolve com um select nosso, sem
 * nunca precisar chamar a API da Stripe de novo só pra achar o e-mail.
 */

const HANDLED_EVENTS = new Set([
  "checkout.session.completed",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

function periodEndFromUnix(ts: number | null | undefined): string | null {
  return typeof ts === "number" ? new Date(ts * 1000).toISOString() : null;
}

/**
 * Nas versões recentes da API Stripe, current_period_end saiu do nível da
 * subscription e foi pra cada item (suporte a preços com ciclos diferentes
 * na mesma assinatura). Nossas assinaturas são sempre 1 preço só — o item
 * único carrega o período que importa.
 */
function subscriptionPeriodEnd(sub: Stripe.Subscription): number | null {
  return sub.items.data[0]?.current_period_end ?? null;
}

/**
 * Idem: invoice.subscription saiu do nível raiz da invoice e foi pra
 * invoice.parent.subscription_details.subscription (reestruturação
 * "Invoice parent" de versões recentes da API).
 */
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const sub = invoice.parent?.subscription_details?.subscription;
  if (!sub) return null;
  return typeof sub === "string" ? sub : sub.id;
}

/** Stripe tem mais estados que nós — só mapeia os que temos ação clara pra tomar. */
function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus | null {
  switch (status) {
    case "trialing":
      return "trial";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
      return "canceled";
    default:
      // incomplete, incomplete_expired, paused — estados transitórios/raros,
      // sem ação automática (mesmo espírito do "flagged_for_review" da Cakto).
      return null;
  }
}

async function orgIdByStripeSubscriptionId(
  subId: string,
  admin: ReturnType<typeof createAdminClient>
): Promise<string | null> {
  const { data } = await admin
    .from("subscriptions")
    .select("org_id")
    .eq("stripe_subscription_id", subId)
    .maybeSingle();
  return data?.org_id ?? null;
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET não configurada — fail-closed");
    return NextResponse.json({ error: "Webhook não configurado" }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Assinatura ausente" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.warn(
      `[stripe-webhook] assinatura inválida: ${err instanceof Error ? err.message : "erro desconhecido"}`
    );
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  console.log(`[stripe-webhook] evento=${event.type} id=${event.id}`);

  if (!HANDLED_EVENTS.has(event.type)) {
    console.log(`[stripe-webhook] evento não tratado: ${event.type}`);
    return NextResponse.json({ received: true });
  }

  const admin = createAdminClient();
  const stripe = getStripeClient();

  // ── checkout.session.completed ──────────────────────────────────────────
  if (event.type === "checkout.session.completed") {
    const checkoutSession = event.data.object as Stripe.Checkout.Session;
    const orgId = checkoutSession.client_reference_id;
    const planId = checkoutSession.metadata?.plan_id ?? null;
    const stripeSubId =
      typeof checkoutSession.subscription === "string"
        ? checkoutSession.subscription
        : (checkoutSession.subscription?.id ?? null);

    if (!orgId || !planId || !stripeSubId) {
      console.error(
        `[stripe-webhook] checkout.session.completed — dados incompletos (org=${orgId ?? "n/d"} plan=${planId ?? "n/d"} sub=${stripeSubId ?? "n/d"})`
      );
      return NextResponse.json({ received: true });
    }

    const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);
    const mappedStatus = mapStripeStatus(stripeSub.status) ?? "active";

    const { error } = await admin
      .from("subscriptions")
      .update({
        plan_id: planId,
        status: mappedStatus,
        payment_provider: "stripe",
        stripe_subscription_id: stripeSubId,
        trial_ends_at: null,
        current_period_end: periodEndFromUnix(subscriptionPeriodEnd(stripeSub)),
      })
      .eq("org_id", orgId);

    if (error) {
      console.error(`[stripe-webhook] checkout.session.completed DB error: ${error.message}`);
      return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }

    await admin.from("audit_logs").insert({
      org_id: orgId,
      action: "billing.subscription_created",
      metadata: {
        event: event.type,
        provider: "stripe",
        plan_id: planId,
        stripe_subscription_id: stripeSubId,
      },
    });

    activateReferralsForOrg(orgId).catch((err) =>
      console.error(`[referral] activateReferralsForOrg error: ${err}`)
    );

    console.log(`[stripe-webhook] checkout.session.completed ok — org=${orgId} plan=${planId} sub=${stripeSubId}`);
  }

  // ── invoice.paid (renovação) ────────────────────────────────────────────
  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;
    const stripeSubId = invoiceSubscriptionId(invoice);
    if (!stripeSubId) {
      console.log("[stripe-webhook] invoice.paid sem subscription — provavelmente fatura avulsa, ignorado");
      return NextResponse.json({ received: true });
    }

    const orgId = await orgIdByStripeSubscriptionId(stripeSubId, admin);
    if (!orgId) {
      console.error(`[stripe-webhook] invoice.paid — nenhuma org com stripe_subscription_id=${stripeSubId}`);
      // Não responde 200 aqui: checkout.session.completed pode ainda não ter
      // gravado o stripe_subscription_id (Stripe não garante ordem de entrega
      // dos webhooks). Um não-2xx faz a Stripe reentregar com backoff — dá
      // tempo do outro handler gravar antes da próxima tentativa, em vez de
      // mascarar a falha com {received:true} e perder o evento de vez.
      return NextResponse.json(
        { error: "Org ainda não vinculada a essa subscription" },
        { status: 409 }
      );
    }

    const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);
    // Não grava "active" fixo: uma invoice paga em R$0 do período de trial
    // também dispara invoice.paid mesmo com a subscription ainda em
    // trialing — sem derivar do status real, isso vira o inverso do bug
    // original (ativa acesso pago antes da cobrança real, dependendo só
    // da ordem de entrega dos webhooks, que a Stripe não garante).
    const mappedStatus = mapStripeStatus(stripeSub.status) ?? "active";
    const { error } = await admin
      .from("subscriptions")
      .update({
        status: mappedStatus,
        current_period_end: periodEndFromUnix(subscriptionPeriodEnd(stripeSub)),
      })
      .eq("org_id", orgId);

    if (error) {
      console.error(`[stripe-webhook] invoice.paid DB error: ${error.message}`);
      return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }

    await admin.from("audit_logs").insert({
      org_id: orgId,
      action: "billing.subscription_renewed",
      metadata: { event: event.type, provider: "stripe", stripe_status: stripeSub.status },
    });

    console.log(`[stripe-webhook] invoice.paid ok — org=${orgId} status=${mappedStatus}`);
  }

  // ── invoice.payment_failed ───────────────────────────────────────────────
  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    const stripeSubId = invoiceSubscriptionId(invoice);
    if (!stripeSubId) return NextResponse.json({ received: true });

    const orgId = await orgIdByStripeSubscriptionId(stripeSubId, admin);
    if (!orgId) {
      console.error(`[stripe-webhook] invoice.payment_failed — nenhuma org com stripe_subscription_id=${stripeSubId}`);
      return NextResponse.json({ received: true });
    }

    // Não cancela — mesmo espírito do subscription_renewal_refused da Cakto:
    // dá chance de a Stripe tentar cobrar de novo antes de revogar acesso.
    const { error } = await admin
      .from("subscriptions")
      .update({ status: "past_due" })
      .eq("org_id", orgId);

    if (error) {
      console.error(`[stripe-webhook] invoice.payment_failed DB error: ${error.message}`);
      return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }

    await admin.from("audit_logs").insert({
      org_id: orgId,
      action: "billing.renewal_refused",
      metadata: { event: event.type, provider: "stripe" },
    });

    console.log(`[stripe-webhook] invoice.payment_failed — org=${orgId} status=past_due`);
  }

  // ── customer.subscription.updated ───────────────────────────────────────
  if (event.type === "customer.subscription.updated") {
    const sub = event.data.object as Stripe.Subscription;
    const orgId = await orgIdByStripeSubscriptionId(sub.id, admin);
    if (!orgId) {
      console.error(`[stripe-webhook] customer.subscription.updated — nenhuma org com stripe_subscription_id=${sub.id}`);
      return NextResponse.json({ received: true });
    }

    const mappedStatus = mapStripeStatus(sub.status);
    if (!mappedStatus) {
      console.log(`[stripe-webhook] customer.subscription.updated — status "${sub.status}" sem mapeamento, ignorado`);
      return NextResponse.json({ received: true });
    }

    const { error } = await admin
      .from("subscriptions")
      .update({
        status: mappedStatus,
        current_period_end: periodEndFromUnix(subscriptionPeriodEnd(sub)),
      })
      .eq("org_id", orgId);

    if (error) {
      console.error(`[stripe-webhook] customer.subscription.updated DB error: ${error.message}`);
      return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }

    await admin.from("audit_logs").insert({
      org_id: orgId,
      action: "billing.subscription_updated",
      metadata: { event: event.type, provider: "stripe", stripe_status: sub.status },
    });

    console.log(`[stripe-webhook] customer.subscription.updated ok — org=${orgId} status=${mappedStatus}`);
  }

  // ── customer.subscription.deleted (cancelamento) ────────────────────────
  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    const orgId = await orgIdByStripeSubscriptionId(sub.id, admin);
    if (!orgId) {
      console.error(`[stripe-webhook] customer.subscription.deleted — nenhuma org com stripe_subscription_id=${sub.id}`);
      return NextResponse.json({ received: true });
    }

    // current_period_end da própria subscription já reflete até quando o
    // acesso pago vale — mesmo papel do accessUntil calculado manualmente
    // no webhook da Cakto, aqui a Stripe já entrega pronto.
    const { error } = await admin
      .from("subscriptions")
      .update({
        status: "canceled",
        current_period_end: periodEndFromUnix(subscriptionPeriodEnd(sub)),
      })
      .eq("org_id", orgId);

    if (error) {
      console.error(`[stripe-webhook] customer.subscription.deleted DB error: ${error.message}`);
      return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }

    await admin.from("audit_logs").insert({
      org_id: orgId,
      action: "billing.subscription_canceled",
      metadata: {
        event: event.type,
        provider: "stripe",
        access_until: periodEndFromUnix(subscriptionPeriodEnd(sub)),
      },
    });

    console.log(`[stripe-webhook] customer.subscription.deleted — org=${orgId}`);
  }

  return NextResponse.json({ received: true });
}
