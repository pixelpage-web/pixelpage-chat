import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildReferralUrl, getMilestoneProgress, MILESTONES } from "@/lib/referral";

/** GET — estatísticas do dashboard de indicações, com progresso de marcos. */
export async function GET() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const orgId = session.profile.org_id;
  const supabase = await createServerSupabase();
  const admin = createAdminClient();

  // Expirar recompensas vencidas (lazy — sem cron separado)
  await admin
    .from("referral_rewards")
    .update({ status: "expired" })
    .eq("org_id", orgId)
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString());

  const [
    { data: link },
    { data: referrals },
    { data: rewards },
  ] = await Promise.all([
    supabase
      .from("referral_links")
      .select("id, code, enabled, clicks")
      .eq("org_id", orgId)
      .maybeSingle(),
    supabase
      .from("referrals")
      .select("id, status, activated_at, created_at")
      .eq("referrer_org_id", orgId)
      .order("created_at", { ascending: false }),
    supabase
      .from("referral_rewards")
      .select("id, referral_id, reward_type, milestone, status, expires_at, applied_at, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false }),
  ]);

  const activatedCount =
    referrals?.filter((r) => ["activated", "rewarded"].includes(r.status))
      .length ?? 0;

  const milestoneProgress = getMilestoneProgress(activatedCount);

  // Próximos marcos não conquistados ainda
  const grantedMilestones = new Set((rewards ?? []).map((r) => r.milestone));
  const pendingMilestones = MILESTONES.filter((m) => !grantedMilestones.has(m.at));

  return NextResponse.json({
    link: link ? { ...link, url: buildReferralUrl(link.code) } : null,
    referrals: referrals ?? [],
    rewards: rewards ?? [],
    stats: {
      total: referrals?.length ?? 0,
      pending: referrals?.filter((r) => r.status === "pending").length ?? 0,
      activated: activatedCount,
      rewarded: referrals?.filter((r) => r.status === "rewarded").length ?? 0,
      pendingRewards: rewards?.filter((r) => r.status === "pending").length ?? 0,
    },
    milestoneProgress,
    pendingMilestones,
  });
}
