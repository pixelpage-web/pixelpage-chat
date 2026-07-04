"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { differenceInCalendarDays } from "date-fns";
import { Check, Clock, Lock, Shield, Zap } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn, formatBRL, formatCompact, formatFullDate } from "@/lib/utils";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActivationModal } from "@/components/billing/activation-modal";
import type { PlanRow, SubscriptionRow } from "@/types/database";

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Monta a URL de checkout com pre-fill de nome e e-mail.
 * A Cakto não documenta esses params, mas é padrão universal —
 * pior caso são ignorados sem efeito colateral.
 */
function buildCheckoutUrl(baseUrl: string, name: string, email: string): string {
  try {
    const url = new URL(baseUrl);
    if (name.trim()) url.searchParams.set("name", name.trim());
    if (email.trim()) url.searchParams.set("email", email.trim());
    return url.toString();
  } catch {
    return baseUrl;
  }
}

// ─── tipos locais ─────────────────────────────────────────────────────────────

// (SuccessState removido — gerenciado pelo ActivationModal)

// ─── constantes ───────────────────────────────────────────────────────────────

const statusLabels: Record<
  SubscriptionRow["status"],
  { label: string; tone: "lime" | "amber" | "danger" | "ok" }
> = {
  trial: { label: "Período de teste", tone: "lime" },
  active: { label: "Ativa", tone: "ok" },
  past_due: { label: "Pagamento pendente", tone: "amber" },
  canceled: { label: "Cancelada", tone: "danger" },
};

const PLAN_COPY: Record<
  string,
  { tagline: string; features: string[]; featured?: boolean }
> = {
  "Grátis": {
    tagline: "Para dar os primeiros passos",
    features: [
      "1 conexão WhatsApp",
      "1 membro na equipe",
      "Respostas manuais",
      "Webhook n8n ilimitado",
    ],
  },
  "Plano 2": {
    tagline: "Automatize e escale seu atendimento",
    features: [
      "Conexões WhatsApp ilimitadas",
      "3 membros da equipe",
      "500 mensagens IA/mês",
      "Campanhas de disparo",
      "Webhook n8n ilimitado",
    ],
  },
  "Plano 3": {
    tagline: "API Oficial Meta — número verificado, sem risco de ban",
    featured: true,
    features: [
      "Conexões WhatsApp ilimitadas",
      "7 membros da equipe",
      "2.000 mensagens IA/mês",
      "API Oficial Meta (número verificado ✓)",
      "Templates aprovados pela Meta",
      "Campanhas de disparo",
      "Webhook n8n ilimitado",
    ],
  },
};

// ─── sub-componentes ──────────────────────────────────────────────────────────

function UsageBar({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number | null;
}) {
  const t = useT();
  const unlimited = limit === null;
  const pct =
    unlimited || limit === 0 ? 0 : Math.min((used / limit) * 100, 100);
  const danger = !unlimited && limit > 0 && used / limit >= 0.9;

  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-txt-mut">{t(label)}</span>
        <span className={cn("font-medium", danger ? "text-amber" : "text-txt")}>
          {formatCompact(used)} / {unlimited ? t("ilimitado") : formatCompact(limit)}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-raised">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            danger ? "bg-amber" : "bg-lime"
          )}
          style={{ width: unlimited ? "4%" : `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── componente principal ─────────────────────────────────────────────────────

export function BillingView({
  subscription,
  currentPlan,
  plans,
  aiUsed,
  connectionsCount,
  teamCount,
  isOwner,
  userEmail,
  userName,
  showSuccess,
}: {
  subscription: SubscriptionRow | null;
  currentPlan: PlanRow | null;
  plans: PlanRow[];
  aiUsed: number;
  connectionsCount: number;
  teamCount: number;
  isOwner: boolean;
  userEmail: string;
  userName: string;
  showSuccess: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(showSuccess);

  function handleModalClose() {
    setModalOpen(false);
    // Remove ?success=true da URL sem recarregar
    window.history.replaceState(null, "", "/app/billing");
    router.refresh();
  }

  const status = subscription ? statusLabels[subscription.status] : null;
  const trialDaysLeft =
    subscription?.status === "trial" && subscription.trial_ends_at
      ? differenceInCalendarDays(
          new Date(subscription.trial_ends_at),
          new Date()
        )
      : null;

  return (
    <div className="h-full overflow-y-auto">
      {/* Modal de ativação pós-pagamento */}
      {modalOpen && (
        <ActivationModal
          initiallyActive={subscription?.status === "active"}
          initialPlanName={currentPlan?.name ?? ""}
          onClose={handleModalClose}
        />
      )}

      <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">

        <header>
          <h1 className="font-display text-lg font-semibold">{t("Assinatura")}</h1>
          <p className="mt-0.5 text-sm text-txt-mut">
            {t("Seu plano, consumo do mês e histórico de pagamentos.")}
          </p>
        </header>

        {/* Plano atual + consumo */}
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle>
                  {t("Plano")} {currentPlan?.name ?? "—"}
                </CardTitle>
                {status && <Badge tone={status.tone}>{t(status.label)}</Badge>}
              </div>
              <CardDescription>
                {subscription?.status === "trial" && trialDaysLeft !== null
                  ? trialDaysLeft >= 0
                    ? `${t("Seu teste termina em")} ${trialDaysLeft === 0 ? t("menos de 1 dia") : `${trialDaysLeft} ${t("dia(s)")}`}.`
                    : t("Seu período de teste terminou — escolha um plano abaixo.")
                  : subscription?.current_period_end
                    ? `${t("Próxima renovação:")} ${formatFullDate(subscription.current_period_end)}`
                    : currentPlan?.price_cents === 0
                      ? t("Plano gratuito permanente — sem cobrança.")
                      : t("Gerencie seu plano abaixo.")}
              </CardDescription>
            </div>
            {currentPlan && currentPlan.price_cents > 0 && (
              <p className="font-display text-xl font-semibold text-lime">
                {formatBRL(currentPlan.price_cents)}
                <span className="text-xs font-normal text-txt-dim">/{t("mês")}</span>
              </p>
            )}
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-3">
            <UsageBar
              label="Mensagens IA no mês"
              used={aiUsed}
              limit={currentPlan?.ai_messages_limit ?? 0}
            />
            <UsageBar
              label="Conexões WhatsApp"
              used={connectionsCount}
              limit={currentPlan?.connections_limit ?? 1}
            />
            <UsageBar
              label="Membros da equipe"
              used={teamCount}
              limit={currentPlan?.team_limit ?? null}
            />
          </div>
          <p className="mt-4 flex items-center gap-1.5 text-[11px] text-txt-dim">
            <Zap className="h-3 w-3 text-lime" aria-hidden />
            {t("Webhook n8n e modo manual não consomem mensagens IA — são ilimitados em todos os planos.")}
          </p>
        </Card>

        {/* Planos disponíveis */}
        <section>
          <h2 className="mb-4 font-display text-sm font-semibold text-txt-mut">
            {t("Planos disponíveis")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {plans.map((plan) => {
              const copy = PLAN_COPY[plan.name];
              const isCurrent = plan.id === currentPlan?.id;
              const isFeatured = copy?.featured ?? plan.highlight;
              const trialDays = (plan.features as Record<string, unknown>)
                ?.trial_days as number | undefined;
              const hasCheckout = !!plan.cakto_checkout_url;

              return (
                <div
                  key={plan.id}
                  className={cn(
                    "relative flex flex-col rounded-card border p-5 transition-shadow",
                    isFeatured
                      ? "border-lime/50 bg-lime-soft/20 shadow-glow"
                      : "border-line bg-surface"
                  )}
                >
                  {isFeatured && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
                      <Badge tone="lime" className="px-3 py-0.5 text-[11px]">
                        ⭐ {t("Mais popular")}
                      </Badge>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <p className="font-display text-sm font-semibold">{plan.name}</p>
                    {isCurrent && (
                      <Badge tone="lime" className="text-[10px]">
                        {t("atual")}
                      </Badge>
                    )}
                  </div>

                  {trialDays && !isCurrent && (
                    <span className="mt-1.5 self-start rounded-full border border-amber/40 bg-amber/10 px-2 py-0.5 text-[10px] font-medium text-amber">
                      {trialDays} {t("dias grátis")}
                    </span>
                  )}

                  <div className="mt-3">
                    <p className="font-display text-2xl font-bold leading-none">
                      {plan.price_cents > 0 ? (
                        <>
                          {formatBRL(plan.price_cents)}
                          <span className="text-xs font-normal text-txt-dim">/{t("mês")}</span>
                        </>
                      ) : (
                        <>
                          R$ 0
                          <span className="text-xs font-normal text-txt-dim">/{t("mês")}</span>
                        </>
                      )}
                    </p>
                    {copy?.tagline && (
                      <p className="mt-1.5 text-[11px] leading-relaxed text-txt-mut">
                        {copy.tagline}
                      </p>
                    )}
                  </div>

                  <ul className="mt-4 flex-1 space-y-2">
                    {(copy?.features ?? []).map((f) => (
                      <li
                        key={f}
                        className="flex items-start gap-1.5 text-[11px] text-txt-mut"
                      >
                        <Check className="mt-0.5 h-3 w-3 shrink-0 text-lime" aria-hidden />
                        {f}
                      </li>
                    ))}
                  </ul>

                  {/* CTA — dono, plano pago, não-atual */}
                  {!isCurrent && isOwner && plan.price_cents > 0 && (
                    <div className="mt-5">
                      {hasCheckout ? (
                        <a
                          href={buildCheckoutUrl(
                            plan.cakto_checkout_url!,
                            userName,
                            userEmail
                          )}
                          className={cn(
                            "focus-ring flex w-full items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
                            isFeatured
                              ? "bg-lime text-black hover:opacity-90"
                              : "border border-line-strong text-txt hover:border-lime/60 hover:text-lime"
                          )}
                        >
                          {t("Assinar")} {plan.name}
                        </a>
                      ) : (
                        <p className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-line p-2 text-center text-[11px] text-txt-dim">
                          <Clock className="h-3 w-3" aria-hidden />
                          {t("Pagamento em breve")}
                        </p>
                      )}
                    </div>
                  )}

                  {!isCurrent && plan.price_cents === 0 && (
                    <div className="mt-5">
                      <p className="flex items-center justify-center gap-1.5 rounded-lg bg-surface-hover p-2 text-center text-[11px] text-txt-dim">
                        <Shield className="h-3 w-3 text-lime" aria-hidden />
                        {t("Sempre gratuito — sem cartão")}
                      </p>
                    </div>
                  )}

                  {!isCurrent && !isOwner && plan.price_cents > 0 && (
                    <div className="mt-5">
                      <p className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-line p-2 text-center text-[11px] text-txt-dim">
                        <Lock className="h-3 w-3" aria-hidden />
                        {t("Apenas o dono pode alterar o plano")}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

      </div>
    </div>
  );
}
