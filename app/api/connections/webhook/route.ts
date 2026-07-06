import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUrlSafeForOutbound } from "@/lib/ssrf-guard";
import { encryptSecret } from "@/lib/crypto";
import type { ExternalWebhookRow } from "@/types/database";

/**
 * Salva a config de um webhook n8n PRÓPRIO do cliente — tanto o de uma conexão
 * específica (aba "Meu n8n" em components/connections/webhook-config.tsx,
 * `connection_id` presente) quanto o webhook geral da org, sem conexão
 * associada (components/integrations/webhook-card.tsx, `connection_id`
 * omitido/null, com `subscribed_events`). Antes desta rota, ambos os
 * componentes escreviam direto em external_webhooks via RLS, só validando a
 * URL com um regex client-side (sem proteção de SSRF e sem forma de
 * configurar auth para o n8n do cliente). Esta rota é a fronteira de
 * segurança real para os dois: valida a URL (SSRF) no servidor e, se uma
 * n8n_api_key vier junto, cifra e guarda em org_secrets (nunca em texto puro).
 */
export async function POST(request: Request) {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const orgId = session.profile.org_id;

  let body: {
    connection_id?: string | null;
    url?: string;
    n8n_api_key?: string;
    subscribed_events?: string[];
  };
  try {
    body = (await request.json()) as {
      connection_id?: string | null;
      url?: string;
      n8n_api_key?: string;
      subscribed_events?: string[];
    };
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const connectionId = body.connection_id?.trim() || null;
  const url = body.url?.trim();
  const n8nApiKey = body.n8n_api_key?.trim();
  const subscribedEvents = body.subscribed_events;

  if (!url) {
    return NextResponse.json({ error: "url é obrigatória" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Quando há connection_id, ela precisa pertencer à org do chamador — nunca
  // confiar em connection_id vindo do cliente sem checar (evita uma org
  // escrever no webhook de outra org via um connection_id adivinhado/vazado).
  // Sem connection_id (webhook geral da org, sem conexão associada), a
  // sessão já garante que só a própria org é afetada.
  if (connectionId) {
    const { data: connection } = await admin
      .from("whatsapp_connections")
      .select("id, org_id")
      .eq("id", connectionId)
      .maybeSingle();
    if (!connection || connection.org_id !== orgId) {
      return NextResponse.json({ error: "Conexão não encontrada" }, { status: 404 });
    }
  }

  const ssrfCheck = await isUrlSafeForOutbound(url);
  if (!ssrfCheck.safe) {
    return NextResponse.json({ error: ssrfCheck.reason }, { status: 400 });
  }

  let existingQuery = admin.from("external_webhooks").select("id").eq("org_id", orgId);
  existingQuery = connectionId
    ? existingQuery.eq("connection_id", connectionId)
    : existingQuery.is("connection_id", null);
  const { data: existing } = await existingQuery.maybeSingle();

  const updatePatch: Partial<ExternalWebhookRow> = {
    url,
    use_platform_workflow: false,
    active: true,
  };
  if (subscribedEvents) updatePatch.subscribed_events = subscribedEvents;

  let webhookRow: ExternalWebhookRow | null = null;

  if (existing) {
    // Atualização: nunca regenera o secret existente aqui.
    const { data, error } = await admin
      .from("external_webhooks")
      .update(updatePatch)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: "Não foi possível salvar o webhook." },
        { status: 500 }
      );
    }
    webhookRow = data;
  } else {
    // Primeira vez: gera o secret de assinatura HMAC (mesmo formato de
    // components/connections/webhook-config.tsx::randomSecret()).
    const secret = randomBytes(32).toString("hex");
    const { data, error } = await admin
      .from("external_webhooks")
      .insert({
        org_id: orgId,
        connection_id: connectionId,
        url,
        secret,
        use_platform_workflow: false,
        active: true,
        ...(subscribedEvents ? { subscribed_events: subscribedEvents } : {}),
      })
      .select("*")
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: "Não foi possível salvar o webhook." },
        { status: 500 }
      );
    }
    webhookRow = data;
  }

  if (n8nApiKey) {
    const encrypted = encryptSecret(n8nApiKey);
    const { error: secretsError } = await admin
      .from("org_secrets")
      .upsert({ org_id: orgId, n8n_api_key_encrypted: encrypted }, { onConflict: "org_id" });
    if (secretsError) {
      console.error(
        "[connections/webhook] falha ao salvar chave de auth do n8n:",
        orgId,
        secretsError.message
      );
      // Não falha a request inteira por isso — o webhook em si já foi salvo.
    }
  }

  return NextResponse.json(webhookRow);
}
