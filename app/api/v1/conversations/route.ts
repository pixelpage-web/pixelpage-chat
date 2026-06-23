import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-keys";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * API pública — GET /api/v1/conversations
 * Lista as conversas da organização (mais recentes primeiro).
 *
 * Query params:
 *   - status: "open" | "resolved" (opcional)
 *   - limit: 1–100 (padrão 50)
 */
export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 50, 1), 100);

  const admin = createAdminClient();

  let query = admin
    .from("conversations")
    .select("id, status, bot_paused, unread_count, last_message_at, created_at, contact_id")
    .eq("org_id", auth.orgId)
    .order("last_message_at", { ascending: false })
    .limit(limit);

  if (status === "open" || status === "resolved") {
    query = query.eq("status", status);
  }

  const { data: conversations, error } = await query;
  if (error) {
    return NextResponse.json({ error: "Falha ao listar conversas" }, { status: 500 });
  }

  // Junta os dados do contato
  const contactIds = [...new Set((conversations ?? []).map((c) => c.contact_id))];
  const { data: contacts } = contactIds.length
    ? await admin
        .from("contacts")
        .select("id, name, phone, tags")
        .in("id", contactIds)
    : { data: [] };
  const contactMap = new Map((contacts ?? []).map((c) => [c.id, c]));

  return NextResponse.json({
    conversations: (conversations ?? []).map((c) => {
      const contact = contactMap.get(c.contact_id);
      return {
        id: c.id,
        status: c.status,
        bot_paused: c.bot_paused,
        unread_count: c.unread_count,
        last_message_at: c.last_message_at,
        created_at: c.created_at,
        contact: contact
          ? { name: contact.name, phone: contact.phone, tags: contact.tags }
          : null,
      };
    }),
  }, { headers: rateLimitHeaders(rl) });
}
