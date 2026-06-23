import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-keys";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseReplyToken } from "@/lib/external-webhook";
import { canSend, sendText as sendUnifiedText } from "@/lib/send";
import { isSubscriptionBlocked } from "@/lib/billing";

/**
 * API pública — POST /api/v1/messages
 * Envia uma mensagem em nome da organização (ex.: resposta do n8n).
 *
 * Autenticação: Authorization: Bearer <api_key> (ou X-Api-Key)
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
}

export async function POST(request: Request) {
  const auth = await authenticateApiKey(request);
  if (!auth) {
    return NextResponse.json(
      { error: "API key inválida ou ausente. Use Authorization: Bearer zari_..." },
      { status: 401 }
    );
  }
  const rl = checkRateLimit(auth.keyId);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit excedido (60 req/min)" },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  let body: SendBody;
  try {
    body = (await request.json()) as SendBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "Campo 'text' é obrigatório" }, { status: 400 });
  }
  if (text.length > 4096) {
    return NextResponse.json(
      { error: "Campo 'text' excede o limite de 4096 caracteres" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Bloqueio por assinatura
  const { data: subscription } = await admin
    .from("subscriptions")
    .select("status, trial_ends_at")
    .eq("org_id", auth.orgId)
    .maybeSingle();
  if (isSubscriptionBlocked(subscription ?? null)) {
    return NextResponse.json(
      { error: "Plano expirado — regularize a assinatura para enviar mensagens." },
      { status: 403 }
    );
  }

  // ---------------------------------------------------------------------
  // Resolve a conversa
  // ---------------------------------------------------------------------
  let conversationId: string | null = body.conversation_id ?? null;

  if (!conversationId && body.reply_token) {
    // Valida o token contra os secrets dos webhooks da organização
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
      return NextResponse.json({ error: "reply_token inválido" }, { status: 400 });
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
      return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
    }
    conversation = data;
  } else if (body.to) {
    // Envio direto por telefone: encontra/cria contato e conversa
    const phone = body.to.replace(/\D/g, "");
    if (phone.length < 10) {
      return NextResponse.json(
        { error: "Campo 'to' deve ser um telefone E.164 (ex.: 5511999998888)" },
        { status: 400 }
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
      return NextResponse.json({ error: "Falha ao registrar o contato" }, { status: 500 });
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
    return NextResponse.json(
      { error: "Informe conversation_id, reply_token ou to" },
      { status: 400 }
    );
  }

  // ---------------------------------------------------------------------
  // Envia pela Meta (quando há conexão real) e salva no histórico
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
        return NextResponse.json(
          { error: `Falha no envio pelo WhatsApp: ${result.error}` },
          { status: 502 }
        );
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
    return NextResponse.json(
      { error: "Falha ao salvar a mensagem" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      message: {
        id: message.id,
        conversation_id: message.conversation_id,
        text: message.content,
        created_at: message.created_at,
      },
    },
    { status: 201, headers: rateLimitHeaders(rl) }
  );
}
