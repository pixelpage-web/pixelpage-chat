import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { campaignUsageThisMonth } from "@/lib/campaigns";
import { hasFeatureAccess } from "@/lib/access";
import { CampaignsView } from "@/components/campaigns/campaigns-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Campanhas" };

export default async function CampaignsPage() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) redirect("/app/onboarding");
  const orgId = session.profile.org_id;

  const supabase = await createServerSupabase();

  const [{ data: subscription }, { data: connections }] = await Promise.all([
    supabase.from("subscriptions").select("plan_id").eq("org_id", orgId).maybeSingle(),
    supabase
      .from("whatsapp_connections")
      .select("id, label, phone_display, status")
      .eq("org_id", orgId),
  ]);

  let campaignsLimit: number | null = 0;
  if (subscription?.plan_id) {
    const { data: plan } = await supabase
      .from("plans")
      .select("campaigns_limit")
      .eq("id", subscription.plan_id)
      .maybeSingle();
    campaignsLimit = plan?.campaigns_limit ?? 0;
  }

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
