import type { SupabaseClient } from "@supabase/supabase-js";
import { sendText } from "@/lib/send";
import { sendCsatSurvey, DEFAULT_CSAT_MESSAGE } from "@/lib/csat";
import { startFlowOnConversation } from "@/lib/flow-runner";
import {
  isWithinBusinessHours,
  parseBusinessHoursConfig,
} from "@/lib/business-hours";
import type {
  AutomationRuleRow,
  AutomationTriggerType,
  Database,
  WhatsappConnectionRow,
} from "@/types/database";

/**
 * Automações (regras SE → ENTÃO) — avaliadas pelo pipeline a cada mensagem
 * recebida e pelo cron de jobs (checagens adiadas: sem resposta / resolvida).
 */

type AdminClient = SupabaseClient<Database>;

export interface AutomationAction {
  type:
    | "send_message"
    | "assign_agent"
    | "add_tag"
    | "start_flow"
    | "notify_email"
    | "pause_bot"
    | "send_csat";
  /** send_message */
  message?: string;
  /** assign_agent */
  agent_id?: string;
  /** add_tag */
  tag?: string;
  /** start_flow */
  flow_id?: string;
}

export interface TriggerConfig {
  /** keyword_match: palavras separadas por vírgula */
  keywords?: string;
  /** no_response: horas sem resposta da equipe */
  hours?: number;
}

export function parseActions(value: unknown): AutomationAction[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (a): a is AutomationAction => !!a && typeof a === "object" && "type" in a
  );
}

interface AutomationContext {
  admin: AdminClient;
  connection: WhatsappConnectionRow;
  conversation: { id: string; org_id: string; contact_id: string };
  contactPhone: string;
}

export interface AutomationOutcome {
  /** Alguma ação pausou o bot (pipeline não deve rotear ao bot/fluxo) */
  botPaused: boolean;
  /** Alguma ação iniciou um fluxo nesta conversa */
  flowStarted: boolean;
}

/** Executa a lista de ações de uma regra. */
async function executeActions(
  rule: AutomationRuleRow,
  ctx: AutomationContext
): Promise<AutomationOutcome> {
  const { admin, connection, conversation, contactPhone } = ctx;
  const outcome: AutomationOutcome = { botPaused: false, flowStarted: false };

  for (const action of parseActions(rule.actions)) {
    try {
      switch (action.type) {
        case "send_message": {
          const text = action.message?.trim();
          if (!text) break;
          const result = await sendText(connection, contactPhone, text);
          if (result.ok) {
            await admin.from("messages").insert({
              conversation_id: conversation.id,
              direction: "outbound",
              sender_type: "ai_bot",
              content: text,
              message_type: "text",
              meta_message_id: result.providerMessageId,
            });
          }
          break;
        }
        case "assign_agent":
          if (action.agent_id) {
            await admin
              .from("conversations")
              .update({ assigned_to: action.agent_id })
              .eq("id", conversation.id);
          }
          break;
        case "add_tag": {
          const tag = action.tag?.trim().toLowerCase();
          if (!tag) break;
          const { data: contact } = await admin
            .from("contacts")
            .select("tags")
            .eq("id", conversation.contact_id)
            .maybeSingle();
          const tags = contact?.tags ?? [];
          if (!tags.includes(tag)) {
            await admin
              .from("contacts")
              .update({ tags: [...tags, tag] })
              .eq("id", conversation.contact_id);
          }
          break;
        }
        case "start_flow":
          if (action.flow_id) {
            await startFlowOnConversation({
              admin,
              flowId: action.flow_id,
              conversationId: conversation.id,
            });
            outcome.flowStarted = true;
          }
          break;
        case "notify_email":
          await notifyTeamByEmail(admin, rule, conversation);
          break;
        case "pause_bot":
          await admin
            .from("conversations")
            .update({ bot_paused: true })
            .eq("id", conversation.id);
          outcome.botPaused = true;
          break;
        case "send_csat": {
          const { data: conv } = await admin
            .from("conversations")
            .select("id, csat_sent_at")
            .eq("id", conversation.id)
            .maybeSingle();
          if (conv) {
            await sendCsatSurvey(
              admin,
              { ...connection, csat_message: connection.csat_message ?? DEFAULT_CSAT_MESSAGE },
              conv,
              contactPhone
            );
          }
          break;
        }
      }
    } catch (err) {
      console.error(`[automations] falha na ação ${action.type}:`, err);
    }
  }

  await admin.from("audit_logs").insert({
    org_id: conversation.org_id,
    action: "automation.triggered",
    metadata: {
      rule_id: rule.id,
      rule_name: rule.name,
      trigger: rule.trigger_type,
      conversation_id: conversation.id,
    },
  });

  return outcome;
}

/**
 * Notifica a equipe por email. Sem provedor de email no projeto, usa a API do
 * Resend via fetch quando RESEND_API_KEY está configurada; caso contrário,
 * registra o alerta na trilha de auditoria (visível no painel admin).
 */
async function notifyTeamByEmail(
  admin: AdminClient,
  rule: AutomationRuleRow,
  conversation: { id: string; org_id: string }
): Promise<void> {
  await admin.from("audit_logs").insert({
    org_id: conversation.org_id,
    action: "automation.notify_team",
    metadata: { rule_id: rule.id, rule_name: rule.name, conversation_id: conversation.id },
  });

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFY_EMAIL_FROM;
  if (!apiKey || !from) return;

  // Emails da equipe via auth.users (service role)
  const { data: profiles } = await admin
    .from("profiles")
    .select("id")
    .eq("org_id", conversation.org_id);
  if (!profiles?.length) return;

  const emails: string[] = [];
  for (const p of profiles.slice(0, 20)) {
    const { data } = await admin.auth.admin.getUserById(p.id);
    if (data.user?.email) emails.push(data.user.email);
  }
  if (emails.length === 0) return;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: emails,
        subject: `⚡ Automação disparada: ${rule.name}`,
        text: `A regra "${rule.name}" foi disparada em uma conversa.\n\nAbra o inbox para ver: ${appUrl}/app/inbox`,
      }),
    });
  } catch (err) {
    console.error("[automations] falha ao enviar email:", err);
  }
}

/**
 * Avalia e executa as automações de gatilho imediato para uma mensagem
 * recebida. Chamado pelo pipeline ANTES do roteamento ao bot/fluxo.
 */
export async function runInboundAutomations(params: {
  admin: AdminClient;
  connection: WhatsappConnectionRow;
  conversation: { id: string; org_id: string; contact_id: string };
  contactPhone: string;
  incomingText: string;
  isNewConversation: boolean;
}): Promise<AutomationOutcome> {
  const { admin, connection, conversation, incomingText, isNewConversation } = params;
  const outcome: AutomationOutcome = { botPaused: false, flowStarted: false };

  const { data: rules } = await admin
    .from("automation_rules")
    .select("*")
    .eq("org_id", conversation.org_id)
    .eq("active", true);
  if (!rules?.length) return outcome;

  // Regras da conexão específica ou globais (connection_id null)
  const applicable = rules.filter(
    (r) => r.connection_id === null || r.connection_id === connection.id
  );

  for (const rule of applicable) {
    const config = (rule.trigger_config ?? {}) as TriggerConfig;
    let fire = false;

    switch (rule.trigger_type as AutomationTriggerType) {
      case "message_received":
        fire = true;
        break;
      case "keyword_match": {
        const keywords = (config.keywords ?? "")
          .split(",")
          .map((k) => k.trim().toLowerCase())
          .filter(Boolean);
        const text = incomingText.toLowerCase();
        fire = keywords.some((k) => text.includes(k));
        break;
      }
      case "new_conversation":
        fire = isNewConversation;
        break;
      case "outside_hours": {
        // Horário configurado no agente da conexão (mesma fonte do bot)
        const { data: agents } = await admin
          .from("agents")
          .select("connection_id, business_hours")
          .eq("org_id", conversation.org_id);
        const agent =
          agents?.find((a) => a.connection_id === connection.id) ??
          agents?.find((a) => a.connection_id === null) ??
          agents?.[0];
        if (agent) {
          const hours = parseBusinessHoursConfig(agent.business_hours);
          fire = hours.enabled && !isWithinBusinessHours(hours);
        }
        break;
      }
      case "no_response": {
        // Gatilho adiado: agenda a checagem para daqui a X horas
        const hours = Math.max(Number(config.hours) || 0, 0);
        if (hours > 0) {
          await admin.from("scheduled_jobs").insert({
            org_id: conversation.org_id,
            job_type: "automation_check",
            payload: {
              trigger: "no_response",
              rule_id: rule.id,
              conversation_id: conversation.id,
              message_at: new Date().toISOString(),
            },
            run_at: new Date(Date.now() + hours * 3_600_000).toISOString(),
          });
        }
        break;
      }
      default:
        break;
    }

    if (fire) {
      const result = await executeActions(rule, {
        admin,
        connection,
        conversation,
        contactPhone: params.contactPhone,
      });
      outcome.botPaused = outcome.botPaused || result.botPaused;
      outcome.flowStarted = outcome.flowStarted || result.flowStarted;
    }
  }

  return outcome;
}

/**
 * Processa um job automation_check (cron):
 *   no_response          → dispara se ninguém da equipe respondeu desde a mensagem
 *   conversation_resolved → dispara as regras com esse gatilho
 */
export async function runScheduledAutomationCheck(
  admin: AdminClient,
  payload: {
    trigger?: string;
    rule_id?: string;
    conversation_id?: string;
    message_at?: string;
  }
): Promise<void> {
  if (!payload.conversation_id) return;

  const { data: conversation } = await admin
    .from("conversations")
    .select("id, org_id, contact_id, connection_id, status")
    .eq("id", payload.conversation_id)
    .maybeSingle();
  if (!conversation || !conversation.connection_id) return;

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
  if (!connection || !contact) return;

  const ctx: AutomationContext = {
    admin,
    connection,
    conversation,
    contactPhone: contact.phone,
  };

  if (payload.trigger === "no_response" && payload.rule_id) {
    // Conversa já resolvida ou alguém respondeu depois da mensagem? Não dispara.
    if (conversation.status === "resolved") return;
    const { data: reply } = await admin
      .from("messages")
      .select("id")
      .eq("conversation_id", conversation.id)
      .eq("direction", "outbound")
      .in("sender_type", ["human", "ai_bot", "external"])
      .gte("created_at", payload.message_at ?? new Date(0).toISOString())
      .limit(1)
      .maybeSingle();
    if (reply) return;

    const { data: rule } = await admin
      .from("automation_rules")
      .select("*")
      .eq("id", payload.rule_id)
      .eq("active", true)
      .maybeSingle();
    if (rule) await executeActions(rule, ctx);
    return;
  }

  if (payload.trigger === "conversation_resolved") {
    const { data: rules } = await admin
      .from("automation_rules")
      .select("*")
      .eq("org_id", conversation.org_id)
      .eq("active", true)
      .eq("trigger_type", "conversation_resolved");
    for (const rule of rules ?? []) {
      if (rule.connection_id === null || rule.connection_id === connection.id) {
        await executeActions(rule, ctx);
      }
    }
  }
}
