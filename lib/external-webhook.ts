import { createHmac } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ExternalWebhookRow, Json } from "@/types/database";
import { isUrlSafeForOutbound } from "@/lib/ssrf-guard";
import { decryptSecret } from "@/lib/crypto";

/**
 * Entrega de eventos ao webhook externo do cliente (n8n).
 * - Payload assinado com HMAC SHA-256 nos headers X-PixelPage-Signature/X-PixelPage-Event
 * - Até 3 tentativas por entrega
 * - Cada tentativa é registrada em webhook_logs
 * - 3 falhas consecutivas de entrega → notificação no painel (audit_logs)
 */

const DELIVERY_ATTEMPTS = 3;
const TIMEOUT_MS = 8000;

/**
 * URL do workflow de atendimento hospedado pela própria plataforma (n8n cloud).
 * Configurável por env (PLATFORM_N8N_WEBHOOK_URL); cai no padrão da PixelPage.
 */
export const PLATFORM_WORKFLOW_URL =
  process.env.PLATFORM_N8N_WEBHOOK_URL?.trim() ||
  "https://pixelpage.app.n8n.cloud/webhook/pixelpage-atendimento";

export interface PixelPageWebhookPayload {
  event: string;
  organization_id: string;
  conversation_id: string;
  contact: { name: string | null; phone: string };
  message: {
    id: string;
    text: string;
    type: string;
    media_url?: string | null;
    timestamp: string;
  };
  // Token verificável para responder via POST /api/v1/messages (reply_token)
  reply_token: string;
  // URL pública da plataforma (para montar chamadas à API a partir do n8n)
  app_url: string;
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
  payload: PixelPageWebhookPayload
): Promise<DeliveryResult> {
  const rawBody = JSON.stringify(payload);
  const signature = signPayload(webhook.secret, rawBody);

  // Auth opcional para n8n self-hosted que exige autenticação de entrada — só
  // adicionamos o header se a org tiver configurado uma chave (a maioria não
  // tem; n8n próprio atrás de auth é a exceção, não o padrão). Buscado 1x
  // antes do loop de tentativas (não é sensível a rebinding como a URL).
  let n8nAuthHeader: string | null = null;
  try {
    const { data: secretsRow } = await admin
      .from("org_secrets")
      .select("n8n_api_key_encrypted")
      .eq("org_id", webhook.org_id)
      .maybeSingle();
    if (secretsRow?.n8n_api_key_encrypted) {
      n8nAuthHeader = `Bearer ${decryptSecret(secretsRow.n8n_api_key_encrypted)}`;
    }
  } catch (err) {
    console.error(
      "[external-webhook] falha ao buscar/decifrar chave de auth do n8n (entregando sem o header):",
      webhook.org_id,
      err
    );
  }

  let lastStatus: number | null = null;
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= DELIVERY_ATTEMPTS; attempt++) {
    const startedAt = Date.now();

    // Checagem de SSRF a cada tentativa — defesa contra DNS rebinding entre o
    // momento de salvar a URL e o de efetivamente entregar (ver lib/ssrf-guard.ts).
    const ssrfCheck = await isUrlSafeForOutbound(webhook.url);
    if (!ssrfCheck.safe) {
      const elapsed = Date.now() - startedAt;
      lastError = ssrfCheck.reason ?? "URL de webhook não permitida (SSRF).";
      await admin.from("webhook_logs").insert({
        webhook_id: webhook.id,
        event: payload.event,
        status_code: null,
        response_ms: elapsed,
        error: `${lastError} (tentativa ${attempt})`,
        payload: JSON.parse(rawBody) as Json,
      });
      continue;
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-PixelPage-Signature": signature,
          "X-PixelPage-Event": payload.event,
          "User-Agent": "PixelPageChat-Webhook/1.0",
          // Auth opcional para n8n self-hosted (só presente se configurada)
          ...(n8nAuthHeader ? { Authorization: n8nAuthHeader } : {}),
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
