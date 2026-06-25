import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { deliverToWebhook, type ZariWebhookPayload } from "@/lib/external-webhook";

/**
 * Reenvio manual de um disparo de webhook que falhou (painel admin → Logs).
 * POST { log_id } → reenvia o payload original para a URL atual do webhook.
 */
export async function POST(request: Request) {
  const session = await getSessionProfile();
  const role = session?.profile?.role;
  if (role !== "admin" && role !== "superadmin") {
    return NextResponse.json({ error: "Acesso restrito" }, { status: 403 });
  }

  let body: { log_id?: string };
  try {
    body = (await request.json()) as { log_id?: string };
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }
  if (!body.log_id) {
    return NextResponse.json({ error: "log_id é obrigatório" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: log } = await admin
    .from("webhook_logs")
    .select("*")
    .eq("id", body.log_id)
    .maybeSingle();
  if (!log?.payload) {
    return NextResponse.json(
      { error: "Disparo sem payload salvo (anterior ao recurso de reenvio)" },
      { status: 400 }
    );
  }

  const { data: webhook } = await admin
    .from("external_webhooks")
    .select("*")
    .eq("id", log.webhook_id)
    .maybeSingle();
  if (!webhook) {
    return NextResponse.json({ error: "Webhook não existe mais" }, { status: 404 });
  }

  const result = await deliverToWebhook(
    admin,
    webhook,
    log.payload as unknown as ZariWebhookPayload
  );

  return NextResponse.json({
    ok: result.ok,
    status_code: result.statusCode,
    error: result.error,
  });
}
