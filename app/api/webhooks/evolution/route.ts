import { createHash, timingSafeEqual } from "crypto";
import { NextResponse, after } from "next/server";
import {
  processEvolutionWebhook,
  type EvolutionWebhookBody,
} from "@/lib/pipeline";

/**
 * Webhook da Evolution API (conexões via QR Code).
 * Autenticado via header x-webhook-token (EVOLUTION_WEBHOOK_TOKEN).
 * Responde 200 imediatamente; processamento assíncrono via after().
 */

export const runtime = "nodejs";

export async function POST(request: Request) {
  const expected = process.env.EVOLUTION_WEBHOOK_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: "Webhook não configurado" }, { status: 503 });
  }
  const received = request.headers.get("x-webhook-token") ?? "";
  // Hash ambos para igualar o tamanho antes de timingSafeEqual (evita erro de buffer)
  const expectedHash = createHash("sha256").update(expected).digest();
  const receivedHash = createHash("sha256").update(received).digest();
  if (!timingSafeEqual(expectedHash, receivedHash)) {
    return NextResponse.json({ error: "Token inválido" }, { status: 401 });
  }

  let body: EvolutionWebhookBody;
  try {
    body = (await request.json()) as EvolutionWebhookBody;
  } catch {
    return NextResponse.json({ received: true });
  }

  after(async () => {
    try {
      await processEvolutionWebhook(body);
    } catch (err) {
      console.error("[evolution-webhook] erro no processamento assíncrono:", err);
    }
  });

  return NextResponse.json({ received: true });
}
