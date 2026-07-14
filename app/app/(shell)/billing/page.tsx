import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { BillingView } from "@/components/billing/billing-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Assinatura" };

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) redirect("/app/onboarding");
  const orgId = session.profile.org_id;

  const params = await searchParams;
  const showSuccess = params.success === "true";

  const supabase = await createServerSupabase();

  const periodKey = (() => {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  })();

  const [
    { data: subscription },
    { data: plans },
    { data: usage },
    { count: connectionsCount },
    { count: teamCount },
    { data: org },
    { data: costUsage },
  ] = await Promise.all([
    supabase.from("subscriptions").select("*").eq("org_id", orgId).maybeSingle(),
    supabase
      .from("plans")
      .select("*")
      .eq("active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("usage_counters")
      .select("ai_messages_used")
      .eq("org_id", orgId)
      .eq("period_start", periodKey)
      .maybeSingle(),
    supabase
      .from("whatsapp_connections")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId),
    // ai_mode/ai_provider são colunas não-secretas, legíveis via RLS — sem RPC.
    supabase
      .from("organizations")
      .select("ai_mode, ai_provider")
      .eq("id", orgId)
      .maybeSingle(),
    // Rollup mensal de custo de IA (0027) — mesma chave dia-1-do-mês de usage_counters.
    supabase
      .from("org_usage_monthly")
      .select("total_ai_cost_usd, plan_limit_ai_cost_usd, status")
      .eq("org_id", orgId)
      .eq("month", periodKey)
      .maybeSingle(),
  ]);

  const currentPlan =
    plans?.find((p) => p.id === subscription?.plan_id) ?? null;

  // Decide qual checkout oferecer pra assinantes NOVOS — Cakto continua o
  // default; só vira Stripe se explicitamente configurado. Não afeta quem
  // já assina (isso depende de subscription.payment_provider, não disso).
  const activePaymentProvider =
    process.env.ACTIVE_PAYMENT_PROVIDER === "stripe" ? "stripe" : "cakto";

  return (
    <BillingView
      subscription={subscription ?? null}
      currentPlan={currentPlan}
      activePaymentProvider={activePaymentProvider}
      plans={plans ?? []}
      aiUsed={usage?.ai_messages_used ?? 0}
      connectionsCount={connectionsCount ?? 0}
      teamCount={teamCount ?? 0}
      aiMode={org?.ai_mode ?? "managed"}
      aiCostUsd={costUsage?.total_ai_cost_usd ?? 0}
      aiCostLimitUsd={costUsage?.plan_limit_ai_cost_usd ?? null}
      aiUsageStatus={costUsage?.status ?? "ok"}
      isOwner={session.profile.role === "owner" || session.profile.role === "admin"}
      userEmail={session.user.email ?? ""}
      userName={session.profile.name}
      showSuccess={showSuccess}
    />
  );
}
