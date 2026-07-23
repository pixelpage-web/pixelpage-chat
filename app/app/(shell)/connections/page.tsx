import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { getEvolutionConfig, isEvolutionConfigured } from "@/lib/evolution";
import { hasFeatureAccess, isSuperAdmin } from "@/lib/access";
import { getPlanFeatures } from "@/lib/plan-features";
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

  // planFeatures reaproveita a mesma assinatura que layout.tsx já buscou
  // (getOrgSubscriptionSummary tem cache() do React) e traz connections_limit
  // + name + meta_api_enabled numa única query de `plans` — antes essa
  // página buscava a assinatura de novo via RPC, mais uma query de plans
  // dentro de orgHasMetaApi, e mais uma terceira query de plans explícita
  // aqui embaixo (3 idas ao banco pra basicamente a mesma linha).
  // external_webhooks entrou pro mesmo Promise.all — não depende de plano.
  const [{ data: connections }, planFeatures, { data: webhooks }, evolutionCfg] =
    await Promise.all([
      supabase
        .from("whatsapp_connections")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: true }),
      getPlanFeatures(orgId),
      // Status do webhook externo por conexão (Tarefa 4): verde/âmbar/vermelho
      supabase
        .from("external_webhooks")
        .select("id, connection_id, active, last_status, failures_count")
        .eq("org_id", orgId),
      getEvolutionConfig(),
    ]);

  // null em connections_limit = plano sem limite; sem assinatura (org nova/
  // sem plano) cai pro default 1, mesmo comportamento de antes.
  const connectionsLimit = planFeatures ? planFeatures.connections_limit : 1;
  const planName = planFeatures?.name ?? "Free";

  // Simplificação de UI pro plano básico: opção "Webhook" só aparece no
  // seletor a partir do Pro. Super Admin sempre enxerga tudo.
  const isBasicPlan = planName === "Free" || planName === "Starter";
  const webhookModeAccess = hasFeatureAccess({
    userEmail: session.user.email,
    hasNormalAccess: !isBasicPlan,
    requiredPlan: "Pro",
  });

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
      hasMetaApi={planFeatures?.meta_api_enabled === true}
      qrEnabled={isEvolutionConfigured(evolutionCfg)}
      limitOverride={isSuperAdmin(session.user.email)}
      webhookInfo={webhookInfo}
      showWebhookMode={webhookModeAccess.access}
    />
  );
}
