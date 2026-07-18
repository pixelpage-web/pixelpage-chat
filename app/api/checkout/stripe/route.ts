import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { getStripeClient, isStripeConfigured } from "@/lib/stripe";

/**
 * POST — cria uma Stripe Checkout Session (mode: subscription) pro plano
 * pedido e devolve a URL pro client redirecionar.
 *
 * A sessão nasce dinâmica a cada clique, então dá pra carimbar
 * client_reference_id=org_id — o webhook resolve a org direto por isso,
 * sem precisar caçar por email.
 */
export async function POST(request: Request) {
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

  let body: { plan_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }
  const planId = typeof body.plan_id === "string" ? body.plan_id : null;
  if (!planId) {
    return NextResponse.json({ error: "plan_id é obrigatório" }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  const { data: plan } = await supabase
    .from("plans")
    .select("id, name, stripe_price_id, features")
    .eq("id", planId)
    .eq("active", true)
    .maybeSingle();

  if (!plan?.stripe_price_id) {
    return NextResponse.json(
      { error: "Este plano ainda não tem preço configurado na Stripe." },
      { status: 400 }
    );
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://www.pixelpagechat.com.br";

  // Mesmo campo já usado pelos planos hoje (badge "X dias grátis" no card
  // de planos) — reaproveita, não inventa um número de trial novo.
  const trialDays = (plan.features as Record<string, unknown> | null)
    ?.trial_days as number | undefined;

  try {
    const stripe = getStripeClient();
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      client_reference_id: orgId,
      customer_email: session.user.email ?? undefined,
      subscription_data:
        trialDays && trialDays > 0 ? { trial_period_days: trialDays } : undefined,
      success_url: `${appUrl}/app/billing?success=true`,
      cancel_url: `${appUrl}/app/billing`,
      metadata: { org_id: orgId, plan_id: plan.id, plan_name: plan.name },
    });

    if (!checkoutSession.url) {
      return NextResponse.json(
        { error: "Stripe não retornou URL de checkout." },
        { status: 502 }
      );
    }

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err) {
    console.error("[checkout/stripe] erro ao criar sessão:", err);
    return NextResponse.json(
      { error: "Não foi possível iniciar o checkout." },
      { status: 502 }
    );
  }
}
