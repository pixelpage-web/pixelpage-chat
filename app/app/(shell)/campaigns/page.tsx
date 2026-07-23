import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { campaignUsageThisMonth } from "@/lib/campaigns";
import { hasFeatureAccess } from "@/lib/access";
import { canViewNavRoute } from "@/lib/permissions";
import { getPlanFeatures } from "@/lib/plan-features";
import { CampaignsView } from "@/components/campaigns/campaigns-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Campanhas" };

export default async function CampaignsPage() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) redirect("/app/onboarding");
  if (!canViewNavRoute(session.profile.permissions, "/app/campaigns")) redirect("/app/inbox");
  const orgId = session.profile.org_id;

  const supabase = await createServerSupabase();

  // planFeatures reaproveita a mesma assinatura que layout.tsx já buscou
  // (getOrgSubscriptionSummary tem cache() do React) — antes esta página
  // buscava a assinatura de novo via RPC e mais uma query de plans só pra
  // pegar campaigns_limit.
  const [planFeatures, { data: connections }] = await Promise.all([
    getPlanFeatures(orgId),
    supabase
      .from("whatsapp_connections")
      .select("id, label, phone_display, status")
      .eq("org_id", orgId),
  ]);

  let campaignsLimit: number | null = planFeatures?.campaigns_limit ?? 0;

  // Gate de plano: campaigns_limit 0 = sem acesso. Super Admin enxerga tudo.
  const access = hasFeatureAccess({
    userEmail: session.user.email,
    hasNormalAccess: campaignsLimit !== 0,
    requiredPlan: "Starter",
  });
  if (access.isOverride) campaignsLimit = null; // visualização sem limite

  const usage = campaignsLimit === 0 ? 0 : await campaignUsageThisMonth(orgId);

  return (
    <CampaignsView
      orgId={orgId}
      connections={(connections ?? []).filter((c) => c.status === "connected")}
      campaignsLimit={campaignsLimit}
      usedThisMonth={usage}
      canCreate={session.profile.role !== "agent"}
      planOverride={access.isOverride ? access.requiredPlan : null}
    />
  );
}
