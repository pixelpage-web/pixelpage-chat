import { guardApiV1 } from "@/lib/api-guard";
import { apiOk, apiError } from "@/lib/api-response";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * API pública — GET /api/v1/conversations/{id}/messages
 * Histórico de mensagens de uma conversa (ordem cronológica).
 *
 * Query params:
 *   - limit: 1–200 (padrão 20)
 *   - before: ISO 8601 — retorna mensagens anteriores a este instante
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const guard = await guardApiV1(request);
  if (!guard.ok) return guard.response;
  const { auth, headers } = guard;

  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 20, 1), 200);
  const before = searchParams.get("before");

  const admin = createAdminClient();

  // A conversa precisa pertencer à organização da API key
  const { data: conversation } = await admin
    .from("conversations")
    .select("id, org_id")
    .eq("id", id)
    .maybeSingle();
  if (!conversation || conversation.org_id !== auth.orgId) {
    return apiError("Conversa não encontrada", { status: 404, headers });
  }

  let query = admin
    .from("messages")
    .select("id, direction, sender_type, content, message_type, media_url, created_at")
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
    return apiError("Falha ao listar mensagens", { status: 500, headers });
  }

  return apiOk(
    {
      conversation_id: id,
      messages: (messages ?? []).reverse().map((m) => ({
        id: m.id,
        direction: m.direction,
        sender_type: m.sender_type,
        text: m.content,
        type: m.message_type,
        media_url: m.media_url,
        created_at: m.created_at,
      })),
    },
    { headers }
  );
}
