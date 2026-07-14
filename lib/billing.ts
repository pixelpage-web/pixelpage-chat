import type { SubscriptionStatus } from "@/types/database";

export interface SubscriptionState {
  status: SubscriptionStatus;
  trial_ends_at: string | null;
  /**
   * Fim do período já pago. Em status="canceled", os webhooks (Cakto e
   * Stripe) preenchem isso com a data até quando o acesso continua válido
   * (o cliente já pagou aquele ciclo) — se ausente/passado, sem carência.
   */
  current_period_end?: string | null;
}

/**
 * Regra de bloqueio por assinatura:
 * - cancelada: bloqueia, EXCETO se current_period_end ainda está no futuro
 *   (cliente já pagou o ciclo atual — mantém acesso até o fim dele)
 * - trial expirado → inbox somente leitura, bot e webhooks pausados
 * - past_due mantém funcionando (período de carência), só exibe banner
 */
export function isSubscriptionBlocked(sub: SubscriptionState | null): boolean {
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
    return true;
  }
  return false;
}
