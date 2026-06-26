import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildReplyToken,
  deliverToWebhook,
  type PixelPageWebhookPayload,
} from "@/lib/external-webhook";

/**
 * Dispara um evento de teste para o webhook externo configurado,
 * com payload idêntico ao de produção (assinado com HMAC).
 */
export async function POST(request: Request) {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const orgId = session.profile.org_id;

  let body: { webhook_id?: string };
  try {
    body = (await request.json()) as { webhook_id?: string };
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }
  if (!body.webhook_id) {
    return NextResponse.json({ error: "webhook_id é obrigatório" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: webhook } = await admin
    .from("external_webhooks")
    .select("*")
    .eq("id", body.webhook_id)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!webhook) {
    return NextResponse.json({ error: "Webhook não encontrado" }, { status: 404 });
  }

  const testConversationId = "00000000-0000-0000-0000-000000000000";
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://app.pixelpagechat.com.br";
  const payload: PixelPageWebhookPayload = {
    event: "message.test",
    organization_id: orgId,
    conversation_id: testConversationId,
    contact: { name: "Contato de Teste", phone: "5511999998888" },
    message: {
      id: "test-message-id",
      text: "Este é um evento de teste da PixelPage Chat 🚀",
      type: "text",
      media_url: null,
      timestamp: new Date().toISOString(),
    },
    reply_token: buildReplyToken(webhook.secret, testConversationId),
    app_url: appUrl,
  };

  const result = await deliverToWebhook(admin, webhook, payload);

  if (!result.ok) {
    return NextResponse.json(
      {
        error: `Falha na entrega: ${result.error ?? "sem resposta"}`,
        status_code: result.statusCode,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, status_code: result.statusCode });
}
