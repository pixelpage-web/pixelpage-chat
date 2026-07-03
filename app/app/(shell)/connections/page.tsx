import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { getEvolutionConfig, isEvolutionConfigured } from "@/lib/evolution";
import { isSuperAdmin } from "@/lib/access";
import { orgHasMetaApi } from "@/lib/plan-features";
import { ConnectionsView } from "@/components/connections/connections-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Conexões" };

export default async function ConnectionsPage() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) redirect("/app/onboarding");
  const orgId = session.profile.org_id;

  const supabase = await createServerSupabase();

  const [{ data: connections }, { data: subscription }, hasMetaApi] =
    await Promise.all([
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
      orgHasMetaApi(orgId),
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

  // Status do webhook externo por conexão (Tarefa 4): verde/âmbar/vermelho
  const { data: webhooks } = await supabase
    .from("external_webhooks")
    .select("id, connection_id, active, last_status, failures_count")
    .eq("org_id", orgId);

  const webhookInfo: Record<
    string,
    { id: string; status: "ok" | "warn" | "down" | "idle"; lastStatus: number | null }
  > = {};
  for (const conn of connections ?? []) {
    if (conn.mode !== "external_webhook") continue;
    const w =
      webhooks?.find((x) => x.connection_id === conn.id) ??
      webhooks?.find((x) => x.connection_id === null);
    if (!w) {
      webhookInfo[conn.id] = { id: "", status: "idle", lastStatus: null };
      continue;
    }
    let status: "ok" | "warn" | "down" | "idle" = "idle";
    if (w.failures_count >= 3 || (w.last_status != null && w.last_status >= 500))
      status = "down";
    else if (w.failures_count > 0) status = "warn";
    else if (w.last_status != null && w.last_status < 400) status = "ok";
    webhookInfo[conn.id] = { id: w.id, status, lastStatus: w.last_status };
  }

  return (
    <ConnectionsView
      initialConnections={connections ?? []}
      connectionsLimit={connectionsLimit}
      signupEnabled={process.env.NEXT_PUBLIC_EMBEDDED_SIGNUP_ENABLED === "true"}
      hasMetaApi={hasMetaApi}
      qrEnabled={isEvolutionConfigured(evolutionCfg)}
      limitOverride={isSuperAdmin(session.user.email)}
      webhookInfo={webhookInfo}
    />
  );
}
