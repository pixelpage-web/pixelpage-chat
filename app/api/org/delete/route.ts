import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Exclusão da conta: apaga a organização (cascata remove conversas, mensagens,
 * conexões, webhooks, chaves etc.) e a conta de login do dono.
 * Ação irreversível — o painel exige confirmação digitando o nome da empresa.
 */
export async function DELETE() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (session.profile.role !== "owner") {
    return NextResponse.json(
      { error: "Apenas o dono pode excluir a conta" },
      { status: 403 }
    );
  }
  const orgId = session.profile.org_id;

  const admin = createAdminClient();

  const { error: orgError } = await admin
    .from("organizations")
    .delete()
    .eq("id", orgId)
    .eq("owner_id", session.user.id);

  if (orgError) {
    return NextResponse.json(
      { error: "Não foi possível excluir a organização." },
      { status: 500 }
    );
  }

  // Remove a conta de login do dono (membros mantêm o login, sem organização)
  await admin.auth.admin.deleteUser(session.user.id).catch(() => undefined);

  return NextResponse.json({ ok: true });
}
