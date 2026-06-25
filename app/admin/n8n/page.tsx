import { createAdminClient } from "@/lib/supabase/admin";
import { N8nManager, type AdminWebhookRow } from "@/components/admin/n8n-manager";

export const dynamic = "force-dynamic";

export const metadata = { title: "n8n / Workflows · Admin" };

export default async function AdminN8nPage() {
  const admin = createAdminClient();

  const [{ data: webhooks }, { data: orgs }] = await Promise.all([
    admin
      .from("external_webhooks")
      .select(
        "id, org_id, url, use_platform_workflow, active, last_status, failures_count, created_at"
      )
      .order("created_at", { ascending: false }),
    admin.from("organizations").select("id, name"),
  ]);

  const orgNames: Record<string, string> = {};
  for (const org of orgs ?? []) orgNames[org.id] = org.name;

  // Último log (com payload) de cada webhook, para o botão "Reenviar"
  const ids = (webhooks ?? []).map((w) => w.id);
  const lastLog: Record<string, { id: string; created_at: string }> = {};
  if (ids.length > 0) {
    const { data: logs } = await admin
      .from("webhook_logs")
      .select("id, webhook_id, created_at, payload")
      .in("webhook_id", ids)
      .order("created_at", { ascending: false })
      .limit(500);
    for (const log of logs ?? []) {
      // mantém apenas o mais recente com payload salvo (necessário p/ reenvio)
      if (!lastLog[log.webhook_id] && log.payload) {
        lastLog[log.webhook_id] = { id: log.id, created_at: log.created_at };
      }
    }
  }

  const rows: AdminWebhookRow[] = (webhooks ?? []).map((w) => ({
    id: w.id,
    orgName: orgNames[w.org_id] ?? w.org_id,
    url: w.url,
    usePlatformWorkflow: w.use_platform_workflow,
    active: w.active,
    lastStatus: w.last_status,
    failuresCount: w.failures_count,
    lastLogId: lastLog[w.id]?.id ?? null,
    lastLogAt: lastLog[w.id]?.created_at ?? null,
  }));

  return <N8nManager initialWebhooks={rows} />;
}
