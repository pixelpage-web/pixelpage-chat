import { guardApiV1 } from "@/lib/api-guard";
import { apiOk, apiError } from "@/lib/api-response";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * API pública — conversa individual.
 * GET   /api/v1/conversations/{id}  → detalhe (com contato)
 * PATCH /api/v1/conversations/{id}  → { status?: "open"|"resolved"|"pending", bot_paused?: boolean }
 */

async function loadConversation(orgId: string, id: string) {
  const admin = createAdminClient();
  const { data: conversation } = await admin
    .from("conversations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!conversation || conversation.org_id !== orgId) return null;

  const { data: contact } = await admin
    .from("contacts")
    .select("name, phone, tags")
    .eq("id", conversation.contact_id)
    .maybeSingle();

  return {
    id: conversation.id,
    status: conversation.status,
    bot_paused: conversation.bot_paused,
    unread_count: conversation.unread_count,
    connection_id: conversation.connection_id,
    last_message_at: conversation.last_message_at,
    created_at: conversation.created_at,
    contact: contact
      ? { name: contact.name, phone: contact.phone, tags: contact.tags }
      : null,
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const guard = await guardApiV1(request);
  if (!guard.ok) return guard.response;
  const { auth, headers } = guard;

  const { id } = await context.params;
  const conversation = await loadConversation(auth.orgId, id);
  if (!conversation) {
    return apiError("Conversa não encontrada", { status: 404, headers });
  }
  return apiOk({ conversation }, { headers });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const guard = await guardApiV1(request);
  if (!guard.ok) return guard.response;
  const { auth, headers } = guard;

  const { id } = await context.params;

  let body: { status?: string; bot_paused?: boolean };
  try {
    body = (await request.json()) as { status?: string; bot_paused?: boolean };
  } catch {
    return apiError("JSON inválido", { status: 400, headers });
  }

  const hasStatus = body.status !== undefined;
  const hasBotPaused = typeof body.bot_paused === "boolean";
  if (!hasStatus && !hasBotPaused) {
    return apiError("Informe 'status' e/ou 'bot_paused'.", { status: 400, headers });
  }
  if (
    hasStatus &&
    body.status !== "open" &&
    body.status !== "resolved" &&
    body.status !== "pending"
  ) {
    return apiError("status deve ser open, resolved ou pending", {
      status: 400,
      headers,
    });
  }

  const existing = await loadConversation(auth.orgId, id);
  if (!existing) {
    return apiError("Conversa não encontrada", { status: 404, headers });
  }

  const patch: { status?: "open" | "resolved" | "pending"; bot_paused?: boolean } = {};
  if (hasStatus) patch.status = body.status as "open" | "resolved" | "pending";
  if (hasBotPaused) patch.bot_paused = body.bot_paused;

  const admin = createAdminClient();
  const { error } = await admin.from("conversations").update(patch).eq("id", id);
  if (error) {
    return apiError("Falha ao atualizar a conversa", { status: 500, headers });
  }

  return apiOk({ conversation: { ...existing, ...patch } }, { headers });
}
