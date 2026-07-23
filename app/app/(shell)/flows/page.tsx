import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasFeatureAccess } from "@/lib/access";
import { canViewNavRoute } from "@/lib/permissions";
import { getPlanFeatures } from "@/lib/plan-features";
import { FlowsView } from "@/components/flows/flows-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Fluxos" };

export default async function FlowsPage() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) redirect("/app/onboarding");
  if (!canViewNavRoute(session.profile.permissions, "/app/flows")) redirect("/app/inbox");
  const orgId = session.profile.org_id;

  const supabase = await createServerSupabase();

  // Fluxos é recurso Pro — mesmo padrão de gate usado em BYOK/Webhook/Units.
  // Super Admin sempre libera (hasFeatureAccess). planFeatures reaproveita a
  // mesma assinatura que layout.tsx já buscou (getOrgSubscriptionSummary tem
  // cache() do React) — antes buscava de novo via RPC + query de plans.
  const planFeatures = await getPlanFeatures(orgId);
  const planName = planFeatures?.name ?? "Free";
  const isBasicPlan = planName === "Free" || planName === "Starter";
  const flowsAccess = hasFeatureAccess({
    userEmail: session.user.email,
    hasNormalAccess: !isBasicPlan,
    requiredPlan: "Pro",
  });
  if (!flowsAccess.access) redirect("/app/inbox");

  const [{ data: flows }, { data: connections }] = await Promise.all([
    supabase
      .from("flows")
      .select("*")
      .eq("org_id", orgId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("whatsapp_connections")
      .select("id, label, phone_display")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true }),
  ]);

  return <FlowsView initialFlows={flows ?? []} connections={connections ?? []} />;
}
