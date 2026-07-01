import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { isSubscriptionBlocked } from "@/lib/billing";
import { isSuperAdmin } from "@/lib/access";
import { canSend, sendText } from "@/lib/send";

interface SendBody {
  conversation_id?: string;
  content?: string;
}

/**
 * Resposta humana pelo inbox:
 * envia via Meta Cloud API (quando há conexão real) e salva no histórico.
 */
export async function POST(request: Request) {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const orgId = session.profile.org_id;

  let body: SendBody;
  try {
    body = (await request.json()) as SendBody;
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const content = body.content?.trim();
  if (!body.conversation_id || !content) {
    return NextResponse.json(
      { error: "conversation_id e content são obrigatórios" },
      { status: 400 }
    );
  }

  const supabase = await createServerSupabase();

  // Bloqueio por assinatura (trial expirado / cancelada → somente leitura).
  // Super Admin não é bloqueado (acesso de demonstração a todos os planos).
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("status, trial_ends_at")
    .eq("org_id", orgId)
    .maybeSingle();
  if (!isSuperAdmin(session.user.email) && isSubscriptionBlocked(subscription ?? null)) {
    return NextResponse.json(
      { error: "Seu plano expirou — faça upgrade para voltar a responder." },
      { status: 403 }
    );
  }

  // Conversa + contato (RLS garante que pertencem à organização do usuário)
  const { data: conversation } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", body.conversation_id)
    .maybeSingle();
  if (!conversation) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }

  const { data: contact } = await supabase
    .from("contacts")
    .select("phone")
    .eq("id", conversation.contact_id)
    .maybeSingle();
  if (!contact) {
    return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 });
  }

  // Envia pelo canal da conexão (Meta ou QR Code) quando ela está ativa
  let metaMessageId: string | null = null;
  if (conversation.connection_id) {
    const { data: connection } = await supabase
      .from("whatsapp_connections")
      .select("connection_type, phone_number_id, evolution_instance_id, status")
      .eq("id", conversation.connection_id)
      .maybeSingle();

    if (connection && canSend(connection)) {
      const result = await sendText(connection, contact.phone, content);
      if (!result.ok) {
        // Não salva mensagem que não chegou ao destinatário
        return NextResponse.json(
          { error: `Falha no envio pelo WhatsApp: ${result.error}` },
          { status: 502 }
        );
      }
      metaMessageId = result.providerMessageId;
    }
  }

  const { data: message, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversation.id,
      direction: "outbound",
      sender_type: "human",
      content,
      message_type: "text",
      meta_message_id: metaMessageId,
    })
    .select("*")
    .single();

  if (error || !message) {
    return NextResponse.json(
      { error: "Mensagem enviada, mas houve falha ao salvar no histórico." },
      { status: 500 }
    );
  }

  // Auto-pausa: sempre que um agente responde manualmente, pausa o bot para
  // que o cliente continue sendo atendido por humano até reativação explícita.
  const wasPaused = conversation.bot_paused;
  if (!wasPaused) {
    await supabase
      .from("conversations")
      .update({ bot_paused: true })
      .eq("id", conversation.id);

    await supabase.from("conversation_notes").insert({
      conversation_id: conversation.id,
      org_id: orgId,
      content: "Bot pausado automaticamente após resposta manual.",
      created_by: session.user.id,
    });
  }

  return NextResponse.json({ message, bot_paused: !wasPaused ? true : undefined });
}
