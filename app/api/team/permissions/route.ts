import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOwnerRole, isValidPermissions } from "@/lib/permissions";

/**
 * Grava profiles.permissions de um membro da equipe (editor granular em
 * /app/equipe). Só dono/admin chamam esta rota — mesmo gate de
 * app/api/team/invite/route.ts. Usa service_role (bypassa o trigger
 * anti-auto-promoção da migration 0046), então a checagem de owner/admin
 * aqui É o controle de segurança; por isso confirma também que o alvo
 * pertence à mesma org e não é ele mesmo dono/admin/superadmin (permissões
 * granulares não fazem sentido pra quem já tem isOwnerRole = acesso total).
 */
export async function PATCH(request: Request) {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (session.profile.role !== "owner" && session.profile.role !== "admin") {
    return NextResponse.json(
      { error: "Apenas o dono edita permissões" },
      { status: 403 }
    );
  }
  const orgId = session.profile.org_id;

  let body: { memberId?: string; permissions?: unknown };
  try {
    body = (await request.json()) as { memberId?: string; permissions?: unknown };
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const memberId = body.memberId;
  if (!memberId || typeof memberId !== "string") {
    return NextResponse.json({ error: "Membro inválido" }, { status: 400 });
  }
  if (!isValidPermissions(body.permissions)) {
    return NextResponse.json({ error: "Permissões inválidas" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("profiles")
    .select("id, org_id, role")
    .eq("id", memberId)
    .maybeSingle();

  if (!target || target.org_id !== orgId) {
    return NextResponse.json({ error: "Membro não encontrado" }, { status: 404 });
  }
  if (isOwnerRole(target.role)) {
    return NextResponse.json(
      { error: "Donos/admins não usam permissões granulares." },
      { status: 400 }
    );
  }

  const { error } = await admin
    .from("profiles")
    .update({ permissions: body.permissions })
    .eq("id", memberId)
    .eq("org_id", orgId);

  if (error) {
    return NextResponse.json(
      { error: "Não foi possível salvar as permissões." },
      { status: 500 }
    );
  }

  await admin.from("audit_logs").insert({
    org_id: orgId,
    actor_id: session.user.id,
    action: "team.member_permissions_updated",
    metadata: { member_id: memberId },
  });

  return NextResponse.json({ ok: true });
}
