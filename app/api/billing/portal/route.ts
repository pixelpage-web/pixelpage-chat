import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { getStripeClient, isStripeConfigured } from "@/lib/stripe";

/**
 * POST — cria uma sessão do Stripe Customer Portal e devolve a URL.
 * Só faz sentido pra org com payment_provider="stripe" (assinantes Cakto
 * seguem 100% no fluxo atual, sem esse botão).
 *
 * Não guardamos stripe_customer_id à parte — a subscription já tem
 * stripe_subscription_id, e toda subscription Stripe carrega o customer
 * dela junto. Um campo novo só pra isso seria redundante.
 */
export async function POST() {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Pagamento via Stripe ainda não configurado." },
      { status: 503 }
    );
  }

  const session = await getSessionProfile();
  if (!session?.profile?.org_id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (session.profile.role !== "owner" && session.profile.role !== "admin") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }
  const orgId = session.profile.org_id;

  const supabase = await createServerSupabase();
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("payment_provider, stripe_subscription_id")
    .eq("org_id", orgId)
    .maybeSingle();

  if (subscription?.payment_provider !== "stripe" || !subscription.stripe_subscription_id) {
    return NextResponse.json(
      { error: "Esta organização não tem assinatura via Stripe." },
      { status: 400 }
    );
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://www.pixelpagechat.com.br";

  try {
    const stripe = getStripeClient();
    const stripeSub = await stripe.subscriptions.retrieve(
      subscription.stripe_subscription_id
    );
    const customerId =
      typeof stripeSub.customer === "string" ? stripeSub.customer : stripeSub.customer.id;

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/app/billing`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (err) {
    console.error("[billing/portal] erro ao criar sessão:", err);
    return NextResponse.json(
      { error: "Não foi possível abrir o portal de gerenciamento." },
      { status: 502 }
    );
  }
}
