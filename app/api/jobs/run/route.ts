import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendCsatSurvey } from "@/lib/csat";
import { resumeFlow } from "@/lib/flow-runner";
import { runScheduledAutomationCheck } from "@/lib/automations";

/**
 * Cron de jobs agendados — chame a cada minuto (Vercel Cron):
 *   GET /api/jobs/run  (Authorization: Bearer CRON_SECRET ou ?key=)
 *
 * Tipos de job (tabela scheduled_jobs):
 *   csat_send        → envia a pesquisa CSAT após o atraso configurado
 *   flow_resume      → retoma o fluxo após o bloco "Aguardar"
 *   automation_check → "sem resposta há X horas" e "conversa resolvida"
 */

export const runtime = "nodejs";
export const maxDuration = 60;

interface JobPayload {
  conversation_id?: string;
  flow_id?: string;
  resume_node_id?: string;
  trigger?: string;
  rule_id?: string;
  message_at?: string;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 503 });
  }
  const url = new URL(request.url);
  const header = request.headers.get("authorization");
  const ok =
    header === `Bearer ${secret}` || url.searchParams.get("key") === secret;
  if (!ok) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: due } = await admin
    .from("scheduled_jobs")
    .select("*")
    .eq("status", "pending")
    .lte("run_at", nowIso)
    .order("run_at", { ascending: true })
    .limit(25);

  let processed = 0;
  let failed = 0;

  for (const job of due ?? []) {
    // Reivindica o job (evita processamento duplo em crons concorrentes)
    const { data: claimed } = await admin
      .from("scheduled_jobs")
      .update({ status: "done" })
      .eq("id", job.id)
      .eq("status", "pending")
      .select("id");
    if (!claimed?.length) continue;

    const payload = (job.payload ?? {}) as JobPayload;
    try {
      if (job.job_type === "csat_send") {
        await processCsatSend(admin, payload);
      } else if (job.job_type === "flow_resume") {
        if (payload.conversation_id && payload.flow_id && payload.resume_node_id) {
          await resumeFlow({
            admin,
            conversationId: payload.conversation_id,
            flowId: payload.flow_id,
            resumeNodeId: payload.resume_node_id,
          });
        }
      } else if (job.job_type === "automation_check") {
        await runScheduledAutomationCheck(admin, payload);
      }
      processed += 1;
    } catch (err) {
      failed += 1;
      await admin
        .from("scheduled_jobs")
        .update({
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        })
        .eq("id", job.id);
    }
  }

  return NextResponse.json({ due: due?.length ?? 0, processed, failed });
}

/** Envia a pesquisa CSAT se a conversa continua resolvida e sem pesquisa. */
async function processCsatSend(
  admin: ReturnType<typeof createAdminClient>,
  payload: JobPayload
): Promise<void> {
  if (!payload.conversation_id) return;

  const { data: conversation } = await admin
    .from("conversations")
    .select("id, org_id, connection_id, contact_id, status, csat_sent_at")
    .eq("id", payload.conversation_id)
    .maybeSingle();
  // Reaberta nesse meio tempo ou já avaliada → não envia
  if (
    !conversation ||
    conversation.status !== "resolved" ||
    conversation.csat_sent_at ||
    !conversation.connection_id
  ) {
    return;
  }

  const [{ data: connection }, { data: contact }] = await Promise.all([
    admin
      .from("whatsapp_connections")
      .select("*")
      .eq("id", conversation.connection_id)
      .maybeSingle(),
    admin
      .from("contacts")
      .select("phone")
      .eq("id", conversation.contact_id)
      .maybeSingle(),
  ]);
  if (!connection || !connection.csat_enabled || !contact) return;

  await sendCsatSurvey(admin, connection, conversation, contact.phone);
}
