import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLE_DEFAULTS } from "@/lib/permissions";
import { sendInviteEmail } from "@/lib/invite-email";
import type { TeamRoleTemplate } from "@/types/database";

export async function GET() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("team_members")
    .select("*, team_member_permissions(*)")
    .eq("org_id", session.profile.org_id)
    .order("invited_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (session.profile.role !== "owner" && session.profile.role !== "admin") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }
  const orgId = session.profile.org_id;
  const { email, name, role_template, permissions } = (await request.json()) as {
    email: string; name: string; role_template: TeamRoleTemplate; permissions?: Partial<typeof ROLE_DEFAULTS.agent>;
  };
  if (!email || !name || !role_template) return NextResponse.json({ error: "email, name e role_template são obrigatórios" }, { status: 400 });

  const admin = createAdminClient();
  const supabase = await createServerSupabase();

  // Verificar limite de funcionários do plano
  const { data: sub } = await supabase.from("subscriptions").select("plan_id").eq("org_id", orgId).maybeSingle();
  if (sub?.plan_id) {
    const { data: plan } = await supabase.from("plans").select("team_limit").eq("id", sub.plan_id).maybeSingle();
    if (plan?.team_limit !== null && plan?.team_limit !== undefined) {
      const { count: occupiedSlots } = await admin
        .from("team_members")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .in("status", ["active", "invited"]);
      if ((occupiedSlots ?? 0) >= plan.team_limit) {
        const lim = plan.team_limit;
        return NextResponse.json({
          error: `Seu plano permite até ${lim} funcionário${lim !== 1 ? "s" : ""} — faça upgrade para adicionar mais.`,
        }, { status: 403 });
      }
    }
  }

  const { data: org } = await supabase.from("organizations").select("name").eq("id", orgId).maybeSingle();

  const { data: member, error: memberErr } = await admin
    .from("team_members")
    .insert({ org_id: orgId, email, name, role_template, created_by: session.user.id })
    .select("id")
    .single();
  if (memberErr) {
    if (memberErr.code === "23505") return NextResponse.json({ error: "Este email já foi convidado para esta organização." }, { status: 409 });
    return NextResponse.json({ error: memberErr.message }, { status: 500 });
  }

  const perms = { ...ROLE_DEFAULTS[role_template], ...(permissions ?? {}) };
  await admin.from("team_member_permissions").insert({ team_member_id: member.id, ...perms });

  // Token com 256 bits de entropia (CSPRNG)
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  await admin.from("team_invites").insert({ team_member_id: member.id, token, expires_at: expiresAt });

  await sendInviteEmail({
    toEmail: email,
    toName: name,
    orgName: org?.name ?? "PixelPage Chat",
    inviterName: session.profile.name || session.user.email || "Administrador",
    token,
  });

  return NextResponse.json({ ok: true, member_id: member.id });
}
