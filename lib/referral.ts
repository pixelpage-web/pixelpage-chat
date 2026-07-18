import { createAdminClient } from "@/lib/supabase/admin";
import type { RewardType, ReferralMilestone } from "@/types/database";

// ─── milestone definitions ────────────────────────────────────────────────────

export type MilestoneConfig = {
  at: ReferralMilestone;
  type: RewardType;
  label: string;
  description: string;
};

export const MILESTONES: MilestoneConfig[] = [
  {
    at: 3,
    type: "discount_20",
    label: "20% OFF",
    description: "20% de desconto no próximo mês",
  },
  {
    at: 7,
    type: "discount_50",
    label: "50% OFF",
    description: "50% de desconto no próximo mês",
  },
  {
    at: 10,
    type: "free_month",
    label: "1 mês grátis",
    description: "1 mês grátis no seu plano",
  },
  {
    at: 20,
    type: "free_6months",
    label: "6 meses grátis",
    description: "6 meses grátis no seu plano",
  },
];

export type MilestoneProgress = {
  activatedCount: number;
  currentMilestone: MilestoneConfig | null;
  nextMilestone: MilestoneConfig | null;
  toNextMilestone: number | null;
};

export function getMilestoneProgress(activatedCount: number): MilestoneProgress {
  const reached = MILESTONES.filter((m) => activatedCount >= m.at);
  const upcoming = MILESTONES.filter((m) => activatedCount < m.at);
  return {
    activatedCount,
    currentMilestone: reached[reached.length - 1] ?? null,
    nextMilestone: upcoming[0] ?? null,
    toNextMilestone: upcoming[0] ? upcoming[0].at - activatedCount : null,
  };
}

// ─── code / URL helpers ───────────────────────────────────────────────────────

export function generateReferralCode(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8).toLowerCase();
}

export function buildReferralUrl(code: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://www.pixelpagechat.com.br";
  return `${base}/r/${code}`;
}

// ─── reward granting ──────────────────────────────────────────────────────────

/**
 * Verifica se um novo marco foi atingido e concede a recompensa correspondente.
 * Cada marco é concedido no máximo uma vez por org (UNIQUE org_id + milestone).
 * Chamado internamente por activateReferralsForOrg após ativar a indicação.
 */
async function checkAndGrantReward(
  referralId: string,
  referrerOrgId: string,
  admin: ReturnType<typeof createAdminClient>
): Promise<void> {
  // Conta indicações ativadas (inclui 'rewarded' já processadas)
  const { count } = await admin
    .from("referrals")
    .select("id", { count: "exact", head: true })
    .eq("referrer_org_id", referrerOrgId)
    .in("status", ["activated", "rewarded"]);

  const activatedCount = count ?? 0;

  // Qual marco foi cruzado exatamente nesta ativação?
  const milestone = MILESTONES.find((m) => m.at === activatedCount);
  if (!milestone) return; // não bateu nenhum marco nesta ativação

  const expiresAt = new Date(
    Date.now() + 60 * 24 * 60 * 60 * 1000
  ).toISOString();

  const { error } = await admin.from("referral_rewards").insert({
    referral_id: referralId,
    org_id: referrerOrgId,
    reward_type: milestone.type,
    milestone: milestone.at,
    status: "pending",
    expires_at: expiresAt,
  });

  if (error) {
    // Violação de UNIQUE = marco já concedido (race condition) — silencioso
    console.warn(`[referral] checkAndGrantReward: ${error.message}`);
    return;
  }

  await admin.from("referral_notifications").insert({
    org_id: referrerOrgId,
    type: "reward_ready",
    referral_id: referralId,
    data: {
      reward_type: milestone.type,
      milestone: milestone.at,
      label: milestone.label,
      description: milestone.description,
      expires_at: expiresAt,
    },
  });

  console.log(
    `[referral] marco ${milestone.at} → org=${referrerOrgId} tipo=${milestone.type}`
  );
}

// ─── webhook hook ─────────────────────────────────────────────────────────────

/**
 * Ativa indicação pendente quando a org referenciada assina um plano pago.
 * Chamado pelo webhook Stripe em subscription_created (fire-and-forget).
 */
export async function activateReferralsForOrg(orgId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: referral } = await admin
    .from("referrals")
    .select("id, referrer_org_id")
    .eq("referred_org_id", orgId)
    .eq("status", "pending")
    .maybeSingle();

  if (!referral) return;

  const { error } = await admin
    .from("referrals")
    .update({ status: "activated", activated_at: new Date().toISOString() })
    .eq("id", referral.id);

  if (error) {
    console.error(`[referral] activateReferrals error: ${error.message}`);
    return;
  }

  await checkAndGrantReward(referral.id, referral.referrer_org_id, admin);

  console.log(
    `[referral] activated referral=${referral.id} referrer=${referral.referrer_org_id}`
  );
}
