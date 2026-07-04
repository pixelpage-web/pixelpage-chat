import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { activateReferralsForOrg } from "@/lib/referral";

// product_id Cakto → nome do plano no banco (configurado por setup-cakto.mjs)
const CAKTO_PRODUCT_PLAN: Record<string, string> = {
  "e503993d-daa9-41c4-b1c7-3583aa83819c": "Plano 2",
  "b68d3268-7b43-41e4-aa88-0fa193725004": "Plano 3",
};

// Eventos que geram ação no banco; qualquer outro → 200 silencioso
const HANDLED_EVENTS = new Set([
  "subscription_created",
  "subscription_renewed",
  "subscription_canceled",
  "subscription_renewal_refused",
  "refund",
  "chargeback",
]);

/**
 * Comparação em tempo constante para o secret do corpo.
 * `timingSafeEqual` exige buffers de mesmo tamanho: se os comprimentos
 * diferem, faz uma comparação fictícia para queimar o mesmo tempo.
 */
function secretsMatch(received: string, expected: string): boolean {
  const r = Buffer.from(received, "utf8");
  const e = Buffer.from(expected, "utf8");
  if (r.length !== e.length) {
    timingSafeEqual(e, e); // dummy — evita vazamento de comprimento por timing
    return false;
  }
  return timingSafeEqual(r, e);
}

/**
 * Resolve org_id a partir do e-mail do cliente.
 * Usa auth.admin.listUsers (service_role) — adequado para escala atual;
 * migrar para RPC ou índice de e-mail se a base ultrapassar ~5 k usuários.
 */
async function orgIdByEmail(
  email: string,
  admin: ReturnType<typeof createAdminClient>
): Promise<string | null> {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error ?? !data) return null;
  const authUser = data.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );
  if (!authUser) return null;

  const { data: profile } = await admin
    .from("profiles")
    .select("org_id")
    .eq("id", authUser.id)
    .maybeSingle();
  return profile?.org_id ?? null;
}

/** Resolve plan_id a partir do product_id da Cakto. */
async function planIdByProduct(
  productId: string | undefined,
  admin: ReturnType<typeof createAdminClient>
): Promise<string | null> {
  if (!productId) return null;
  const planName = CAKTO_PRODUCT_PLAN[productId];
  if (!planName) return null;
  const { data } = await admin
    .from("plans")
    .select("id")
    .eq("name", planName)
    .eq("active", true)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Determina o fim do período pago a partir de data.subscription (sub-objeto).
 * O campo real confirmado no payload é: data.subscription.next_payment_date.
 * Cai de volta em +30 dias se o campo não vier.
 */
function periodEndFromSub(sub: Record<string, unknown>): string {
  const v = sub.next_payment_date;
  if (typeof v === "string" && v) return new Date(v).toISOString();
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
}

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // Fail-closed: sem secret configurado → 503
  const expectedSecret = process.env.CAKTO_WEBHOOK_SECRET;
  if (!expectedSecret) {
    console.error("[cakto-webhook] CAKTO_WEBHOOK_SECRET não configurada — fail-closed");
    return NextResponse.json({ error: "Webhook não configurado" }, { status: 503 });
  }

  // Lê body bruto antes de parsear (padrão consistente com webhook Meta)
  const rawBody = await request.text();

  let body: { secret?: unknown; event?: unknown; data?: unknown };
  try {
    body = JSON.parse(rawBody) as typeof body;
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  // Validação do secret em tempo constante
  const receivedSecret = typeof body.secret === "string" ? body.secret : "";
  if (!secretsMatch(receivedSecret, expectedSecret)) {
    console.warn("[cakto-webhook] secret inválido — acesso negado");
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const event = typeof body.event === "string" ? body.event : "";
  const data = asObj(body.data);

  console.log(`[cakto-webhook] evento=${event} data=${JSON.stringify(data)}`);

  // purchase_approved é redundante com subscription_created — só loga
  if (event === "purchase_approved") {
    console.log("[cakto-webhook] purchase_approved — informativo, sem ação");
    return NextResponse.json({ received: true });
  }

  // Evento desconhecido/futuro → 200 sem ação
  if (!HANDLED_EVENTS.has(event)) {
    console.log(`[cakto-webhook] evento não tratado: ${event}`);
    return NextResponse.json({ received: true });
  }

  // ── Identificação da organização ──────────────────────────────────────────
  const customer = asObj(data.customer);
  const customerEmail = typeof customer.email === "string" ? customer.email : null;

  if (!customerEmail) {
    console.error(`[cakto-webhook] ${event} — customer.email ausente no payload; sem ação`);
    return NextResponse.json({ received: true }); // 200 para Cakto não reenviar
  }

  const admin = createAdminClient();
  const orgId = await orgIdByEmail(customerEmail, admin);

  if (!orgId) {
    console.error(
      `[cakto-webhook] ${event} — e-mail "${customerEmail}" não encontrado em nenhuma org`
    );
    return NextResponse.json({ received: true }); // 200 — erro de associação, não de protocolo
  }

  // ── Lógica por evento ─────────────────────────────────────────────────────
  // Nota: data.status = status do pagamento ("paid", "refused"…) — não confundir
  // com data.subscription.status = estado da assinatura ("active", "canceled"…).
  // Toda a lógica abaixo é orientada pelo campo `event`, não por esses status fields.

  // Sub-objeto de assinatura presente em todos os eventos relevantes.
  const subscription = asObj(data.subscription);
  // ID único da assinatura na Cakto — rastreia renovações e cancelamentos (correção 2).
  const caktoSubId = typeof subscription.id === "string" ? subscription.id : null;

  if (event === "subscription_created") {
    const product = asObj(data.product);
    const productId = typeof product.id === "string" ? product.id : undefined;
    const planId = await planIdByProduct(productId, admin);

    if (!planId) {
      console.error(
        `[cakto-webhook] subscription_created — product_id "${productId ?? "n/d"}" sem mapeamento`
      );
      return NextResponse.json({ received: true });
    }

    const { error } = await admin
      .from("subscriptions")
      .update({
        plan_id: planId,
        status: "active",
        trial_ends_at: null,
        current_period_end: periodEndFromSub(subscription),
        cakto_subscription_id: caktoSubId,
      })
      .eq("org_id", orgId);

    if (error) {
      console.error(`[cakto-webhook] subscription_created DB error: ${error.message}`);
      return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }

    await admin.from("audit_logs").insert({
      org_id: orgId,
      action: "billing.subscription_created",
      metadata: { event, product_id: productId, plan_id: planId, cakto_subscription_id: caktoSubId },
    });

    // Ativa indicações pendentes (sem await — não bloqueia a resposta ao Cakto)
    activateReferralsForOrg(orgId).catch((err) =>
      console.error(`[referral] activateReferralsForOrg error: ${err}`)
    );

    console.log(`[cakto-webhook] subscription_created ok — org=${orgId} plan=${planId} sub=${caktoSubId ?? "n/d"}`);
  }

  if (event === "subscription_renewed") {
    const { error } = await admin
      .from("subscriptions")
      .update({ status: "active", current_period_end: periodEndFromSub(subscription) })
      .eq("org_id", orgId);

    if (error) {
      console.error(`[cakto-webhook] subscription_renewed DB error: ${error.message}`);
      return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }

    await admin.from("audit_logs").insert({
      org_id: orgId,
      action: "billing.subscription_renewed",
      metadata: { event },
    });

    console.log(`[cakto-webhook] subscription_renewed ok — org=${orgId}`);
  }

  if (event === "subscription_canceled") {
    // Usa data.subscription.next_payment_date para saber até quando o acesso é válido.
    // Se a data já passou (ou não vier), sem grace period — acesso expira imediatamente.
    const nextPayment = typeof subscription.next_payment_date === "string"
      ? subscription.next_payment_date
      : null;
    const accessUntil =
      nextPayment && new Date(nextPayment) > new Date()
        ? new Date(nextPayment).toISOString()
        : null;

    const { error } = await admin
      .from("subscriptions")
      .update({
        status: "canceled",
        ...(accessUntil ? { current_period_end: accessUntil } : {}),
      })
      .eq("org_id", orgId);

    if (error) {
      console.error(`[cakto-webhook] subscription_canceled DB error: ${error.message}`);
      return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }

    await admin.from("audit_logs").insert({
      org_id: orgId,
      action: "billing.subscription_canceled",
      metadata: {
        event,
        canceled_at: typeof subscription.canceledAt === "string" ? subscription.canceledAt : null,
        access_until: accessUntil,
      },
    });

    console.log(
      `[cakto-webhook] subscription_canceled — org=${orgId} acesso até ${accessUntil ?? "imediato"}`
    );
  }

  if (event === "subscription_renewal_refused") {
    // Não cancela — dá chance da Cakto tentar novamente antes de revogar
    const { error } = await admin
      .from("subscriptions")
      .update({ status: "past_due" })
      .eq("org_id", orgId);

    if (error) {
      console.error(`[cakto-webhook] renewal_refused DB error: ${error.message}`);
      return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }

    await admin.from("audit_logs").insert({
      org_id: orgId,
      action: "billing.renewal_refused",
      metadata: { event },
    });

    console.log(`[cakto-webhook] subscription_renewal_refused — org=${orgId} status=past_due`);
  }

  if (event === "refund" || event === "chargeback") {
    // Não desativa automaticamente — registra para revisão manual
    await admin.from("audit_logs").insert({
      org_id: orgId,
      action: "billing.flagged_for_review",
      metadata: { event, reason: event },
    });

    console.warn(`[cakto-webhook] ${event} — org=${orgId} marcada para revisão manual`);
  }

  return NextResponse.json({ received: true });
}
