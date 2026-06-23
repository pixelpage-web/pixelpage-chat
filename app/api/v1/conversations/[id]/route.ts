import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-keys";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * API pública — conversa individual.
 * GET   /api/v1/conversations/{id}  → detalhe (com contato)
 * PATCH /api/v1/conversations/{id}  → { status: "open" | "resolved" | "pending" }
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
  const auth = await authenticateApiKey(request);
  if (!auth) {
    return NextResponse.json({ error: "API key inválida ou ausente" }, { status: 401 });
  }
  const limit = checkRateLimit(auth.keyId);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Rate limit excedido (60 req/min)" },
      { status: 429, headers: rateLimitHeaders(limit) }
    );
  }

  const { id } = await context.params;
  const conversation = await loadConversation(auth.orgId, id);
  if (!conversation) {
    return NextResponse.json(
      { error: "Conversa não encontrada" },
      { status: 404, headers: rateLimitHeaders(limit) }
    );
  }
  return NextResponse.json({ conversation }, { headers: rateLimitHeaders(limit) });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateApiKey(request);
  if (!auth) {
    return NextResponse.json({ error: "API key inválida ou ausente" }, { status: 401 });
  }
  const limit = checkRateLimit(auth.keyId);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Rate limit excedido (60 req/min)" },
      { status: 429, headers: rateLimitHeaders(limit) }
    );
  }

  const { id } = await context.params;

  let body: { status?: string };
  try {
    body = (await request.json()) as { status?: string };
  } catch {
    return NextResponse.json(
      { error: "JSON inválido" },
      { status: 400, headers: rateLimitHeaders(limit) }
    );
  }
  if (
    body.status !== "open" &&
    body.status !== "resolved" &&
    body.status !== "pending"
  ) {
    return NextResponse.json(
      { error: "status deve ser open, resolved ou pending" },
      { status: 400, headers: rateLimitHeaders(limit) }
    );
  }

  const existing = await loadConversation(auth.orgId, id);
  if (!existing) {
    return NextResponse.json(
      { error: "Conversa não encontrada" },
      { status: 404, headers: rateLimitHeaders(limit) }
    );
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("conversations")
    .update({ status: body.status })
    .eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: "Falha ao atualizar a conversa" },
      { status: 500, headers: rateLimitHeaders(limit) }
    );
  }

  return NextResponse.json(
    { conversation: { ...existing, status: body.status } },
    { headers: rateLimitHeaders(limit) }
  );
}
