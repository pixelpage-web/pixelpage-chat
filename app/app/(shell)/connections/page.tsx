import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { getEvolutionConfig, isEvolutionConfigured } from "@/lib/evolution";
import { isSuperAdmin } from "@/lib/access";
import { ConnectionsView } from "@/components/connections/connections-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Conexões" };

export default async function ConnectionsPage() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) redirect("/app/onboarding");
  const orgId = session.profile.org_id;

  const supabase = await createServerSupabase();

  const [{ data: connections }, { data: subscription }] = await Promise.all([
    supabase
      .from("whatsapp_connections")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true }),
    supabase
      .from("subscriptions")
      .select("plan_id")
      .eq("org_id", orgId)
      .maybeSingle(),
  ]);

  let connectionsLimit = 1;
  if (subscription?.plan_id) {
    const { data: plan } = await supabase
      .from("plans")
      .select("connections_limit")
      .eq("id", subscription.plan_id)
      .maybeSingle();
    connectionsLimit = plan?.connections_limit ?? 1;
  }

  const evolutionCfg = await getEvolutionConfig();

  return (
    <ConnectionsView
      initialConnections={connections ?? []}
      connectionsLimit={connectionsLimit}
      signupEnabled={process.env.NEXT_PUBLIC_EMBEDDED_SIGNUP_ENABLED === "true"}
      qrEnabled={isEvolutionConfigured(evolutionCfg)}
      limitOverride={isSuperAdmin(session.user.email)}
    />
  );
}
