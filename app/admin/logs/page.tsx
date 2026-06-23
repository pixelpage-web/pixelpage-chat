import { createAdminClient } from "@/lib/supabase/admin";
import { LogsViewer } from "@/components/admin/logs-viewer";
import { HelpCard } from "@/components/ui/help-card";

export const metadata = { title: "Logs · Admin" };

export default async function AdminLogsPage() {
  const admin = createAdminClient();

  const [{ data: logs }, { data: orgs }, { data: failedDeliveries }, { data: qrDown }] =
    await Promise.all([
      admin
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
      admin.from("organizations").select("id, name"),
      admin
        .from("webhook_logs")
        .select("id, webhook_id, event, status_code, error, created_at, payload")
        .not("error", "is", null)
        .order("created_at", { ascending: false })
        .limit(30),
      admin
        .from("whatsapp_connections")
        .select("id, org_id, label, phone_display, status, connection_type")
        .eq("connection_type", "qr_code")
        .eq("status", "disconnected"),
    ]);

  const orgNames: Record<string, string> = {};
  for (const org of orgs ?? []) orgNames[org.id] = org.name;

  // Liga cada disparo falho à org dona do webhook
  const webhookIds = [...new Set((failedDeliveries ?? []).map((d) => d.webhook_id))];
  const { data: webhooks } = webhookIds.length
    ? await admin.from("external_webhooks").select("id, org_id, url").in("id", webhookIds)
    : { data: [] };
  const webhookInfo: Record<string, { org: string; url: string }> = {};
  for (const w of webhooks ?? []) {
    webhookInfo[w.id] = { org: orgNames[w.org_id] ?? w.org_id, url: w.url };
  }

  return (
    <>
      <div className="mx-auto max-w-4xl px-4 pt-4 sm:px-6">
        <HelpCard>
          Eventos em tempo real — use filtros para achar problemas.
        </HelpCard>
      </div>
      <LogsViewer
      initialLogs={logs ?? []}
      orgNames={orgNames}
      failedDeliveries={(failedDeliveries ?? []).map((d) => ({
        id: d.id,
        event: d.event,
        status_code: d.status_code,
        error: d.error,
        created_at: d.created_at,
        has_payload: d.payload !== null,
        org: webhookInfo[d.webhook_id]?.org ?? "—",
        url: webhookInfo[d.webhook_id]?.url ?? "—",
      }))}
      qrDown={(qrDown ?? []).map((c) => ({
        id: c.id,
        label: c.label,
        phone_display: c.phone_display,
        org: orgNames[c.org_id] ?? c.org_id,
      }))}
      />
    </>
  );
}
