import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { generateAgentReply } from "@/lib/claude";

/**
 * "✨ Gerar nota com IA" — cria uma nota interna estruturada a partir do
 * histórico da conversa. O texto volta para o campo de notas, onde o usuário
 * pode editar antes de salvar.
 */

const NOTE_SYSTEM_PROMPT = `Você gera notas internas curtas para equipes de atendimento no WhatsApp.
Com base na conversa, escreva uma nota em português brasileiro neste formato (texto puro, sem markdown):

Motivo do contato: …
Situação atual: …
Próximos passos: …

Seja direto: no máximo 2 linhas por item. Não invente informações.`;

export async function POST(request: Request) {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Claude API não configurada — adicione a ANTHROPIC_API_KEY." },
      { status: 502 }
    );
  }

  let body: { conversation_id?: string };
  try {
    body = (await request.json()) as { conversation_id?: string };
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }
  if (!body.conversation_id) {
    return NextResponse.json({ error: "conversation_id é obrigatório" }, { status: 400 });
  }

  const supabase = await createServerSupabase();

  // RLS garante o acesso somente a conversas da organização
  const { data: messages } = await supabase
    .from("messages")
    .select("direction, sender_type, content")
    .eq("conversation_id", body.conversation_id)
    .order("created_at", { ascending: false })
    .limit(30);

  const history = (messages ?? []).reverse().filter((m) => m.content.trim());
  if (history.length === 0) {
    return NextResponse.json(
      { error: "A conversa ainda não tem mensagens para resumir." },
      { status: 400 }
    );
  }

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
    .join("\n")
    .slice(0, 12_000);

  const result = await generateAgentReply({
    systemPrompt: NOTE_SYSTEM_PROMPT,
    history: [],
    userMessage: transcript,
    orgId: session.profile.org_id,
    agentId: null,
    conversationId: body.conversation_id,
    source: "ai_note",
    enforceLimit: false,
    maxTokensOverride: 512,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "A IA não retornou texto." }, { status: 502 });
  }

  return NextResponse.json({ note: result.text });
}
