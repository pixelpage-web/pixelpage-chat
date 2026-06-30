import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-audit";

export async function POST(req: NextRequest) {
  // Verificação dupla: sessão + role + email do superadmin
  const session = await getSessionProfile();
  const superadminEmail = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();

  if (
    !session ||
    session.profile?.role !== "superadmin" ||
    !superadminEmail ||
    session.user.email?.toLowerCase() !== superadminEmail
  ) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const body = (await req.json()) as {
    org_id: string;
    days: number;
    reason?: string;
  };

  if (!body.org_id || !body.days || body.days < 1 || body.days > 90) {
    return NextResponse.json(
      { error: "org_id e days (1–90) são obrigatórios." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Buscar dados da org + subscription
  const [{ data: org }, { data: sub }] = await Promise.all([
    admin.from("organizations").select("id, name").eq("id", body.org_id).maybeSingle(),
    admin.from("subscriptions").select("id, trial_ends_at, trial_extended_count, status").eq("org_id", body.org_id).maybeSingle(),
  ]);

  if (!org) {
    return NextResponse.json({ error: "Organização não encontrada." }, { status: 404 });
  }

  if (!sub) {
    return NextResponse.json({ error: "Assinatura não encontrada." }, { status: 404 });
  }

  // Calcular nova data de expiração do trial
  // Se já expirou, parte do momento atual. Se ainda ativa, estende da data atual.
  const baseDate = sub.trial_ends_at
    ? new Date(Math.max(new Date(sub.trial_ends_at).getTime(), Date.now()))
    : new Date();

  const newEndAt = new Date(baseDate.getTime() + body.days * 86_400_000);

  // Atualizar subscription
  const { error: updateError } = await admin
    .from("subscriptions")
    .update({
      trial_ends_at: newEndAt.toISOString(),
      status: "trial",
      trial_extended_count: (sub.trial_extended_count ?? 0) + 1,
    })
    .eq("id", sub.id);

  if (updateError) {
    return NextResponse.json(
      { error: "Não foi possível estender o trial." },
      { status: 500 }
    );
  }

  // Registrar no histórico de extensões
  await admin.from("trial_extensions").insert({
    org_id: body.org_id,
    extended_by: session.user.id,
    days_added: body.days,
    previous_end_at: sub.trial_ends_at,
    new_end_at: newEndAt.toISOString(),
    reason: body.reason ?? null,
  });

  // Auditoria
  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    hdrs.get("x-real-ip") ??
    "unknown";

  await logAdminAction({
    action: "trial.extended",
    targetType: "organization",
    targetId: body.org_id,
    targetName: org.name,
    details: {
      days_added: body.days,
      previous_end_at: sub.trial_ends_at,
      new_end_at: newEndAt.toISOString(),
      reason: body.reason,
    },
    ip,
  });

  return NextResponse.json({
    ok: true,
    new_end_at: newEndAt.toISOString(),
    trial_extended_count: (sub.trial_extended_count ?? 0) + 1,
  });
}
