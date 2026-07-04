import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** POST — registra um clique no link de indicação (sem autenticação). */
export async function POST(request: Request) {
  const { code } = (await request.json().catch(() => ({}))) as {
    code?: string;
  };

  if (!code || typeof code !== "string" || !/^[a-f0-9]{6,12}$/.test(code)) {
    return NextResponse.json({ error: "Código inválido" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: link } = await admin
    .from("referral_links")
    .select("id, enabled, clicks")
    .eq("code", code)
    .maybeSingle();

  if (!link || !link.enabled) {
    return NextResponse.json({ error: "Link não encontrado" }, { status: 404 });
  }

  // Incrementa contador — falha silenciosa (não bloqueia o usuário)
  await admin
    .from("referral_links")
    .update({ clicks: link.clicks + 1 } as never)
    .eq("id", link.id);

  // Busca count atualizado
  const { data: updated } = await admin
    .from("referral_links")
    .select("clicks")
    .eq("id", link.id)
    .maybeSingle();

  return NextResponse.json({ ok: true, clicks: updated?.clicks ?? 0 });
}
