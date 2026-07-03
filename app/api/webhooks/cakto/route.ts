import { NextResponse } from "next/server";

// Diagnóstico — fase 1/2 da integração Cakto.
// Não valida assinatura ainda: isso vem na próxima rodada,
// depois de dispararmos o teste real e vermos o header nos logs da Vercel.
// TODO fase 2: validar HMAC-SHA256 contra CAKTO_WEBHOOK_SECRET.

export async function POST(request: Request) {
  const rawBody = await request.text();

  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  console.log("[cakto-webhook-diagnostic] headers:", JSON.stringify(headers, null, 2));
  console.log("[cakto-webhook-diagnostic] body:", rawBody);

  // TODO fase 2: parsear evento e atualizar subscriptions no Supabase.

  return NextResponse.json({ received: true }, { status: 200 });
}
