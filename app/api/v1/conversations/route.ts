import { guardApiV1 } from "@/lib/api-guard";
import { apiOk, apiError } from "@/lib/api-response";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * API pública — GET /api/v1/conversations
 * Lista as conversas da organização (mais recentes primeiro).
 *
 * Query params:
 *   - status: "open" | "resolved" | "pending" (opcional)
 *   - limit: 1–100 (padrão 20)
 *   - page: 1+ (padrão 1) — paginação
 */
export async function GET(request: Request) {
  const guard = await guardApiV1(request);
  if (!guard.ok) return guard.response;
  const { auth, headers } = guard;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 20, 1), 100);
  const page = Math.max(Number(searchParams.get("page")) || 1, 1);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const admin = createAdminClient();

  let query = admin
    .from("conversations")
    .select(
      "id, status, bot_paused, unread_count, last_message_at, created_at, contact_id",
      { count: "exact" }
    )
    .eq("org_id", auth.orgId)
    .order("last_message_at", { ascending: false })
    .range(from, to);

  if (status === "open" || status === "resolved" || status === "pending") {
    query = query.eq("status", status);
  }

  const { data: conversations, count, error } = await query;
  if (error) {
    return apiError("Falha ao listar conversas", { status: 500, headers });
  }

  // Junta os dados do contato
  const contactIds = [...new Set((conversations ?? []).map((c) => c.contact_id))];
  const { data: contacts } = contactIds.length
    ? await admin.from("contacts").select("id, name, phone, tags").in("id", contactIds)
    : { data: [] };
  const contactMap = new Map((contacts ?? []).map((c) => [c.id, c]));

  return apiOk(
    {
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
      pagination: { page, limit, total: count ?? 0 },
    },
    { headers }
  );
}
