import { guardApiV1 } from "@/lib/api-guard";
import { apiOk, apiError } from "@/lib/api-response";
import { createAdminClient } from "@/lib/supabase/admin";
import { startFlowOnConversation } from "@/lib/flow-runner";
import { isSubscriptionBlocked } from "@/lib/billing";

/**
 * API pública — POST /api/v1/flows/{id}/trigger
 * Dispara um fluxo publicado para um contato (proativo).
 * Body: { phone: string, name?: string }
 *
 * Cria/encontra o contato e a conversa (usando uma conexão conectada) e inicia
 * o fluxo a partir do primeiro nó. O fluxo precisa estar PUBLICADO.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const guard = await guardApiV1(request);
  if (!guard.ok) return guard.response;
  const { auth, headers } = guard;

  const { id: flowId } = await context.params;

  let body: { phone?: string; name?: string };
  try {
    body = (await request.json()) as { phone?: string; name?: string };
  } catch {
    return apiError("JSON inválido", { status: 400, headers });
  }

  const phone = String(body.phone ?? "").replace(/\D/g, "");
  if (phone.length < 10) {
    return apiError("phone deve ser E.164 (ex.: 5511999998888)", {
      status: 400,
      headers,
    });
  }

  const admin = createAdminClient();

  // Bloqueio por assinatura (fluxo dispara mensagens)
  const { data: subscription } = await admin
    .from("subscriptions")
    .select("status, trial_ends_at, current_period_end")
    .eq("org_id", auth.orgId)
    .maybeSingle();
  if (isSubscriptionBlocked(subscription ?? null)) {
    return apiError("Plano expirado — regularize a assinatura.", {
      status: 403,
      headers,
    });
  }

  // O fluxo precisa ser da org e estar publicado
  const { data: flow } = await admin
    .from("flows")
    .select("id, org_id, status, connection_id")
    .eq("id", flowId)
    .maybeSingle();
  if (!flow || flow.org_id !== auth.orgId) {
    return apiError("Fluxo não encontrado", { status: 404, headers });
  }
  if (flow.status !== "published") {
    return apiError("O fluxo precisa estar publicado para ser disparado.", {
      status: 409,
      headers,
    });
  }

  // Precisa de uma conexão conectada para enviar (o fluxo do flow ou qualquer uma)
  let connectionId = flow.connection_id;
  if (!connectionId) {
    const { data: connection } = await admin
      .from("whatsapp_connections")
      .select("id")
      .eq("org_id", auth.orgId)
      .eq("status", "connected")
      .limit(1)
      .maybeSingle();
    connectionId = connection?.id ?? null;
  }
  if (!connectionId) {
    return apiError("Nenhuma conexão WhatsApp conectada para disparar o fluxo.", {
      status: 409,
      headers,
    });
  }

  // Encontra/cria o contato
  let { data: contact } = await admin
    .from("contacts")
    .select("id")
    .eq("org_id", auth.orgId)
    .eq("phone", phone)
    .maybeSingle();
  if (!contact) {
    const { data: created } = await admin
      .from("contacts")
      .insert({ org_id: auth.orgId, phone, name: body.name?.trim() || null })
      .select("id")
      .single();
    contact = created;
  }
  if (!contact) {
    return apiError("Falha ao registrar o contato", { status: 500, headers });
  }

  // Encontra/cria a conversa vinculada à conexão conectada
  let { data: conversation } = await admin
    .from("conversations")
    .select("id")
    .eq("org_id", auth.orgId)
    .eq("contact_id", contact.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!conversation) {
    const { data: created } = await admin
      .from("conversations")
      .insert({ org_id: auth.orgId, contact_id: contact.id, connection_id: connectionId })
      .select("id")
      .single();
    conversation = created;
  } else {
    // Garante que a conversa tem uma conexão para o fluxo enviar
    await admin
      .from("conversations")
      .update({ connection_id: connectionId })
      .eq("id", conversation.id);
  }
  if (!conversation) {
    return apiError("Falha ao preparar a conversa", { status: 500, headers });
  }

  await startFlowOnConversation({ admin, flowId, conversationId: conversation.id });

  return apiOk(
    { triggered: true, flow_id: flowId, conversation_id: conversation.id },
    { status: 202, headers }
  );
}
