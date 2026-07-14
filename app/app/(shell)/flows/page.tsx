import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasFeatureAccess } from "@/lib/access";
import { FlowsView } from "@/components/flows/flows-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Fluxos" };

export default async function FlowsPage() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) redirect("/app/onboarding");
  const orgId = session.profile.org_id;

  const supabase = await createServerSupabase();

  // Fluxos é recurso Pro — mesmo padrão de gate usado em BYOK/Webhook/Units.
  // Super Admin sempre libera (hasFeatureAccess).
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan_id")
    .eq("org_id", orgId)
    .maybeSingle();
  let planName = "Free";
  if (subscription?.plan_id) {
    const { data: plan } = await supabase
      .from("plans")
      .select("name")
      .eq("id", subscription.plan_id)
      .maybeSingle();
    planName = plan?.name ?? "Free";
  }
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
