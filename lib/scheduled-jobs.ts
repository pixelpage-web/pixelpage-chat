import type { SupabaseClient } from "@supabase/supabase-js";
import { sendCsatSurvey } from "@/lib/csat";
import { resumeFlow } from "@/lib/flow-runner";
import { runScheduledAutomationCheck } from "@/lib/automations";
import type { Database } from "@/types/database";

/**
 * Processamento de scheduled_jobs pendentes — núcleo compartilhado entre:
 *   - app/api/jobs/run/route.ts (cron diário, rede de segurança para todas as orgs)
 *   - lib/pipeline.ts (checagem "de ponte" disparada por tráfego real de uma
 *     org específica — ver shouldCheckDueJobs logo abaixo)
 */

type AdminClient = SupabaseClient<Database>;

interface JobPayload {
  conversation_id?: string;
  flow_id?: string;
  resume_node_id?: string;
  trigger?: string;
  rule_id?: string;
  message_at?: string;
}

export interface ProcessDueJobsResult {
  due: number;
  processed: number;
  failed: number;
}

/** Processa jobs com run_at vencido e status='pending', mais antigo primeiro. */
export async function processDueJobs(
  admin: AdminClient,
  opts?: { orgId?: string; limit?: number }
): Promise<ProcessDueJobsResult> {
  const nowIso = new Date().toISOString();

  let query = admin
    .from("scheduled_jobs")
    .select("*")
    .eq("status", "pending")
    .lte("run_at", nowIso)
    .order("run_at", { ascending: true })
    .limit(opts?.limit ?? 25);
  if (opts?.orgId) query = query.eq("org_id", opts.orgId);

  const { data: due } = await query;

  let processed = 0;
  let failed = 0;

  for (const job of due ?? []) {
    // Reivindica o job (evita processamento duplo entre cron e checagem de ponte,
    // ou entre execuções concorrentes de qualquer uma delas)
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

  return { due: due?.length ?? 0, processed, failed };
}

/** Envia a pesquisa CSAT se a conversa continua resolvida e sem pesquisa. */
async function processCsatSend(admin: AdminClient, payload: JobPayload): Promise<void> {
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

// ── Ponte para o limite de cron do plano Hobby da Vercel ───────────────────
//
// vercel.json roda /api/jobs/run só 1x/dia (limite do plano gratuito; o Pro
// permite granularidade de minuto). Sem isso, um bloco "Aguardar" de fluxo,
// CSAT com atraso configurado, ou automação "sem resposta há X horas" só
// resolveria de verdade até ~24h depois do previsto. Esta checagem roda a
// partir de tráfego real (chamada por lib/pipeline.ts dentro do after() do
// webhook) para resolver jobs vencidos da MESMA org assim que ela tiver
// qualquer mensagem chegando — não substitui o cron diário, que continua
// como rede de segurança para orgs sem tráfego recente.
//
// Limitado a 1x a cada BRIDGE_CHECK_INTERVAL_MS por org via cache em memória
// — mesmo padrão best-effort de lib/rate-limit.ts (em serverless, cada
// instância tem seu próprio cache; na pior hipótese isso só significa checar
// um pouco mais vezes que o estritamente necessário, nunca menos).
const BRIDGE_CHECK_INTERVAL_MS = 5 * 60_000;
const lastCheckedAt = new Map<string, number>();

/** true no máximo 1x a cada BRIDGE_CHECK_INTERVAL_MS por org (já marca o horário). */
export function shouldCheckDueJobs(orgId: string): boolean {
  const now = Date.now();
  const last = lastCheckedAt.get(orgId) ?? 0;
  if (now - last < BRIDGE_CHECK_INTERVAL_MS) return false;
  lastCheckedAt.set(orgId, now);

  // Limpeza ocasional para não acumular orgs antigas
  if (lastCheckedAt.size > 5000) {
    for (const [k, v] of lastCheckedAt) {
      if (now - v > BRIDGE_CHECK_INTERVAL_MS) lastCheckedAt.delete(k);
    }
  }
  return true;
}
