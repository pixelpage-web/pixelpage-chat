import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-keys";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * API pública — contatos.
 * GET  /api/v1/contacts?search=&tag=&limit=   → lista
 * POST /api/v1/contacts { phone, name?, tags?, notes? } → cria/atualiza
 */

export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim();
  const tag = searchParams.get("tag")?.trim();
  const max = Math.min(Math.max(Number(searchParams.get("limit")) || 100, 1), 500);

  const admin = createAdminClient();
  let query = admin
    .from("contacts")
    .select("id, phone, name, tags, blocked, created_at")
    .eq("org_id", auth.orgId)
    .order("created_at", { ascending: false })
    .limit(max);
  if (tag) query = query.contains("tags", [tag.toLowerCase()]);
  if (search) query = query.or(`name.ilike.%${search}%,phone.like.%${search}%`);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json(
      { error: "Falha ao listar contatos" },
      { status: 500, headers: rateLimitHeaders(limit) }
    );
  }
  return NextResponse.json({ contacts: data ?? [] }, { headers: rateLimitHeaders(limit) });
}

export async function POST(request: Request) {
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

  let body: { phone?: string; name?: string; tags?: string[]; notes?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "JSON inválido" },
      { status: 400, headers: rateLimitHeaders(limit) }
    );
  }

  const phone = String(body.phone ?? "").replace(/\D/g, "");
  if (phone.length < 10) {
    return NextResponse.json(
      { error: "phone deve ser E.164 (ex.: 5511999998888)" },
      { status: 400, headers: rateLimitHeaders(limit) }
    );
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
    return NextResponse.json(
      { error: "Falha ao salvar o contato" },
      { status: 500, headers: rateLimitHeaders(limit) }
    );
  }

  return NextResponse.json(
    { contact: data },
    { status: 201, headers: rateLimitHeaders(limit) }
  );
}
