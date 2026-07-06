import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateConversationSummary } from "@/lib/summary";
import type { Json } from "@/types/database";

/**
 * Resumo de conversa por IA no inbox:
 *   POST   { conversation_id } → gera e fixa o resumo (ao assumir atendimento)
 *   DELETE ?conversation_id=   → fecha o resumo (botão ✕)
 */

export async function POST(request: Request) {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
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

  // RLS valida que a conversa é da organização do usuário
  const supabase = await createServerSupabase();
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", body.conversation_id)
    .maybeSingle();
  if (!conversation) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }

  // Geração usa o admin client (mesmo caminho do pipeline)
  const admin = createAdminClient();
  const summary = await generateConversationSummary(
    admin,
    conversation.id,
    session.profile.org_id
  );
  if (!summary) {
    return NextResponse.json(
      { error: "Não foi possível gerar o resumo. Verifique a chave da Claude API." },
      { status: 502 }
    );
  }

  return NextResponse.json({ summary });
}

export async function DELETE(request: Request) {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get("conversation_id");
  if (!conversationId) {
    return NextResponse.json({ error: "conversation_id é obrigatório" }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("conversations")
    .update({ ai_summary: null as unknown as Json })
    .eq("id", conversationId);
  if (error) {
    return NextResponse.json({ error: "Não foi possível fechar o resumo." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
