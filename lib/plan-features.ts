import { createAdminClient } from "@/lib/supabase/admin";

export interface PlanFeatures {
  meta_api_enabled: boolean;
  team_limit: number | null;
  connections_limit: number | null;
  price_pending: boolean;
}

/** Retorna as features do plano ativo da org, ou null se não houver assinatura. */
export async function getPlanFeatures(orgId: string): Promise<PlanFeatures | null> {
  const admin = createAdminClient();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("plan_id")
    .eq("org_id", orgId)
    .maybeSingle();
  if (!sub?.plan_id) return null;

  const { data: plan } = await admin
    .from("plans")
    .select("features, team_limit, connections_limit")
    .eq("id", sub.plan_id)
    .maybeSingle();
  if (!plan) return null;

  const f = (plan.features ?? {}) as Record<string, unknown>;
  return {
    meta_api_enabled: f.meta_api_enabled === true,
    team_limit: plan.team_limit ?? null,
    connections_limit: plan.connections_limit,
    price_pending: f.price_pending === true,
  };
}

/** true se a org tem `meta_api_enabled` no plano ativo. */
export async function orgHasMetaApi(orgId: string): Promise<boolean> {
  const features = await getPlanFeatures(orgId);
  return features?.meta_api_enabled === true;
}
