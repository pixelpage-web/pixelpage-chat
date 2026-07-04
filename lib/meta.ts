/**
 * Integração com a Meta Cloud API (WhatsApp Business).
 * O token de System User é do Tech Provider (global, em env) — cada conexão
 * de cliente guarda apenas waba_id e phone_number_id.
 */

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

function systemToken(): string {
  const token = process.env.META_SYSTEM_USER_TOKEN;
  if (!token) {
    throw new Error("META_SYSTEM_USER_TOKEN não configurado");
  }
  return token;
}

export interface MetaSendResult {
  ok: boolean;
  metaMessageId: string | null;
  error: string | null;
}

/**
 * Envia mensagem de texto via Cloud API:
 * POST /{phone_number_id}/messages
 */
export async function sendWhatsappText(
  phoneNumberId: string,
  to: string,
  body: string
): Promise<MetaSendResult> {
  try {
    const res = await fetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${systemToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      }),
    });

    const json = (await res.json().catch(() => null)) as {
      messages?: { id: string }[];
      error?: { message?: string };
    } | null;

    if (!res.ok) {
      return {
        ok: false,
        metaMessageId: null,
        error: json?.error?.message ?? `Meta respondeu ${res.status}`,
      };
    }

    return {
      ok: true,
      metaMessageId: json?.messages?.[0]?.id ?? null,
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      metaMessageId: null,
      error: err instanceof Error ? err.message : "Falha de rede ao chamar a Meta",
    };
  }
}

/**
 * Envia mídia por URL pública via Cloud API (imagem/documento/vídeo/áudio).
 */
export async function sendWhatsappMedia(
  phoneNumberId: string,
  to: string,
  mediaType: "image" | "document" | "video" | "audio",
  mediaUrl: string,
  caption?: string,
  fileName?: string
): Promise<MetaSendResult> {
  try {
    const mediaPayload: Record<string, string> = { link: mediaUrl };
    if (caption && (mediaType === "image" || mediaType === "video" || mediaType === "document")) {
      mediaPayload.caption = caption;
    }
    if (fileName && mediaType === "document") {
      mediaPayload.filename = fileName;
    }

    const res = await fetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${systemToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: mediaType,
        [mediaType]: mediaPayload,
      }),
    });

    const json = (await res.json().catch(() => null)) as {
      messages?: { id: string }[];
      error?: { message?: string };
    } | null;

    if (!res.ok) {
      return {
        ok: false,
        metaMessageId: null,
        error: json?.error?.message ?? `Meta respondeu ${res.status}`,
      };
    }
    return { ok: true, metaMessageId: json?.messages?.[0]?.id ?? null, error: null };
  } catch (err) {
    return {
      ok: false,
      metaMessageId: null,
      error: err instanceof Error ? err.message : "Falha de rede ao chamar a Meta",
    };
  }
}

/**
 * Assina o app do Tech Provider nos webhooks da WABA do cliente
 * (necessário após o Embedded Signup para receber mensagens).
 */
export async function subscribeAppToWaba(
  wabaId: string
): Promise<{ ok: boolean; error: string | null; code?: number }> {
  try {
    const res = await fetch(`${GRAPH_BASE}/${wabaId}/subscribed_apps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${systemToken()}` },
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as {
        error?: { message?: string; code?: number };
      } | null;
      return {
        ok: false,
        error: json?.error?.message ?? `Meta respondeu ${res.status} em subscribed_apps`,
        code: json?.error?.code,
      };
    }
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Falha de rede ao chamar subscribed_apps" };
  }
}

export async function registerPhoneNumber(
  phoneNumberId: string,
  pin = "000000"
): Promise<{ ok: boolean; error: string | null; code?: number }> {
  try {
    const res = await fetch(`${GRAPH_BASE}/${phoneNumberId}/register`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${systemToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", pin }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as {
        error?: { message?: string; code?: number };
      } | null;
      return {
        ok: false,
        error: json?.error?.message ?? `Meta respondeu ${res.status} em register`,
        code: json?.error?.code,
      };
    }
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Falha de rede ao registrar número" };
  }
}

/** Busca o número formatado e o nome verificado de um phone_number_id. */
export async function fetchPhoneDisplay(
  phoneNumberId: string
): Promise<{ display: string | null; verifiedName: string | null }> {
  try {
    const res = await fetch(
      `${GRAPH_BASE}/${phoneNumberId}?fields=display_phone_number,verified_name`,
      { headers: { Authorization: `Bearer ${systemToken()}` } }
    );
    if (!res.ok) return { display: null, verifiedName: null };
    const json = (await res.json()) as {
      display_phone_number?: string;
      verified_name?: string;
    };
    return {
      display: json.display_phone_number ?? null,
      verifiedName: json.verified_name ?? null,
    };
  } catch {
    return { display: null, verifiedName: null };
  }
}

/**
 * Troca o code do Embedded Signup por um token de integração do cliente.
 * Não armazenamos esse token (o envio usa o token global do Tech Provider),
 * mas a troca confirma que a autorização foi concluída de verdade.
 */
export async function exchangeEmbeddedSignupCode(
  code: string
): Promise<boolean> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) return false;

  try {
    const params = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      code,
    });
    const res = await fetch(`${GRAPH_BASE}/oauth/access_token?${params}`);
    return res.ok;
  } catch {
    return false;
  }
}
