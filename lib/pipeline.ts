import { createAdminClient } from "@/lib/supabase/admin";
import { sendText, type SendableConnection } from "@/lib/send";
import {
  buildAgentSystemPrompt,
  generateAgentReply,
  matchesHandoffKeyword,
  type ChatTurn,
} from "@/lib/claude";
import {
  isWithinBusinessHours,
  parseBusinessHoursConfig,
} from "@/lib/business-hours";
import { isSubscriptionBlocked } from "@/lib/billing";
import {
  buildReplyToken,
  deliverToWebhook,
  type ZariWebhookPayload,
} from "@/lib/external-webhook";
import { maybeCaptureCsatResponse } from "@/lib/csat";
import { runInboundAutomations } from "@/lib/automations";
import { runFlowForMessage } from "@/lib/flow-runner";
import { getAgentKnowledge } from "@/lib/knowledge";
import { generateConversationSummary } from "@/lib/summary";
import type { MessageType, WhatsappConnectionRow } from "@/types/database";

/**
 * Pipeline de mensagens recebidas — comum aos DOIS canais:
 *   Meta Cloud API (api oficial)  → processMetaWebhook
 *   Evolution API (QR Code)       → processEvolutionWebhook
 * Identifica o tenant → salva contato/conversa/mensagem → roteia pelo modo
 * (manual / ai_bot / external_webhook). Roda APÓS o 200 (processamento async).
 */

// ============================================================================
// Núcleo independente de canal
// ============================================================================

export interface InboundMessage {
  /** id da mensagem no provedor (wamid / key.id) — usado para dedupe */
  externalId: string;
  fromPhone: string;
  contactName: string | null;
  content: string;
  messageType: MessageType;
  mediaUrl: string | null;
  timestamp: string; // ISO
  /** true quando a mensagem foi enviada PELO próprio número (celular) */
  fromMe: boolean;
}

export async function handleInboundMessage(
  connection: WhatsappConnectionRow,
  msg: InboundMessage
): Promise<void> {
  const admin = createAdminClient();

  // Organização suspensa não processa nada
  const { data: org } = await admin
    .from("organizations")
    .select("id, name, suspended")
    .eq("id", connection.org_id)
    .maybeSingle();
  if (!org || org.suspended) return;

  // 1. Contato (upsert por org+phone)
  const { data: existingContact } = await admin
    .from("contacts")
    .select("*")
    .eq("org_id", org.id)
    .eq("phone", msg.fromPhone)
    .maybeSingle();

  let contact = existingContact;
  if (!contact) {
    const { data: created } = await admin
      .from("contacts")
      .insert({ org_id: org.id, phone: msg.fromPhone, name: msg.contactName })
      .select("*")
      .single();
    contact = created;
  } else if (msg.contactName && !contact.name) {
    await admin
      .from("contacts")
      .update({ name: msg.contactName })
      .eq("id", contact.id);
  }
  if (!contact) return;

  // Contato bloqueado: ignora por completo
  if (contact.blocked) return;

  // 2. Conversa (uma por contato+conexão; trigger reabre se resolvida)
  const { data: existingConversation } = await admin
    .from("conversations")
    .select("*")
    .eq("org_id", org.id)
    .eq("contact_id", contact.id)
    .eq("connection_id", connection.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let conversation = existingConversation;
  const isNewConversation = !conversation;
  if (!conversation) {
    const { data: created } = await admin
      .from("conversations")
      .insert({
        org_id: org.id,
        connection_id: connection.id,
        contact_id: contact.id,
      })
      .select("*")
      .single();
    conversation = created;
  }
  if (!conversation) return;

  // 3. Salva a mensagem (dedupe por id do provedor — retries/ecos)
  const { error: insertError } = await admin.from("messages").insert({
    conversation_id: conversation.id,
    direction: msg.fromMe ? "outbound" : "inbound",
    sender_type: msg.fromMe ? "human" : "contact",
    content: msg.content,
    message_type: msg.messageType,
    media_url: msg.mediaUrl,
    meta_message_id: msg.externalId,
    created_at: msg.timestamp,
  });
  if (insertError) {
    // 23505 = unique_violation → já processada (retry do provedor / eco do envio)
    if (insertError.code === "23505") return;
    console.error("[pipeline] falha ao salvar mensagem:", insertError.message);
    return;
  }

  // Mensagem enviada pelo próprio celular do cliente: só registra no histórico
  if (msg.fromMe) return;

  // 4. Bloqueio por assinatura: salva no inbox mas não roteia
  const { data: subscription } = await admin
    .from("subscriptions")
    .select("status, trial_ends_at, plan_id")
    .eq("org_id", org.id)
    .maybeSingle();
  if (isSubscriptionBlocked(subscription ?? null)) return;

  // 4.1 CSAT: se a conversa aguarda avaliação e a mensagem é uma nota 1–5,
  //     registra a resposta e NÃO processa como mensagem normal
  const csatCaptured = await maybeCaptureCsatResponse(
    admin,
    connection,
    conversation,
    contact.phone,
    msg.content
  );
  if (csatCaptured) return;

  // 4.2 Automações de gatilho imediato (nova mensagem, palavra-chave,
  //     fora do horário, primeiro contato) — antes do roteamento, para que
  //     ações como "pausar bot" e "ativar fluxo" tenham efeito nesta mensagem
  const automation = await runInboundAutomations({
    admin,
    connection,
    conversation,
    contactPhone: contact.phone,
    incomingText: msg.content,
    isNewConversation,
  });
  if (automation.botPaused || automation.flowStarted) return;

  // 4.3 Fluxo visual: fluxo em andamento ou fluxo publicado da conexão tem
  //     prioridade sobre o modo da conexão (o builder assume o atendimento)
  if (!conversation.bot_paused) {
    const handledByFlow = await runFlowForMessage({
      admin,
      connection,
      conversation,
      contact: { phone: contact.phone, name: contact.name },
      orgName: org.name,
      incomingText: msg.content,
    });
    if (handledByFlow) return;
  }

  // 5. Roteamento pelo modo da conexão
  if (connection.mode === "ai_bot") {
    await routeToAiBot({
      orgId: org.id,
      orgName: org.name,
      planId: subscription?.plan_id ?? null,
      connection,
      conversation,
      contactPhone: contact.phone,
      incomingText: msg.content,
      isNewConversation,
    });
  } else if (connection.mode === "external_webhook") {
    await routeToExternalWebhook({
      orgId: org.id,
      connectionId: connection.id,
      conversationId: conversation.id,
      contact: { name: contact.name, phone: contact.phone },
      message: {
        id: msg.externalId,
        text: msg.content,
        type: msg.messageType,
        timestamp: msg.timestamp,
      },
    });
  }
  // mode === "manual": realtime já notificou o inbox
}

// ============================================================================
// Canal 1 — Meta Cloud API
// ============================================================================

interface MetaContact {
  wa_id?: string;
  profile?: { name?: string };
}

interface MetaMessage {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: { caption?: string };
  video?: { caption?: string };
  audio?: Record<string, unknown>;
  sticker?: Record<string, unknown>;
  document?: { filename?: string; caption?: string };
}

interface MetaChangeValue {
  messaging_product?: string;
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  contacts?: MetaContact[];
  messages?: MetaMessage[];
  statuses?: unknown[];
}

export interface MetaWebhookBody {
  object?: string;
  entry?: {
    id?: string;
    changes?: { field?: string; value?: MetaChangeValue }[];
  }[];
}

function mapMetaType(type: string | undefined): MessageType {
  switch (type) {
    case "image":
      return "image";
    case "audio":
    case "voice":
      return "audio";
    case "video":
      return "video";
    case "document":
      return "document";
    case "sticker":
      return "sticker";
    default:
      return "text";
  }
}

function extractMetaContent(msg: MetaMessage): string {
  switch (msg.type) {
    case "text":
      return msg.text?.body ?? "";
    case "image":
      return msg.image?.caption ?? "[Imagem recebida]";
    case "video":
      return msg.video?.caption ?? "[Vídeo recebido]";
    case "audio":
      return "[Áudio recebido]";
    case "sticker":
      return "[Figurinha recebida]";
    case "document":
      return msg.document?.filename ?? "[Documento recebido]";
    default:
      return `[Mensagem do tipo "${msg.type ?? "desconhecido"}" recebida]`;
  }
}

export async function processMetaWebhook(body: MetaWebhookBody): Promise<void> {
  const admin = createAdminClient();

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!phoneNumberId || !value.messages?.length) continue;

      const { data: connection } = await admin
        .from("whatsapp_connections")
        .select("*")
        .eq("phone_number_id", phoneNumberId)
        .maybeSingle();
      if (!connection) {
        console.warn(`[meta-webhook] conexão não encontrada para ${phoneNumberId}`);
        continue;
      }

      for (const msg of value.messages) {
        if (!msg.from || !msg.id) continue;
        try {
          await handleInboundMessage(connection, {
            externalId: msg.id,
            fromPhone: msg.from,
            contactName: value.contacts?.[0]?.profile?.name ?? null,
            content: extractMetaContent(msg),
            messageType: mapMetaType(msg.type),
            mediaUrl: null,
            timestamp: msg.timestamp
              ? new Date(Number(msg.timestamp) * 1000).toISOString()
              : new Date().toISOString(),
            fromMe: false,
          });
        } catch (err) {
          console.error("[meta-webhook] erro ao processar mensagem:", err);
        }
      }
    }
  }
}

// ============================================================================
// Canal 2 — Evolution API (QR Code)
// ============================================================================

interface EvolutionMessageData {
  key?: { remoteJid?: string; fromMe?: boolean; id?: string };
  pushName?: string;
  messageTimestamp?: number | string;
  message?: {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    imageMessage?: { caption?: string };
    videoMessage?: { caption?: string };
    audioMessage?: Record<string, unknown>;
    stickerMessage?: Record<string, unknown>;
    documentMessage?: { fileName?: string; caption?: string };
  };
}

export interface EvolutionWebhookBody {
  event?: string;
  instance?: string;
  data?: EvolutionMessageData & {
    state?: string;
    statusReason?: number;
  };
}

function extractEvolutionContent(data: EvolutionMessageData): {
  content: string;
  type: MessageType;
} {
  const m = data.message ?? {};
  if (m.conversation) return { content: m.conversation, type: "text" };
  if (m.extendedTextMessage?.text)
    return { content: m.extendedTextMessage.text, type: "text" };
  if (m.imageMessage)
    return { content: m.imageMessage.caption ?? "[Imagem recebida]", type: "image" };
  if (m.videoMessage)
    return { content: m.videoMessage.caption ?? "[Vídeo recebido]", type: "video" };
  if (m.audioMessage) return { content: "[Áudio recebido]", type: "audio" };
  if (m.stickerMessage) return { content: "[Figurinha recebida]", type: "sticker" };
  if (m.documentMessage)
    return {
      content: m.documentMessage.fileName ?? "[Documento recebido]",
      type: "document",
    };
  return { content: "[Mensagem recebida]", type: "text" };
}

export async function processEvolutionWebhook(
  body: EvolutionWebhookBody
): Promise<void> {
  const instanceName = body.instance;
  if (!instanceName || !body.event) return;

  const admin = createAdminClient();

  const { data: connection } = await admin
    .from("whatsapp_connections")
    .select("*")
    .eq("evolution_instance_id", instanceName)
    .maybeSingle();
  if (!connection) {
    console.warn(`[evolution-webhook] conexão não encontrada para ${instanceName}`);
    return;
  }

  const event = body.event.toLowerCase().replace(/_/g, ".");

  // ----- Estado da sessão (conectado/desconectado) --------------------------
  if (event === "connection.update") {
    const state = body.data?.state;
    if (state === "open") {
      await admin
        .from("whatsapp_connections")
        .update({ status: "connected", connected_at: new Date().toISOString() })
        .eq("id", connection.id);
    } else if (state === "close") {
      await admin
        .from("whatsapp_connections")
        .update({ status: "disconnected" })
        .eq("id", connection.id);
      // Alerta no painel (cliente e admin)
      await admin.from("audit_logs").insert({
        org_id: connection.org_id,
        action: "connection.disconnected",
        metadata: {
          connection_id: connection.id,
          label: connection.label,
          channel: "qr_code",
          reason: body.data?.statusReason ?? null,
        },
      });
    }
    return;
  }

  // ----- Mensagens ----------------------------------------------------------
  if (event === "messages.upsert") {
    const data = body.data;
    const remoteJid = data?.key?.remoteJid ?? "";
    const messageId = data?.key?.id;
    if (!messageId || !remoteJid) return;

    // Ignora grupos e broadcast — escopo é atendimento 1:1
    if (remoteJid.endsWith("@g.us") || remoteJid.startsWith("status@")) return;

    const phone = remoteJid.replace(/@.*$/, "").replace(/\D/g, "");
    if (!phone) return;

    const { content, type } = extractEvolutionContent(data ?? {});
    const ts = data?.messageTimestamp
      ? new Date(Number(data.messageTimestamp) * 1000).toISOString()
      : new Date().toISOString();

    try {
      await handleInboundMessage(connection, {
        externalId: messageId,
        fromPhone: phone,
        contactName: data?.key?.fromMe ? null : (data?.pushName ?? null),
        content,
        messageType: type,
        mediaUrl: null,
        timestamp: ts,
        fromMe: data?.key?.fromMe === true,
      });
    } catch (err) {
      console.error("[evolution-webhook] erro ao processar mensagem:", err);
    }
  }
}

// ============================================================================
// Modo Bot IA (canal-agnóstico — envia pelo lib/send)
// ============================================================================

async function routeToAiBot(params: {
  orgId: string;
  orgName: string;
  planId: string | null;
  connection: WhatsappConnectionRow;
  conversation: { id: string; bot_paused: boolean };
  contactPhone: string;
  incomingText: string;
  isNewConversation: boolean;
}): Promise<void> {
  const admin = createAdminClient();
  const {
    orgId,
    orgName,
    planId,
    connection,
    conversation,
    contactPhone,
    incomingText,
    isNewConversation,
  } = params;

  if (conversation.bot_paused) return;

  const { data: agents } = await admin
    .from("agents")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  const agent =
    agents?.find((a) => a.connection_id === connection.id) ??
    agents?.find((a) => a.connection_id === null) ??
    agents?.[0];
  if (!agent || !agent.active) return;

  const sendable: SendableConnection = connection;

  const sendAndSave = async (text: string): Promise<boolean> => {
    const result = await sendText(sendable, contactPhone, text);
    if (!result.ok) {
      await admin.from("audit_logs").insert({
        org_id: orgId,
        action: "message.send_failed",
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
    return true;
  };

  // Handoff: pausa o bot, avisa o cliente e gera o resumo para o atendente
  if (matchesHandoffKeyword(incomingText, agent.handoff_keywords)) {
    await admin
      .from("conversations")
      .update({ bot_paused: true })
      .eq("id", conversation.id);
    await sendAndSave(
      "Claro! Vou te transferir para alguém da nossa equipe. Só um instante 🙏"
    );
    // Resumo da conversa por IA (best effort — nunca trava o atendimento)
    await generateConversationSummary(admin, conversation.id);
    return;
  }

  // Fora do horário → mensagem de ausência (sem IA, sem custo)
  const hours = parseBusinessHoursConfig(agent.business_hours);
  if (!isWithinBusinessHours(hours)) {
    if (agent.away_message.trim()) {
      await sendAndSave(agent.away_message.trim());
    }
    return;
  }

  // Saldo de mensagens IA do plano
  let limit = 0;
  if (planId) {
    const { data: plan } = await admin
      .from("plans")
      .select("ai_messages_limit")
      .eq("id", planId)
      .maybeSingle();
    limit = plan?.ai_messages_limit ?? 0;
  }
  const now = new Date();
  const periodKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const { data: usage } = await admin
    .from("usage_counters")
    .select("ai_messages_used")
    .eq("org_id", orgId)
    .eq("period_start", periodKey)
    .maybeSingle();
  const used = usage?.ai_messages_used ?? 0;

  if (limit > 0 && used >= limit) {
    await admin.from("audit_logs").insert({
      org_id: orgId,
      action: "ai.limit_reached",
      metadata: { conversation_id: conversation.id, used, limit },
    });
    // Aviso padrão ao contato (uma cortesia, não consome IA)
    await sendAndSave(
      "Nosso atendimento automático atingiu o limite do plano — em breve um atendente responde você! 🙏"
    );
    return;
  }

  // Boas-vindas em conversa nova (mensagem fixa, não consome saldo)
  if (isNewConversation && agent.welcome_message.trim()) {
    await sendAndSave(agent.welcome_message.trim());
  }

  // Histórico recente para contexto
  const { data: recent } = await admin
    .from("messages")
    .select("direction, sender_type, content")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: false })
    .limit(21);

  const history: ChatTurn[] = (recent ?? [])
    .reverse()
    .slice(0, -1)
    .map((m) => ({
      role: m.direction === "inbound" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    }));

  const [{ data: faqs }, knowledge] = await Promise.all([
    admin
      .from("agent_faqs")
      .select("question, answer")
      .eq("agent_id", agent.id)
      .order("position", { ascending: true }),
    // "Ensine sua IA": arquivos e sites processados entram no prompt
    getAgentKnowledge(admin, agent.id),
  ]);

  const systemPrompt = buildAgentSystemPrompt({
    agent,
    faqs: faqs ?? [],
    orgName,
    knowledge,
  });

  const reply = await generateAgentReply({
    systemPrompt,
    history,
    userMessage: incomingText,
  });

  if (!reply.ok) {
    await admin.from("audit_logs").insert({
      org_id: orgId,
      action: "ai.error",
      metadata: { conversation_id: conversation.id, error: reply.error },
    });
    return;
  }

  const sent = await sendAndSave(reply.text);
  if (sent) {
    await admin.rpc("increment_ai_usage", { p_org_id: orgId });
    await admin.from("audit_logs").insert({
      org_id: orgId,
      action: "ai.reply",
      metadata: {
        conversation_id: conversation.id,
        model: reply.model,
        input_tokens: reply.inputTokens,
        output_tokens: reply.outputTokens,
      },
    });
  }
}

// ============================================================================
// Modo Webhook Externo (n8n)
// ============================================================================

async function routeToExternalWebhook(params: {
  orgId: string;
  connectionId: string;
  conversationId: string;
  contact: { name: string | null; phone: string };
  message: { id: string; text: string; type: string; timestamp: string };
}): Promise<void> {
  const admin = createAdminClient();

  const { data: webhooks } = await admin
    .from("external_webhooks")
    .select("*")
    .eq("org_id", params.orgId)
    .eq("active", true);
  const webhook =
    webhooks?.find((w) => w.connection_id === params.connectionId) ??
    webhooks?.find((w) => w.connection_id === null) ??
    webhooks?.[0];
  if (!webhook) return;

  const payload: ZariWebhookPayload = {
    event: "message.received",
    organization_id: params.orgId,
    conversation_id: params.conversationId,
    contact: params.contact,
    message: params.message,
    reply_token: buildReplyToken(webhook.secret, params.conversationId),
  };

  await deliverToWebhook(admin, webhook, payload);
}
