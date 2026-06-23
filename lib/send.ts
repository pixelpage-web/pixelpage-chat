import { sendWhatsappText, sendWhatsappMedia } from "@/lib/meta";
import { sendEvolutionText, sendEvolutionMedia } from "@/lib/evolution";
import type { ConnectionType } from "@/types/database";

/**
 * Envio unificado: decide entre Meta Cloud API (api oficial) e
 * Evolution API (QR Code) conforme o tipo da conexão.
 */

export interface SendableConnection {
  connection_type: ConnectionType;
  phone_number_id: string | null;
  evolution_instance_id: string | null;
  status: string;
}

export interface UnifiedSendResult {
  ok: boolean;
  providerMessageId: string | null;
  error: string | null;
}

/** A conexão está apta a enviar mensagens reais? */
export function canSend(connection: SendableConnection | null): boolean {
  if (!connection || connection.status !== "connected") return false;
  if (connection.connection_type === "qr_code") {
    return !!connection.evolution_instance_id;
  }
  return !!connection.phone_number_id;
}

export async function sendText(
  connection: SendableConnection,
  toPhone: string,
  text: string
): Promise<UnifiedSendResult> {
  if (connection.connection_type === "qr_code" && connection.evolution_instance_id) {
    const result = await sendEvolutionText(
      connection.evolution_instance_id,
      toPhone,
      text
    );
    return { ok: result.ok, providerMessageId: result.messageId, error: result.error };
  }

  if (connection.phone_number_id) {
    const result = await sendWhatsappText(connection.phone_number_id, toPhone, text);
    return { ok: result.ok, providerMessageId: result.metaMessageId, error: result.error };
  }

  return { ok: false, providerMessageId: null, error: "Conexão sem canal de envio" };
}

export async function sendMedia(
  connection: SendableConnection,
  toPhone: string,
  mediaType: "image" | "document" | "video" | "audio",
  mediaUrl: string,
  caption?: string,
  fileName?: string
): Promise<UnifiedSendResult> {
  if (connection.connection_type === "qr_code" && connection.evolution_instance_id) {
    const result = await sendEvolutionMedia(
      connection.evolution_instance_id,
      toPhone,
      mediaType,
      mediaUrl,
      caption,
      fileName
    );
    return { ok: result.ok, providerMessageId: result.messageId, error: result.error };
  }

  if (connection.phone_number_id) {
    const result = await sendWhatsappMedia(
      connection.phone_number_id,
      toPhone,
      mediaType,
      mediaUrl,
      caption,
      fileName
    );
    return { ok: result.ok, providerMessageId: result.metaMessageId, error: result.error };
  }

  return { ok: false, providerMessageId: null, error: "Conexão sem canal de envio" };
}
