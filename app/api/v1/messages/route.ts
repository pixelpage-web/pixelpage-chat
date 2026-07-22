import { guardApiV1 } from "@/lib/api-guard";
import { apiOk, apiError } from "@/lib/api-response";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseReplyToken } from "@/lib/external-webhook";
import { canSend, sendText as sendUnifiedText } from "@/lib/send";
import { isSubscriptionBlocked } from "@/lib/billing";

/**
 * API pública — POST /api/v1/messages
 * Envia uma mensagem em nome da organização (ex.: resposta do n8n).
 *
 * Autenticação: Authorization: Bearer <api_key> (ou X-Api-Key)
 * Body: { conversation_id | reply_token | to, text, handoff? }
 *   - handoff: true  → pausa o bot na conversa e transfere para humano
 * Identificação da conversa (uma das opções):
 *   - conversation_id  → ID direto da conversa
 *   - reply_token      → token recebido no payload do webhook externo
 *   - to               → telefone E.164; cria/encontra a conversa
 */

interface SendBody {
  conversation_id?: string;
  reply_token?: string;
  to?: string;
  text?: string;
  handoff?: boolean;
}

export async function POST(request: Request) {
  const guard = await guardApiV1(request);
  if (!guard.ok) return guard.response;
  const { auth, headers } = guard;

  let body: SendBody;
  try {
    body = (await request.json()) as SendBody;
  } catch {
    return apiError("JSON inválido", { status: 400, headers });
  }

  const text = body.text?.trim();
  if (!text) {
    return apiError("Campo 'text' é obrigatório", { status: 400, headers });
  }
  if (text.length > 4096) {
    return apiError("Campo 'text' excede o limite de 4096 caracteres", {
      status: 400,
      headers,
    });
  }

  const admin = createAdminClient();

  // Bloqueio por assinatura
  const { data: subscription } = await admin
    .from("subscriptions")
    .select("status, trial_ends_at, current_period_end")
    .eq("org_id", auth.orgId)
    .maybeSingle();
  if (await isSubscriptionBlocked(auth.orgId, subscription ?? null)) {
    return apiError(
      "Plano expirado — regularize a assinatura para enviar mensagens.",
      { status: 403, headers }
    );
  }

  // ---------------------------------------------------------------------
  // Resolve a conversa (conversation_id, reply_token ou telefone)
  // ---------------------------------------------------------------------
  let conversationId: string | null = body.conversation_id ?? null;

  if (!conversationId && body.reply_token) {
    const { data: webhooks } = await admin
      .from("external_webhooks")
      .select("secret")
      .eq("org_id", auth.orgId);
    for (const w of webhooks ?? []) {
      const parsed = parseReplyToken(w.secret, body.reply_token);
      if (parsed) {
        conversationId = parsed;
        break;
      }
    }
    if (!conversationId) {
      return apiError("reply_token inválido", { status: 400, headers });
    }
  }

  let conversation: {
    id: string;
    org_id: string;
    contact_id: string;
    connection_id: string | null;
  } | null = null;

  if (conversationId) {
    const { data } = await admin
      .from("conversations")
      .select("id, org_id, contact_id, connection_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (!data || data.org_id !== auth.orgId) {
      return apiError("Conversa não encontrada", { status: 404, headers });
    }
    conversation = data;
  } else if (body.to) {
    const phone = body.to.replace(/\D/g, "");
    if (phone.length < 10) {
      return apiError(
        "Campo 'to' deve ser um telefone E.164 (ex.: 5511999998888)",
        { status: 400, headers }
      );
    }

    let { data: contact } = await admin
      .from("contacts")
      .select("id")
      .eq("org_id", auth.orgId)
      .eq("phone", phone)
      .maybeSingle();
    if (!contact) {
      const { data: created } = await admin
        .from("contacts")
        .insert({ org_id: auth.orgId, phone })
        .select("id")
        .single();
      contact = created;
    }
    if (!contact) {
      return apiError("Falha ao registrar o contato", { status: 500, headers });
    }

    const { data: connection } = await admin
      .from("whatsapp_connections")
      .select("id")
      .eq("org_id", auth.orgId)
      .eq("status", "connected")
      .limit(1)
      .maybeSingle();

    const { data: existing } = await admin
      .from("conversations")
      .select("id, org_id, contact_id, connection_id")
      .eq("org_id", auth.orgId)
      .eq("contact_id", contact.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      conversation = existing;
    } else {
      const { data: created } = await admin
        .from("conversations")
        .insert({
          org_id: auth.orgId,
          contact_id: contact.id,
          connection_id: connection?.id ?? null,
        })
        .select("id, org_id, contact_id, connection_id")
        .single();
      conversation = created;
    }
  }

  if (!conversation) {
    return apiError("Informe conversation_id, reply_token ou to", {
      status: 400,
      headers,
    });
  }

  // ---------------------------------------------------------------------
  // Envia pela conexão real (Meta/Evolution) e salva no histórico
  // ---------------------------------------------------------------------
  const { data: contactRow } = await admin
    .from("contacts")
    .select("phone")
    .eq("id", conversation.contact_id)
    .maybeSingle();

  let metaMessageId: string | null = null;
  if (conversation.connection_id && contactRow) {
    const { data: connection } = await admin
      .from("whatsapp_connections")
      .select("connection_type, phone_number_id, evolution_instance_id, status")
      .eq("id", conversation.connection_id)
      .maybeSingle();
    if (connection && canSend(connection)) {
      const result = await sendUnifiedText(connection, contactRow.phone, text);
      if (!result.ok) {
        return apiError(`Falha no envio pelo WhatsApp: ${result.error}`, {
          status: 502,
          headers,
        });
      }
      metaMessageId = result.providerMessageId;
    }
  }

  const { data: message, error } = await admin
    .from("messages")
    .insert({
      conversation_id: conversation.id,
      direction: "outbound",
      sender_type: "external",
      content: text,
      message_type: "text",
      meta_message_id: metaMessageId,
    })
    .select("id, conversation_id, content, created_at")
    .single();

  if (error || !message) {
    return apiError("Falha ao salvar a mensagem", { status: 500, headers });
  }

  // handoff: pausa o bot nesta conversa e a marca como pendente (humano assume)
  if (body.handoff === true) {
    await admin
      .from("conversations")
      .update({ bot_paused: true, status: "pending" })
      .eq("id", conversation.id);
  }

  return apiOk(
    {
      message: {
        id: message.id,
        conversation_id: message.conversation_id,
        text: message.content,
        created_at: message.created_at,
      },
      handoff: body.handoff === true,
    },
    { status: 201, headers }
  );
}
