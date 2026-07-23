import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { getEvolutionConfig, isEvolutionConfigured } from "@/lib/evolution";
import { hasFeatureAccess, isSuperAdmin } from "@/lib/access";
import { orgHasMetaApi } from "@/lib/plan-features";
import { canViewNavRoute } from "@/lib/permissions";
import { ConnectionsView } from "@/components/connections/connections-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Conexões" };

export default async function ConnectionsPage() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) redirect("/app/onboarding");
  if (!canViewNavRoute(session.profile.permissions, "/app/connections")) redirect("/app/inbox");
  const orgId = session.profile.org_id;

  const supabase = await createServerSupabase();

  const [{ data: connections }, { data: subscriptionRows }, hasMetaApi] =
    await Promise.all([
      supabase
        .from("whatsapp_connections")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: true }),
      // subscriptions restrita a owner/admin (0045) — plan_id via RPC segura.
      supabase.rpc("get_org_subscription_summary", { p_org_id: orgId }),
      orgHasMetaApi(orgId),
    ]);
  const subscription = subscriptionRows?.[0] ?? null;

  let connectionsLimit: number | null = 1;
  let planName = "Free";
  if (subscription?.plan_id) {
    const { data: plan } = await supabase
      .from("plans")
      .select("connections_limit, name")
      .eq("id", subscription.plan_id)
      .maybeSingle();
    // null em connections_limit = plano sem limite; só cai pro default 1 se o
    // plano em si não foi encontrado (não confundir "sem limite" com "sem plano").
    connectionsLimit = plan ? plan.connections_limit : 1;
    planName = plan?.name ?? "Free";
  }

  // Simplificação de UI pro plano básico: opção "Webhook" só aparece no
  // seletor a partir do Pro. Super Admin sempre enxerga tudo.
  const isBasicPlan = planName === "Free" || planName === "Starter";
  const webhookModeAccess = hasFeatureAccess({
    userEmail: session.user.email,
    hasNormalAccess: !isBasicPlan,
    requiredPlan: "Pro",
  });

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
      orgId={orgId}
      initialConnections={connections ?? []}
      connectionsLimit={connectionsLimit}
      hasMetaApi={hasMetaApi}
      qrEnabled={isEvolutionConfigured(evolutionCfg)}
      limitOverride={isSuperAdmin(session.user.email)}
      webhookInfo={webhookInfo}
      showWebhookMode={webhookModeAccess.access}
    />
  );
}
