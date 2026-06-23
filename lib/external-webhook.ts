import { createHmac } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ExternalWebhookRow, Json } from "@/types/database";

/**
 * Entrega de eventos ao webhook externo do cliente (n8n).
 * - Payload assinado com HMAC SHA-256 no header X-Zari-Signature
 * - Até 3 tentativas por entrega
 * - Cada tentativa é registrada em webhook_logs
 * - 3 falhas consecutivas de entrega → notificação no painel (audit_logs)
 */

const DELIVERY_ATTEMPTS = 3;
const TIMEOUT_MS = 8000;

export interface ZariWebhookPayload {
  event: string;
  organization_id: string;
  conversation_id: string;
  contact: { name: string | null; phone: string };
  message: { id: string; text: string; type: string; timestamp: string };
  reply_token: string;
}

/** Assinatura HMAC SHA-256 do corpo (hex) — verificável pelo cliente. */
export function signPayload(secret: string, rawBody: string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`;
}

/**
 * reply_token: identifica a conversa de forma verificável, para o n8n
 * responder via POST /api/v1/messages sem precisar guardar IDs.
 * Formato: <conversation_id>.<hmac(secret_do_webhook, conversation_id)>
 */
export function buildReplyToken(secret: string, conversationId: string): string {
  const mac = createHmac("sha256", secret)
    .update(conversationId, "utf8")
    .digest("hex")
    .slice(0, 32);
  return `${conversationId}.${mac}`;
}

/** Valida um reply_token contra o secret e devolve o conversation_id. */
export function parseReplyToken(
  secret: string,
  token: string
): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const conversationId = token.slice(0, dot);
  return buildReplyToken(secret, conversationId) === token
    ? conversationId
    : null;
}

export interface DeliveryResult {
  ok: boolean;
  statusCode: number | null;
  error: string | null;
}

/** Entrega o payload com retries, logando cada tentativa. */
export async function deliverToWebhook(
  admin: SupabaseClient<Database>,
  webhook: Pick<ExternalWebhookRow, "id" | "org_id" | "url" | "secret" | "failures_count">,
  payload: ZariWebhookPayload
): Promise<DeliveryResult> {
  const rawBody = JSON.stringify(payload);
  const signature = signPayload(webhook.secret, rawBody);

  let lastStatus: number | null = null;
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= DELIVERY_ATTEMPTS; attempt++) {
    const startedAt = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Zari-Signature": signature,
          "X-Zari-Event": payload.event,
          "User-Agent": "ZariAPI-Webhook/1.0",
        },
        body: rawBody,
        signal: controller.signal,
      });
      clearTimeout(timer);

      const elapsed = Date.now() - startedAt;
      lastStatus = res.status;

      await admin.from("webhook_logs").insert({
        webhook_id: webhook.id,
        event: payload.event,
        status_code: res.status,
        response_ms: elapsed,
        error: res.ok ? null : `HTTP ${res.status} na tentativa ${attempt}`,
        payload: JSON.parse(rawBody) as Json,
      });

      if (res.ok) {
        // Sucesso zera o contador de falhas consecutivas
        await admin
          .from("external_webhooks")
          .update({ last_status: res.status, failures_count: 0 })
          .eq("id", webhook.id);
        return { ok: true, statusCode: res.status, error: null };
      }
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      const elapsed = Date.now() - startedAt;
      lastError =
        err instanceof Error && err.name === "AbortError"
          ? `Timeout após ${TIMEOUT_MS}ms`
          : err instanceof Error
            ? err.message
            : "Falha de rede";
      await admin.from("webhook_logs").insert({
        webhook_id: webhook.id,
        event: payload.event,
        status_code: null,
        response_ms: elapsed,
        error: `${lastError} (tentativa ${attempt})`,
        payload: JSON.parse(rawBody) as Json,
      });
    }
  }

  // Todas as tentativas falharam — incrementa falhas consecutivas
  const failures = webhook.failures_count + 1;
  await admin
    .from("external_webhooks")
    .update({ last_status: lastStatus, failures_count: failures })
    .eq("id", webhook.id);

  // 3 entregas consecutivas falhando → notifica no painel
  if (failures >= 3) {
    await admin.from("audit_logs").insert({
      org_id: webhook.org_id,
      actor_id: null,
      action: "webhook.failing",
      metadata: {
        webhook_id: webhook.id,
        url: webhook.url,
        consecutive_failures: failures,
        last_status: lastStatus,
        last_error: lastError,
      },
    });
  }

  return { ok: false, statusCode: lastStatus, error: lastError };
}
