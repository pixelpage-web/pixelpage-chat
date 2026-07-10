import type { SupabaseClient } from "@supabase/supabase-js";
import { sendText } from "@/lib/send";
import type { Database, WhatsappConnectionRow } from "@/types/database";

/**
 * CSAT — pesquisa de satisfação pós-atendimento.
 * O envio acontece pelo job agendado (delay configurável na conexão) ou pelo
 * bloco "Pesquisa de satisfação" do builder de fluxos. A captura da nota
 * (resposta 1–5) acontece no pipeline de mensagens recebidas.
 */

type AdminClient = SupabaseClient<Database>;

export const DEFAULT_CSAT_MESSAGE = [
  "Como foi seu atendimento hoje? 😊",
  "Responda com um número:",
  "1 ⭐ Ruim",
  "2 ⭐⭐ Regular",
  "3 ⭐⭐⭐ Bom",
  "4 ⭐⭐⭐⭐ Ótimo",
  "5 ⭐⭐⭐⭐⭐ Excelente",
].join("\n");

/** Janela em que uma resposta numérica é interpretada como nota de CSAT. */
const CSAT_RESPONSE_WINDOW_MS = 7 * 24 * 3_600_000;

/**
 * Envia a pesquisa CSAT para a conversa e marca csat_sent_at.
 * Retorna false quando a conexão não está apta a enviar.
 */
export async function sendCsatSurvey(
  admin: AdminClient,
  connection: WhatsappConnectionRow,
  conversation: { id: string; csat_sent_at: string | null },
  contactPhone: string
): Promise<boolean> {
  if (conversation.csat_sent_at) return false;

  const text = connection.csat_message?.trim() || DEFAULT_CSAT_MESSAGE;
  const result = await sendText(connection, contactPhone, text);
  if (!result.ok) {
    await admin.from("audit_logs").insert({
      org_id: connection.org_id,
      action: "csat.send_failed",
      metadata: { conversation_id: conversation.id, error: result.error },
    });
    return false;
  }

  await admin.from("messages").insert({
    conversation_id: conversation.id,
    direction: "outbound",
    sender_type: "ai_bot",
    content: text,
    message_type: "text",
    meta_message_id: result.providerMessageId,
  });
  await admin
    .from("conversations")
    .update({ csat_sent_at: new Date().toISOString() })
    .eq("id", conversation.id);
  return true;
}

/** Extrai a nota 1–5 de uma resposta do cliente ("4", "nota 5", "5 ⭐"…). */
export function parseCsatScore(text: string): number | null {
  const match = text.trim().match(/^\D{0,8}([1-5])\D{0,12}$/u);
  if (!match) return null;
  return Number(match[1]);
}

/**
 * Se a conversa está aguardando avaliação e a mensagem é uma nota válida,
 * registra a resposta e retorna true (a mensagem NÃO deve seguir para o bot).
 */
export async function maybeCaptureCsatResponse(
  admin: AdminClient,
  connection: WhatsappConnectionRow,
  conversation: {
    id: string;
    org_id: string;
    contact_id: string;
    assigned_to: string | null;
    csat_sent_at: string | null;
    unit_id: string | null;
  },
  contactPhone: string,
  incomingText: string
): Promise<boolean> {
  if (!conversation.csat_sent_at) return false;
  const sentAt = new Date(conversation.csat_sent_at).getTime();
  if (Date.now() - sentAt > CSAT_RESPONSE_WINDOW_MS) return false;

  const score = parseCsatScore(incomingText);
  if (score === null) return false;

  // Uma única avaliação por pesquisa enviada
  const { data: existing } = await admin
    .from("csat_responses")
    .select("id")
    .eq("conversation_id", conversation.id)
    .gte("created_at", conversation.csat_sent_at)
    .limit(1)
    .maybeSingle();
  if (existing) return false;

  await admin.from("csat_responses").insert({
    org_id: conversation.org_id,
    conversation_id: conversation.id,
    contact_id: conversation.contact_id,
    agent_id: conversation.assigned_to,
    unit_id: conversation.unit_id,
    score,
  });

  // Agradece a avaliação (mensagem fixa, não consome IA)
  const thanks = "Obrigado pela sua avaliação! 💚";
  const result = await sendText(connection, contactPhone, thanks);
  if (result.ok) {
    await admin.from("messages").insert({
      conversation_id: conversation.id,
      direction: "outbound",
      sender_type: "ai_bot",
      content: thanks,
      message_type: "text",
      meta_message_id: result.providerMessageId,
    });
  }

  // Avaliação não reabre o atendimento
  await admin
    .from("conversations")
    .update({ status: "resolved" })
    .eq("id", conversation.id);

  return true;
}
