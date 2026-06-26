import { guardApiV1 } from "@/lib/api-guard";
import { apiOk, apiError } from "@/lib/api-response";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * API pública — contatos.
 * GET  /api/v1/contacts?search=&tag=&limit=&page=  → lista paginada
 * POST /api/v1/contacts { phone, name?, tags?, notes? } → cria/atualiza
 */

export async function GET(request: Request) {
  const guard = await guardApiV1(request);
  if (!guard.ok) return guard.response;
  const { auth, headers } = guard;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim();
  const tag = searchParams.get("tag")?.trim();
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 20, 1), 200);
  const page = Math.max(Number(searchParams.get("page")) || 1, 1);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const admin = createAdminClient();
  let query = admin
    .from("contacts")
    .select("id, phone, name, tags, blocked, created_at", { count: "exact" })
    .eq("org_id", auth.orgId)
    .order("created_at", { ascending: false })
    .range(from, to);
  if (tag) query = query.contains("tags", [tag.toLowerCase()]);
  if (search) query = query.or(`name.ilike.%${search}%,phone.like.%${search}%`);

  const { data, count, error } = await query;
  if (error) {
    return apiError("Falha ao listar contatos", { status: 500, headers });
  }
  return apiOk(
    { contacts: data ?? [], pagination: { page, limit, total: count ?? 0 } },
    { headers }
  );
}

export async function POST(request: Request) {
  const guard = await guardApiV1(request);
  if (!guard.ok) return guard.response;
  const { auth, headers } = guard;

  let body: { phone?: string; name?: string; tags?: string[]; notes?: string };
  try {
    body = (await request.json()) as typeof body;
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
  const { data, error } = await admin
    .from("contacts")
    .upsert(
      {
        org_id: auth.orgId,
        phone,
        name: body.name?.trim() || null,
        tags: Array.isArray(body.tags)
          ? body.tags.map((s) => String(s).trim().toLowerCase()).filter(Boolean)
          : [],
        notes: body.notes ?? "",
      },
      { onConflict: "org_id,phone" }
    )
    .select("id, phone, name, tags, created_at")
    .single();

  if (error || !data) {
    return apiError("Falha ao salvar o contato", { status: 500, headers });
  }

  return apiOk({ contact: data }, { status: 201, headers });
}
