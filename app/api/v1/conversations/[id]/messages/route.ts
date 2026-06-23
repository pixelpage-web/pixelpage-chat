import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-keys";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * API pública — GET /api/v1/conversations/{id}/messages
 * Histórico de mensagens de uma conversa (ordem cronológica).
 *
 * Query params:
 *   - limit: 1–200 (padrão 100)
 *   - before: ISO 8601 — retorna mensagens anteriores a este instante
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateApiKey(request);
  if (!auth) {
    return NextResponse.json(
      { error: "API key inválida ou ausente. Use Authorization: Bearer zari_..." },
      { status: 401 }
    );
  }
  const rl = checkRateLimit(auth.keyId);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit excedido (60 req/min)" },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 100, 1), 200);
  const before = searchParams.get("before");

  const admin = createAdminClient();

  // A conversa precisa pertencer à organização da API key
  const { data: conversation } = await admin
    .from("conversations")
    .select("id, org_id")
    .eq("id", id)
    .maybeSingle();
  if (!conversation || conversation.org_id !== auth.orgId) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }

  let query = admin
    .from("messages")
    .select("id, direction, sender_type, content, message_type, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (before) {
    const date = new Date(before);
    if (!Number.isNaN(date.getTime())) {
      query = query.lt("created_at", date.toISOString());
    }
  }

  const { data: messages, error } = await query;
  if (error) {
    return NextResponse.json({ error: "Falha ao listar mensagens" }, { status: 500 });
  }

  return NextResponse.json({
    conversation_id: id,
    messages: (messages ?? []).reverse().map((m) => ({
      id: m.id,
      direction: m.direction,
      sender_type: m.sender_type,
      text: m.content,
      type: m.message_type,
      created_at: m.created_at,
    })),
  }, { headers: rateLimitHeaders(rl) });
}
