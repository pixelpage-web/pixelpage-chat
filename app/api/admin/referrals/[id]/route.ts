import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

function isSuperadmin(session: Awaited<ReturnType<typeof getSessionProfile>>, email: string | undefined): boolean {
  if (!session || !email) return false;
  return (
    session.profile?.role === "superadmin" &&
    session.user.email?.toLowerCase() === email.toLowerCase()
  );
}

/**
 * PATCH /api/admin/referrals/[id]
 * Ações disponíveis:
 *   action: "apply_reward"    → marca rewards como applied + referral como rewarded
 *   action: "cancel"          → cancela o referral (fraude, etc.)
 *   action: "expire_reward"   → expira um reward específico (rewardId obrigatório)
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionProfile();
  const superEmail = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();

  if (!isSuperadmin(session, superEmail)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await request.json()) as {
    action: "apply_reward" | "cancel" | "expire_reward" | "delete";
    notes?: string;
    reason?: string;
    rewardId?: string;
  };

  const admin = createAdminClient();

  if (body.action === "cancel") {
    const { error } = await admin
      .from("referrals")
      .update({ status: "canceled" })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Expira rewards pendentes
    await admin
      .from("referral_rewards")
      .update({ status: "expired" })
      .eq("referral_id", id)
      .eq("status", "pending");

    return NextResponse.json({ ok: true });
  }

  if (body.action === "apply_reward") {
    const now = new Date().toISOString();

    // Marca todos os rewards pendentes deste referral como applied
    const { error: rErr } = await admin
      .from("referral_rewards")
      .update({ status: "applied", applied_at: now, notes: body.notes ?? null })
      .eq("referral_id", id)
      .eq("status", "pending");

    if (rErr) {
      return NextResponse.json({ error: rErr.message }, { status: 500 });
    }

    // Atualiza status do referral para rewarded
    await admin
      .from("referrals")
      .update({ status: "rewarded" })
      .eq("id", id);

    // Notifica a org referenciadora
    const { data: referral } = await admin
      .from("referrals")
      .select("referrer_org_id")
      .eq("id", id)
      .maybeSingle();

    if (referral) {
      await admin.from("referral_notifications").insert({
        org_id: referral.referrer_org_id,
        type: "reward_applied",
        referral_id: id,
        data: { notes: body.notes ?? null },
      });
    }

    return NextResponse.json({ ok: true });
  }

  if (body.action === "expire_reward") {
    if (!body.rewardId) {
      return NextResponse.json({ error: "rewardId obrigatório" }, { status: 400 });
    }

    await admin
      .from("referral_rewards")
      .update({ status: "expired" })
      .eq("id", body.rewardId)
      .eq("referral_id", id);

    return NextResponse.json({ ok: true });
  }

  if (body.action === "delete") {
    if (!body.reason?.trim()) {
      return NextResponse.json({ error: "reason é obrigatório para exclusão" }, { status: 400 });
    }

    const { error } = await admin
      .from("referrals")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Expira rewards pendentes associados
    await admin
      .from("referral_rewards")
      .update({ status: "expired" })
      .eq("referral_id", id)
      .eq("status", "pending");

    await admin.from("audit_logs").insert({
      org_id: null,
      actor_id: session?.user.id ?? null,
      action: "admin.referral.deleted",
      metadata: { referral_id: id, reason: body.reason.trim() },
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Ação desconhecida" }, { status: 400 });
}
