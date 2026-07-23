import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrgSubscriptionSummary } from "@/lib/billing";

export interface PlanFeatures {
  name: string | null;
  meta_api_enabled: boolean;
  team_limit: number | null;
  connections_limit: number | null;
  campaigns_limit: number | null;
  price_pending: boolean;
}

/**
 * Retorna as features do plano ativo da org, ou null se não houver
 * assinatura. Reaproveita getOrgSubscriptionSummary (cache() do React) em
 * vez de fazer sua própria query em `subscriptions` — antes eram 2 queries
 * sequenciais próprias (subscriptions → plans) sempre que chamado, mesmo
 * quando layout.tsx já tinha acabado de buscar a mesma assinatura no
 * request. Também com cache() aqui: connections, settings, campaigns e
 * flows (listagem + editor) chamam isso no mesmo request sem duplicar a
 * query de `plans`.
 */
export const getPlanFeatures = cache(
  async (orgId: string): Promise<PlanFeatures | null> => {
    const sub = await getOrgSubscriptionSummary(orgId);
    if (!sub?.plan_id) return null;

    const admin = createAdminClient();
    const { data: plan } = await admin
      .from("plans")
      .select(
        "name, features, team_limit, connections_limit, campaigns_limit, allow_official_api"
      )
      .eq("id", sub.plan_id)
      .maybeSingle();
    if (!plan) return null;

    const f = (plan.features ?? {}) as Record<string, unknown>;
    return {
      name: plan.name ?? null,
      meta_api_enabled: plan.allow_official_api === true,
      team_limit: plan.team_limit ?? null,
      connections_limit: plan.connections_limit,
      campaigns_limit: plan.campaigns_limit,
      price_pending: f.price_pending === true,
    };
  }
);

/** true se a org tem `meta_api_enabled` no plano ativo. */
export async function orgHasMetaApi(orgId: string): Promise<boolean> {
  const features = await getPlanFeatures(orgId);
  return features?.meta_api_enabled === true;
}
