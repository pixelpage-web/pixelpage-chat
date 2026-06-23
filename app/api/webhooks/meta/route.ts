import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse, after } from "next/server";
import { processMetaWebhook, type MetaWebhookBody } from "@/lib/pipeline";

/**
 * Webhook ÚNICO global do app Meta (Tech Provider).
 *
 * GET  → verificação do webhook (hub.challenge) com o verify token de env
 * POST → eventos de mensagens. Responde 200 em <200ms e processa de forma
 *        assíncrona via after() — a Meta reenvia eventos se demorarmos.
 */

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// GET — desafio de verificação da Meta
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.META_VERIFY_TOKEN;

  if (mode === "subscribe" && verifyToken && token === verifyToken && challenge) {
    // A Meta espera o challenge em texto puro
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

// ---------------------------------------------------------------------------
// POST — eventos de mensagens
// ---------------------------------------------------------------------------

/** Valida a assinatura X-Hub-Signature-256 (HMAC do corpo com o App Secret). */
function isValidSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    // Sem App Secret configurado (dev) — aceita, mas avisa no log
    console.warn("[meta-webhook] META_APP_SECRET ausente — assinatura não validada");
    return true;
  }
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const received = signatureHeader.slice("sha256=".length);
  if (expected.length !== received.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!isValidSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return new Response("Invalid signature", { status: 401 });
  }

  let body: MetaWebhookBody;
  try {
    body = JSON.parse(rawBody) as MetaWebhookBody;
  } catch {
    // Corpo inválido — 200 mesmo assim para a Meta não reenviar lixo
    return NextResponse.json({ received: true });
  }

  if (body.object !== "whatsapp_business_account") {
    return NextResponse.json({ received: true });
  }

  // Processamento assíncrono APÓS a resposta — mantém o webhook <200ms
  after(async () => {
    try {
      await processMetaWebhook(body);
    } catch (err) {
      console.error("[meta-webhook] erro no processamento assíncrono:", err);
    }
  });

  return NextResponse.json({ received: true });
}
