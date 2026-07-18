import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeClient } from "@/lib/stripe";
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
    type: "free_3months",
    label: "3 meses grátis",
    description: "3 meses grátis no seu plano",
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

// ─── cupom Stripe (aplicação automática) ───────────────────────────────────────

/**
 * Parâmetros do cupom por tipo de recompensa. ID determinístico
 * (referral-<reward_type>) — permite reaproveitar via get-or-create sem
 * cache em memória (não sobrevive a cold start em serverless) nem tabela
 * nova só pra isso: a Stripe já garante unicidade pelo id.
 */
const COUPON_PARAMS: Record<RewardType, Stripe.CouponCreateParams> = {
  discount_20: { percent_off: 20, duration: "once", name: "Indicação — 20% OFF" },
  discount_50: { percent_off: 50, duration: "once", name: "Indicação — 50% OFF" },
  free_month: { percent_off: 100, duration: "once", name: "Indicação — 1 mês grátis" },
  free_3months: {
    percent_off: 100,
    duration: "repeating",
    duration_in_months: 3,
    name: "Indicação — 3 meses grátis",
  },
};

async function getOrCreateReferralCoupon(
  stripe: Stripe,
  rewardType: RewardType
): Promise<string> {
  const couponId = `referral-${rewardType}`;
  try {
    const existing = await stripe.coupons.retrieve(couponId);
    if (!existing.deleted) return existing.id;
  } catch (err) {
    const isMissing =
      err instanceof Stripe.errors.StripeError && err.statusCode === 404;
    if (!isMissing) throw err;
  }
  const created = await stripe.coupons.create({
    id: couponId,
    ...COUPON_PARAMS[rewardType],
  });
  return created.id;
}

/**
 * Aplica o cupom Stripe correspondente na subscription do indicador e
 * marca a recompensa como aplicada. Fire-and-forget: qualquer erro aqui
 * (Stripe fora do ar, subscription cancelada entre a leitura e o update
 * etc.) fica só logado — o reward permanece "pending" pro fallback
 * manual em /admin/referrals (action "apply_reward"), sem derrubar o
 * webhook que chamou isso.
 */
async function applyRewardToStripeSubscription(
  reward: { id: string; reward_type: RewardType },
  stripeSubId: string,
  admin: ReturnType<typeof createAdminClient>
): Promise<void> {
  try {
    const stripe = getStripeClient();
    const couponId = await getOrCreateReferralCoupon(stripe, reward.reward_type);
    // Versões recentes da API Stripe substituíram o campo "coupon" (nível
    // raiz) por "discounts" (array) na subscription.
    await stripe.subscriptions.update(stripeSubId, {
      discounts: [{ coupon: couponId }],
    });

    await admin
      .from("referral_rewards")
      .update({ status: "applied", applied_at: new Date().toISOString() })
      .eq("id", reward.id);

    console.log(
      `[referral] cupom ${couponId} aplicado — reward=${reward.id} subscription=${stripeSubId}`
    );
  } catch (err) {
    console.error(
      `[referral] falha ao aplicar cupom na Stripe — reward=${reward.id}: ${err instanceof Error ? err.message : err}`
    );
  }
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

  const { data: reward, error } = await admin
    .from("referral_rewards")
    .insert({
      referral_id: referralId,
      org_id: referrerOrgId,
      reward_type: milestone.type,
      milestone: milestone.at,
      status: "pending",
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error || !reward) {
    // Violação de UNIQUE = marco já concedido (race condition) — silencioso
    console.warn(`[referral] checkAndGrantReward: ${error?.message}`);
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

  // Aplica automaticamente se o indicador já tem subscription Stripe ativa.
  // Se estiver no Free (sem stripe_subscription_id), fica "pending" até ele
  // assinar um plano pago — ver applyPendingRewardsForOrg, chamada pelo
  // webhook Stripe em checkout.session.completed.
  const { data: referrerSub } = await admin
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("org_id", referrerOrgId)
    .maybeSingle();

  if (referrerSub?.stripe_subscription_id) {
    await applyRewardToStripeSubscription(
      { id: reward.id, reward_type: milestone.type },
      referrerSub.stripe_subscription_id,
      admin
    );
  }
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

/**
 * Aplica a recompensa pendente mais antiga do indicador quando ele mesmo
 * assina um plano pago (estava no Free quando o marco foi batido, então
 * checkAndGrantReward não teve onde aplicar o cupom na hora). Chamada
 * pelo webhook Stripe em checkout.session.completed.
 *
 * Só aplica UMA por vez: setar "discounts" na subscription substitui
 * (não empilha) o desconto ativo. Se houver mais de uma recompensa
 * pendente acumulada, as demais continuam "pending" pro fallback manual
 * em /admin/referrals.
 */
export async function applyPendingRewardsForOrg(
  orgId: string,
  stripeSubId: string
): Promise<void> {
  const admin = createAdminClient();

  const { data: reward } = await admin
    .from("referral_rewards")
    .select("id, reward_type")
    .eq("org_id", orgId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!reward) return;

  await applyRewardToStripeSubscription(reward, stripeSubId, admin);
}
