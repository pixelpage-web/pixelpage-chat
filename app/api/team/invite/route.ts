import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Convida um membro por email (roles: dono ou agente).
 * Usa o convite nativo do Supabase Auth (email com magic link) e já cria o
 * perfil vinculado à organização, respeitando o team_limit do plano.
 */
export async function POST(request: Request) {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (session.profile.role !== "owner" && session.profile.role !== "admin") {
    return NextResponse.json(
      { error: "Apenas o dono convida membros" },
      { status: 403 }
    );
  }
  const orgId = session.profile.org_id;

  let body: { email?: string; role?: string };
  try {
    body = (await request.json()) as { email?: string; role?: string };
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const role = body.role === "owner" ? "owner" : "agent";
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Email inválido" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Limite de equipe do plano
  const [{ data: subscription }, { count: teamCount }] = await Promise.all([
    admin.from("subscriptions").select("plan_id").eq("org_id", orgId).maybeSingle(),
    admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId),
  ]);
  if (subscription?.plan_id) {
    const { data: plan } = await admin
      .from("plans")
      .select("team_limit")
      .eq("id", subscription.plan_id)
      .maybeSingle();
    const limit = plan?.team_limit;
    if (limit !== null && limit !== undefined && (teamCount ?? 0) >= limit) {
      return NextResponse.json(
        { error: `Seu plano permite ${limit} membro(s). Faça upgrade para convidar mais.` },
        { status: 403 }
      );
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const { data: invited, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${appUrl}/auth/callback?next=/app/inbox`,
    });

  if (inviteError || !invited.user) {
    return NextResponse.json(
      {
        error: inviteError?.message.includes("already been registered")
          ? "Este email já tem conta na PixelPage Chat."
          : "Não foi possível enviar o convite.",
      },
      { status: 400 }
    );
  }

  // Cria o perfil já vinculado à organização
  const { error: profileError } = await admin.from("profiles").upsert({
    id: invited.user.id,
    org_id: orgId,
    role,
    name: email.split("@")[0],
  });
  if (profileError) {
    return NextResponse.json(
      { error: "Convite enviado, mas houve falha ao vincular o perfil." },
      { status: 500 }
    );
  }

  await admin.from("audit_logs").insert({
    org_id: orgId,
    actor_id: session.user.id,
    action: "team.member_invited",
    metadata: { email, role },
  });

  return NextResponse.json({
    ok: true,
    member: { id: invited.user.id, name: email.split("@")[0], role },
  });
}
