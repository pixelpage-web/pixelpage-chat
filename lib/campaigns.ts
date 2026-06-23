import { createAdminClient } from "@/lib/supabase/admin";
import { canSend, sendText } from "@/lib/send";

/**
 * Motor de campanhas (disparos em massa).
 * Processa em LOTES (padrão 40 envios por chamada, ~1,1s entre envios) para
 * caber no tempo de execução serverless; campanhas grandes continuam no
 * próximo tick do cron (/api/campaigns/run) até concluir.
 */

const DELAY_MS = 1100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function processCampaignBatch(
  campaignId: string,
  maxItems = 40
): Promise<{ processed: number; remaining: number }> {
  const admin = createAdminClient();

  const { data: campaign } = await admin
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign || campaign.status === "completed" || campaign.status === "failed") {
    return { processed: 0, remaining: 0 };
  }

  // Conexão precisa estar apta a enviar
  const { data: connection } = campaign.connection_id
    ? await admin
        .from("whatsapp_connections")
        .select("connection_type, phone_number_id, evolution_instance_id, status")
        .eq("id", campaign.connection_id)
        .maybeSingle()
    : { data: null };

  if (!connection || !canSend(connection)) {
    await admin
      .from("campaigns")
      .update({ status: "failed" })
      .eq("id", campaignId);
    await admin.from("audit_logs").insert({
      org_id: campaign.org_id,
      action: "campaign.failed",
      metadata: { campaign_id: campaignId, reason: "conexão indisponível" },
    });
    return { processed: 0, remaining: 0 };
  }

  if (campaign.status !== "running") {
    await admin.from("campaigns").update({ status: "running" }).eq("id", campaignId);
  }

  // Contatos bloqueados não recebem disparos
  const { data: blockedRows } = await admin
    .from("contacts")
    .select("phone")
    .eq("org_id", campaign.org_id)
    .eq("blocked", true);
  const blocked = new Set((blockedRows ?? []).map((b) => b.phone));

  const { data: pending } = await admin
    .from("campaign_contacts")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .limit(maxItems);

  let sent = 0;
  let failed = 0;

  for (const item of pending ?? []) {
    if (blocked.has(item.phone)) {
      await admin
        .from("campaign_contacts")
        .update({ status: "failed", error: "contato bloqueado" })
        .eq("id", item.id);
      failed++;
      continue;
    }

    const result = await sendText(connection, item.phone, campaign.message_text);
    if (result.ok) {
      await admin
        .from("campaign_contacts")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", item.id);
      sent++;
    } else {
      await admin
        .from("campaign_contacts")
        .update({ status: "failed", error: result.error })
        .eq("id", item.id);
      failed++;
    }
    await sleep(DELAY_MS);
  }

  // Atualiza contadores agregados
  if (sent > 0 || failed > 0) {
    await admin
      .from("campaigns")
      .update({
        sent: campaign.sent + sent,
        delivered: campaign.delivered + sent, // entregue ≈ aceito pelo provedor
        failed: campaign.failed + failed,
      })
      .eq("id", campaignId);
  }

  const { count: remaining } = await admin
    .from("campaign_contacts")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("status", "pending");

  if ((remaining ?? 0) === 0) {
    const { data: fresh } = await admin
      .from("campaigns")
      .select("sent, failed, total_contacts")
      .eq("id", campaignId)
      .maybeSingle();
    const allFailed = (fresh?.sent ?? 0) === 0 && (fresh?.failed ?? 0) > 0;
    await admin
      .from("campaigns")
      .update({ status: allFailed ? "failed" : "completed" })
      .eq("id", campaignId);
  }

  return { processed: sent + failed, remaining: remaining ?? 0 };
}

/** Total de mensagens de campanha enviadas pela org no mês corrente. */
export async function campaignUsageThisMonth(orgId: string): Promise<number> {
  const admin = createAdminClient();
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  ).toISOString();

  const { data: campaigns } = await admin
    .from("campaigns")
    .select("id")
    .eq("org_id", orgId)
    .gte("created_at", monthStart);
  const ids = (campaigns ?? []).map((c) => c.id);
  if (ids.length === 0) return 0;

  const { count } = await admin
    .from("campaign_contacts")
    .select("id", { count: "exact", head: true })
    .in("campaign_id", ids);
  return count ?? 0;
}
