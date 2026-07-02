import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Integração com a Evolution API (conexão WhatsApp via QR Code).
 * A plataforma usa UMA instância Evolution global (self-hosted ou cloud);
 * cada conexão de cliente vira uma "instance" dentro dela.
 *
 * Config em camadas: env (EVOLUTION_API_URL / EVOLUTION_API_KEY) tem
 * prioridade; sem env, usa admin_settings key 'evolution' (painel /admin).
 */

export interface EvolutionConfig {
  url: string | null;
  apiKey: string | null;
}

export async function getEvolutionConfig(): Promise<EvolutionConfig> {
  let url = process.env.EVOLUTION_API_URL ?? null;
  let apiKey = process.env.EVOLUTION_API_KEY ?? null;

  if (!url || !apiKey) {
    try {
      const admin = createAdminClient();
      const { data } = await admin
        .from("admin_settings")
        .select("value")
        .eq("key", "evolution")
        .maybeSingle();
      const value = (data?.value ?? {}) as { url?: string; api_key?: string };
      url = url ?? value.url ?? null;
      apiKey = apiKey ?? value.api_key ?? null;
    } catch {
      // sem service key — segue só com env
    }
  }

  return { url: url?.replace(/\/$/, "") ?? null, apiKey };
}

export function isEvolutionConfigured(cfg: EvolutionConfig): boolean {
  return !!cfg.url && !!cfg.apiKey;
}

interface EvoResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

async function evoFetch<T>(
  cfg: EvolutionConfig,
  path: string,
  init?: RequestInit
): Promise<EvoResult<T>> {
  if (!isEvolutionConfigured(cfg)) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: "Evolution API não configurada (URL e API Key em /admin/settings ou env)",
    };
  }
  try {
    const res = await fetch(`${cfg.url}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        apikey: cfg.apiKey as string,
        ...init?.headers,
      },
    });
    const data = (await res.json().catch(() => null)) as T | null;
    if (!res.ok) {
      const err = data as { message?: string | string[]; error?: string } | null;
      const msg = Array.isArray(err?.message)
        ? err?.message.join("; ")
        : (err?.message ?? err?.error ?? `Evolution respondeu ${res.status}`);
      return { ok: false, status: res.status, data, error: msg ?? null };
    }
    return { ok: true, status: res.status, data, error: null };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: err instanceof Error ? err.message : "Falha de rede na Evolution API",
    };
  }
}

/** Testa a conexão e devolve a versão da Evolution API. */
export async function testEvolutionConnection(): Promise<{
  ok: boolean;
  version: string | null;
  error: string | null;
}> {
  const cfg = await getEvolutionConfig();
  const result = await evoFetch<{ version?: string; message?: string }>(cfg, "/");
  return {
    ok: result.ok,
    version: result.data?.version ?? null,
    error: result.error,
  };
}

/**
 * Cria uma instância (sessão de QR Code) e registra o webhook global.
 * Compatível com Evolution API v2 (fallback para o formato v1 do webhook).
 */
export async function createEvolutionInstance(
  instanceName: string,
  webhookUrl: string
): Promise<{ ok: boolean; token: string | null; error: string | null }> {
  const cfg = await getEvolutionConfig();

  const created = await evoFetch<{
    instance?: { instanceName?: string };
    hash?: string | { apikey?: string };
  }>(cfg, "/instance/create", {
    method: "POST",
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
    }),
  });

  if (!created.ok) {
    return { ok: false, token: null, error: created.error };
  }

  const token =
    typeof created.data?.hash === "string"
      ? created.data.hash
      : (created.data?.hash?.apikey ?? null);

  // Webhook: tenta o formato v2 ({webhook:{...}}), cai para o v1 (flat)
  const events = ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"];
  const webhookToken = process.env.EVOLUTION_WEBHOOK_TOKEN;
  const webhookHeaders = webhookToken ? { "x-webhook-token": webhookToken } : {};
  const v2 = await evoFetch(cfg, `/webhook/set/${instanceName}`, {
    method: "POST",
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        events,
        headers: webhookHeaders,
      },
    }),
  });
  if (!v2.ok) {
    await evoFetch(cfg, `/webhook/set/${instanceName}`, {
      method: "POST",
      body: JSON.stringify({ enabled: true, url: webhookUrl, events }),
    });
  }

  return { ok: true, token, error: null };
}

/** QR Code atual da instância (base64) — para o modal com polling. */
export async function getEvolutionQr(instanceName: string): Promise<{
  qrBase64: string | null;
  pairingCode: string | null;
  error: string | null;
}> {
  const cfg = await getEvolutionConfig();
  const result = await evoFetch<{
    base64?: string;
    code?: string;
    pairingCode?: string;
    qrcode?: { base64?: string; pairingCode?: string };
  }>(cfg, `/instance/connect/${instanceName}`);

  const qr =
    result.data?.base64 ?? result.data?.qrcode?.base64 ?? null;
  const pairing =
    result.data?.pairingCode ?? result.data?.qrcode?.pairingCode ?? null;

  return { qrBase64: qr, pairingCode: pairing, error: result.error };
}

export type EvolutionState = "open" | "connecting" | "close" | "unknown";

/** Estado da sessão: open = conectado, close = desconectado. */
export async function getEvolutionState(
  instanceName: string
): Promise<EvolutionState> {
  const cfg = await getEvolutionConfig();
  const result = await evoFetch<{
    instance?: { state?: string };
    state?: string;
  }>(cfg, `/instance/connectionState/${instanceName}`);
  const state = result.data?.instance?.state ?? result.data?.state;
  if (state === "open" || state === "connecting" || state === "close") {
    return state;
  }
  return "unknown";
}

/** Número e nome do WhatsApp conectado na instância. */
export async function fetchEvolutionOwner(instanceName: string): Promise<{
  phone: string | null;
  profileName: string | null;
}> {
  const cfg = await getEvolutionConfig();
  const result = await evoFetch<
    | { instance?: { owner?: string; profileName?: string } }[]
    | { instance?: { owner?: string; profileName?: string } }
  >(cfg, `/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`);

  const item = Array.isArray(result.data) ? result.data[0] : result.data;
  const owner = item?.instance?.owner ?? null;
  return {
    phone: owner ? owner.replace(/@.*$/, "") : null,
    profileName: item?.instance?.profileName ?? null,
  };
}

export interface EvolutionSendResult {
  ok: boolean;
  messageId: string | null;
  error: string | null;
}

/** Envia texto via instância QR Code (formato v2 com fallback v1). */
export async function sendEvolutionText(
  instanceName: string,
  number: string,
  text: string
): Promise<EvolutionSendResult> {
  const cfg = await getEvolutionConfig();
  // Contatos LID são armazenados com prefixo "lid_" — converter para JID real
  const recipient = number.startsWith("lid_")
    ? `${number.slice(4)}@lid`
    : number;

  let result = await evoFetch<{ key?: { id?: string } }>(
    cfg,
    `/message/sendText/${instanceName}`,
    { method: "POST", body: JSON.stringify({ number: recipient, text }) }
  );
  if (!result.ok && result.status === 400) {
    result = await evoFetch<{ key?: { id?: string } }>(
      cfg,
      `/message/sendText/${instanceName}`,
      {
        method: "POST",
        body: JSON.stringify({ number, textMessage: { text } }),
      }
    );
  }

  return {
    ok: result.ok,
    messageId: result.data?.key?.id ?? null,
    error: result.error,
  };
}

/** Envia mídia (imagem/documento/vídeo) por URL pública. */
export async function sendEvolutionMedia(
  instanceName: string,
  number: string,
  mediatype: "image" | "document" | "video" | "audio",
  mediaUrl: string,
  caption?: string,
  fileName?: string
): Promise<EvolutionSendResult> {
  const cfg = await getEvolutionConfig();
  const recipient = number.startsWith("lid_") ? `${number.slice(4)}@lid` : number;
  const result = await evoFetch<{ key?: { id?: string } }>(
    cfg,
    `/message/sendMedia/${instanceName}`,
    {
      method: "POST",
      body: JSON.stringify({
        number: recipient,
        mediatype,
        media: mediaUrl,
        caption: caption ?? "",
        fileName: fileName ?? undefined,
      }),
    }
  );
  return {
    ok: result.ok,
    messageId: result.data?.key?.id ?? null,
    error: result.error,
  };
}

/**
 * Busca o base64 de uma mensagem de mídia (imagem, áudio, vídeo, documento).
 * A Evolution API não inclui o base64 no payload do webhook por padrão.
 */
export async function fetchEvolutionMediaBase64(
  instanceName: string,
  messageEnvelope: { key?: unknown; message?: unknown }
): Promise<{ base64: string; mimetype: string } | null> {
  const cfg = await getEvolutionConfig();
  const result = await evoFetch<{ base64?: string; mimetype?: string }>(
    cfg,
    `/chat/getBase64FromMediaMessage/${instanceName}`,
    {
      method: "POST",
      body: JSON.stringify({ message: messageEnvelope, convertToMp4: false }),
    }
  );
  if (!result.ok || !result.data?.base64) return null;
  return {
    base64: result.data.base64,
    mimetype: result.data.mimetype ?? "application/octet-stream",
  };
}

/** Foto de perfil do WhatsApp de um contato (URL pode expirar em ~24h). */
export async function fetchEvolutionProfilePicture(
  instanceName: string,
  number: string
): Promise<string | null> {
  const cfg = await getEvolutionConfig();
  const jid = number.startsWith("lid_")
    ? `${number.slice(4)}@lid`
    : `${number}@s.whatsapp.net`;
  const result = await evoFetch<{ profilePictureUrl?: string; imgUrl?: string }>(
    cfg,
    `/chat/fetchProfilePictureUrl/${instanceName}`,
    { method: "POST", body: JSON.stringify({ number: jid }) }
  );
  return result.data?.profilePictureUrl ?? result.data?.imgUrl ?? null;
}

/** Desconecta a sessão (gera novo QR ao reconectar). */
export async function logoutEvolutionInstance(instanceName: string): Promise<boolean> {
  const cfg = await getEvolutionConfig();
  const result = await evoFetch(cfg, `/instance/logout/${instanceName}`, {
    method: "DELETE",
  });
  return result.ok;
}

/** Remove a instância por completo (ao excluir a conexão). */
export async function deleteEvolutionInstance(instanceName: string): Promise<boolean> {
  const cfg = await getEvolutionConfig();
  const result = await evoFetch(cfg, `/instance/delete/${instanceName}`, {
    method: "DELETE",
  });
  return result.ok;
}
