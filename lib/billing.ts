import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import type { SubscriptionStatus } from "@/types/database";

export interface OrgSubscriptionSummary {
  plan_id: string;
  status: SubscriptionStatus;
  trial_ends_at: string | null;
  current_period_end: string | null;
}

/**
 * Resumo de assinatura via RPC get_org_subscription_summary (0045 —
 * subscriptions é restrita a owner/admin no RLS direto). cache() do React:
 * layout.tsx (app/app/(shell)/layout.tsx) e cada page.tsx que precisa de
 * plano (connections, campaigns, flows, flows/[id]/edit, settings, inbox)
 * chamavam essa mesma RPC de forma independente — 1 round-trip a mais por
 * página, sempre pro mesmo org_id no mesmo request. Todos migrados pra esse
 * helper (direto ou via getPlanFeatures). Rotas de API (whatsapp/qr,
 * billing/status, embedded-signup, inbox/send*) continuam com a RPC direta
 * — cada uma é seu próprio request, sem layout compartilhado, então o
 * cache() não traria dedup ali.
 */
export const getOrgSubscriptionSummary = cache(
  async (orgId: string): Promise<OrgSubscriptionSummary | null> => {
    const supabase = await createServerSupabase();
    const { data } = await supabase.rpc("get_org_subscription_summary", {
      p_org_id: orgId,
    });
    return data?.[0] ?? null;
  }
);

export interface SubscriptionState {
  status: SubscriptionStatus;
  trial_ends_at: string | null;
  /**
   * Fim do período já pago. Em status="canceled", o webhook Stripe
   * preenche isso com a data até quando o acesso continua válido
   * (o cliente já pagou aquele ciclo) — se ausente/passado, sem carência.
   */
  current_period_end?: string | null;
}

/**
 * Migração "preguiçosa" pro plano Free quando um trial vencido é
 * detectado — sem precisar de cron. Idempotente: o WHERE inclui
 * status='trial', então uma segunda chamada concorrente (ou uma chamada
 * seguinte já com o registro migrado) não casa nenhuma linha e não faz
 * nada — sem duplicar, sem sobrescrever um upgrade real que tenha
 * acontecido entre a leitura que disparou isso e esta escrita.
 */
async function migrateExpiredTrialToFree(orgId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: freePlan, error: planError } = await admin
    .from("plans")
    .select("id")
    .eq("name", "Free")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (planError || !freePlan) {
    console.error(
      `[billing] migrateExpiredTrialToFree: plano Free não encontrado (${planError?.message ?? "sem linha ativa"})`
    );
    return;
  }

  const { error } = await admin
    .from("subscriptions")
    .update({ plan_id: freePlan.id, status: "active", trial_ends_at: null })
    .eq("org_id", orgId)
    .eq("status", "trial")
    .lt("trial_ends_at", new Date().toISOString());

  if (error) {
    console.error(`[billing] migrateExpiredTrialToFree error (org=${orgId}): ${error.message}`);
    return;
  }

  console.log(`[billing] trial expirado migrado pra Free — org=${orgId}`);
}

/**
 * Regra de bloqueio por assinatura:
 * - cancelada: bloqueia, EXCETO se current_period_end ainda está no futuro
 *   (cliente já pagou o ciclo atual — mantém acesso até o fim dele)
 * - trial expirado: migra a org pro Free nesse mesmo request (lazy, ver
 *   migrateExpiredTrialToFree) e NÃO bloqueia mais — Free é um plano de
 *   verdade, sem expiração, então não tem mais tela de "escolha um
 *   plano" forçada nem downtime
 * - past_due mantém funcionando (período de carência), só exibe banner
 */
export async function isSubscriptionBlocked(
  orgId: string,
  sub: SubscriptionState | null
): Promise<boolean> {
  if (!sub) return false;
  if (sub.status === "canceled") {
    if (sub.current_period_end && new Date(sub.current_period_end).getTime() > Date.now()) {
      return false;
    }
    return true;
  }
  if (
    sub.status === "trial" &&
    sub.trial_ends_at &&
    new Date(sub.trial_ends_at).getTime() < Date.now()
  ) {
    await migrateExpiredTrialToFree(orgId);
    return false;
  }
  return false;
}

/**
 * Downgrade manual e imediato pro Free — usado pelo botão "Usar plano
 * Free" em /app/billing. Diferente da migração lazy de trial expirado:
 * aqui não tem guard de trial_ends_at vencido (é decisão voluntária do
 * dono, pode estar no meio do período de teste). Recusa se a org tiver
 * stripe_subscription_id — nesse caso precisa cancelar pelo Customer
 * Portal primeiro, não faz sentido só trocar o plan_id por baixo de uma
 * assinatura Stripe que continua cobrando.
 */
export async function downgradeToFree(
  orgId: string
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();

  const { data: freePlan, error: planError } = await admin
    .from("plans")
    .select("id")
    .eq("name", "Free")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (planError || !freePlan) {
    return { ok: false, error: "Plano Free não encontrado." };
  }

  const { data: sub } = await admin
    .from("subscriptions")
    .select("stripe_subscription_id, plan_id")
    .eq("org_id", orgId)
    .maybeSingle();

  if (sub?.stripe_subscription_id) {
    return {
      ok: false,
      error: "Esta organização tem uma assinatura Stripe ativa — cancele pelo portal antes de trocar para o Free.",
    };
  }

  if (sub?.plan_id === freePlan.id) {
    return { ok: true }; // já é Free — no-op
  }

  const { error } = await admin
    .from("subscriptions")
    .update({ plan_id: freePlan.id, status: "active", trial_ends_at: null })
    .eq("org_id", orgId);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
