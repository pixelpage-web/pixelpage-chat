import type { SupabaseClient } from "@supabase/supabase-js";
import { generateAgentReply } from "@/lib/claude";
import type { Database, Json } from "@/types/database";

/**
 * Resumo automático de conversa por IA — gerado quando o atendimento passa
 * do bot para um humano (handoff por fluxo, palavra-chave ou "assumir" no
 * inbox). Fica fixado no topo da conversa (conversations.ai_summary).
 */

type AdminClient = SupabaseClient<Database>;

export interface ConversationSummary {
  motivo: string;
  humor: "Satisfeito" | "Neutro" | "Frustrado" | "Urgente";
  ponto_principal: string;
}

const SUMMARY_SYSTEM_PROMPT = `Você é um assistente que gera resumos de atendimento para agentes humanos.
Analise a conversa e responda EXATAMENTE neste formato JSON:
{
  "motivo": "resumo em 1 linha do motivo do contato",
  "humor": "Satisfeito | Neutro | Frustrado | Urgente",
  "ponto_principal": "a coisa mais importante que o agente precisa saber para dar continuidade"
}
Responda SOMENTE o JSON, sem markdown e sem texto adicional.`;

function parseSummaryJson(text: string): ConversationSummary | null {
  // Tolera cercas de código e texto ao redor — extrai o primeiro objeto JSON
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as Partial<ConversationSummary>;
    if (!parsed.motivo || !parsed.ponto_principal) return null;
    const humor = ["Satisfeito", "Neutro", "Frustrado", "Urgente"].includes(
      parsed.humor ?? ""
    )
      ? (parsed.humor as ConversationSummary["humor"])
      : "Neutro";
    return {
      motivo: String(parsed.motivo).slice(0, 300),
      humor,
      ponto_principal: String(parsed.ponto_principal).slice(0, 400),
    };
  } catch {
    return null;
  }
}

/**
 * Gera o resumo das últimas 20 mensagens e salva em conversations.ai_summary.
 * Falhas são silenciosas (best effort) — o atendimento nunca pode travar por
 * causa do resumo.
 */
export async function generateConversationSummary(
  admin: AdminClient,
  conversationId: string,
  orgId: string
): Promise<ConversationSummary | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const { data: messages } = await admin
    .from("messages")
    .select("direction, sender_type, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(20);

  const history = (messages ?? []).reverse().filter((m) => m.content.trim());
  if (history.length === 0) return null;

  const transcript = history
    .map((m) => {
      const who =
        m.direction === "inbound"
          ? "Cliente"
          : m.sender_type === "ai_bot"
            ? "Bot"
            : "Atendente";
      return `${who}: ${m.content}`;
    })
    .join("\n");

  try {
    const result = await generateAgentReply({
      systemPrompt: SUMMARY_SYSTEM_PROMPT,
      history: [],
      userMessage: transcript.slice(0, 12_000),
      orgId,
      agentId: null,
      conversationId,
      source: "summary",
      enforceLimit: false,
      maxTokensOverride: 512,
    });
    if (!result.ok) return null;

    const summary = parseSummaryJson(result.text);
    if (!summary) return null;

    await admin
      .from("conversations")
      .update({
        ai_summary: {
          ...summary,
          generated_at: new Date().toISOString(),
        } as unknown as Json,
      })
      .eq("id", conversationId);

    return summary;
  } catch (err) {
    console.error("[summary] falha ao gerar resumo:", err);
    return null;
  }
}
