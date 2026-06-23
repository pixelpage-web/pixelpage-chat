import type { SubscriptionStatus } from "@/types/database";

export interface SubscriptionState {
  status: SubscriptionStatus;
  trial_ends_at: string | null;
}

/**
 * Regra de bloqueio por assinatura:
 * - trial expirado ou assinatura cancelada → inbox somente leitura,
 *   bot e webhooks pausados
 * - past_due mantém funcionando (período de carência), só exibe banner
 */
export function isSubscriptionBlocked(sub: SubscriptionState | null): boolean {
  if (!sub) return false;
  if (sub.status === "canceled") return true;
  if (
    sub.status === "trial" &&
    sub.trial_ends_at &&
    new Date(sub.trial_ends_at).getTime() < Date.now()
  ) {
    return true;
  }
  return false;
}
