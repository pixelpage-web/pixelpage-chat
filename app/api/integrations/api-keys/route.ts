import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { generateApiKey } from "@/lib/api-keys";

/**
 * Gestão de API keys da organização (somente dono).
 * POST   → gera uma chave nova; o valor em claro é retornado UMA única vez
 * DELETE → revoga uma chave (?id=)
 */

export async function POST(request: Request) {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (session.profile.role !== "owner" && session.profile.role !== "admin") {
    return NextResponse.json(
      { error: "Apenas o dono da organização gerencia API keys" },
      { status: 403 }
    );
  }

  let label = "Padrão";
  try {
    const body = (await request.json()) as { label?: string };
    if (body.label?.trim()) label = body.label.trim().slice(0, 64);
  } catch {
    // corpo opcional
  }

  const { plaintext, hash } = generateApiKey();

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      org_id: session.profile.org_id,
      key_hash: hash,
      label,
    })
    .select("id, label, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Falha ao gerar a chave" }, { status: 500 });
  }

  await supabase.from("audit_logs").insert({
    org_id: session.profile.org_id,
    actor_id: session.user.id,
    action: "api_key.created",
    metadata: { key_id: data.id, label },
  });

  // Única vez que o valor em claro é exposto
  return NextResponse.json({ key: plaintext, id: data.id, label: data.label });
}

export async function DELETE(request: Request) {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (session.profile.role !== "owner" && session.profile.role !== "admin") {
    return NextResponse.json(
      { error: "Apenas o dono da organização gerencia API keys" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Parâmetro id é obrigatório" }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("api_keys")
    .delete()
    .eq("id", id)
    .eq("org_id", session.profile.org_id);

  if (error) {
    return NextResponse.json({ error: "Falha ao revogar a chave" }, { status: 500 });
  }

  await supabase.from("audit_logs").insert({
    org_id: session.profile.org_id,
    actor_id: session.user.id,
    action: "api_key.revoked",
    metadata: { key_id: id },
  });

  return NextResponse.json({ ok: true });
}
