import { NextResponse, after } from "next/server";
import {
  processEvolutionWebhook,
  type EvolutionWebhookBody,
} from "@/lib/pipeline";

/**
 * Webhook da Evolution API (conexões via QR Code).
 * URL cadastrada na instância: {APP_URL}/api/webhooks/evolution?token=XXX
 * Responde 200 imediatamente; processamento assíncrono via after().
 */

export const runtime = "nodejs";

export async function POST(request: Request) {
  // Validação simples por token na query (configurado ao criar a instância)
  const expected = process.env.EVOLUTION_WEBHOOK_TOKEN;
  if (expected) {
    const token = new URL(request.url).searchParams.get("token");
    if (token !== expected) {
      return NextResponse.json({ error: "Token inválido" }, { status: 401 });
    }
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
