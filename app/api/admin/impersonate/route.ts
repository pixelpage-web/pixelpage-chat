import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionProfile, IMPERSONATE_COOKIE } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Impersonação (suporte): admin entra no /app vendo os dados de uma org.
 * POST   { org_id } → ativa
 * DELETE            → encerra
 */

export async function POST(request: Request) {
  const session = await getSessionProfile();
  if (session?.profile?.role !== "admin") {
    return NextResponse.json({ error: "Apenas admin" }, { status: 403 });
  }

  let body: { org_id?: string };
  try {
    body = (await request.json()) as { org_id?: string };
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }
  if (!body.org_id) {
    return NextResponse.json({ error: "org_id é obrigatório" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("id, name")
    .eq("id", body.org_id)
    .maybeSingle();
  if (!org) {
    return NextResponse.json({ error: "Organização não encontrada" }, { status: 404 });
  }

  await admin.from("audit_logs").insert({
    org_id: org.id,
    actor_id: session.user.id,
    action: "admin.impersonate_started",
    metadata: { org_name: org.name },
  });

  const cookieStore = await cookies();
  cookieStore.set(IMPERSONATE_COOKIE, org.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 2, // expira em 2h por segurança
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const session = await getSessionProfile();
  if (session?.profile?.role !== "admin") {
    return NextResponse.json({ error: "Apenas admin" }, { status: 403 });
  }

  const cookieStore = await cookies();
  cookieStore.delete(IMPERSONATE_COOKIE);
  return NextResponse.json({ ok: true });
}
