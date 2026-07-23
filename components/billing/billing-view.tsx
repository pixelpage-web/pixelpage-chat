"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertOctagon,
  AlertTriangle,
  BotOff,
  Check,
  Clock,
  KeyRound,
  Loader2,
  Lock,
  Settings,
  Shield,
  Zap,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn, formatBRL, formatCompact } from "@/lib/utils";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActivationModal } from "@/components/billing/activation-modal";
import type { PlanRow, SubscriptionRow } from "@/types/database";

// ─── tipos locais ─────────────────────────────────────────────────────────────

// (SuccessState removido — gerenciado pelo ActivationModal)

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Data sem hora, em UTC puro — dd/MM/yyyy é sempre o mesmo texto no
 * servidor (SSR) e no cliente (hidratação), sem depender do fuso local
 * de cada ambiente (diferente de formatFullDate/lib/utils.ts, que
 * formata em hora local e pode divergir e quebrar a hidratação).
 */
function formatUtcDate(date: string): string {
  const d = new Date(date);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${d.getUTCFullYear()}`;
}

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
  "Free": {
    tagline: "Para dar os primeiros passos",
    features: [
      "1 conexão WhatsApp",
      "1 membro na equipe",
      "Respostas manuais",
      "Webhook n8n ilimitado",
    ],
  },
  "Starter": {
    tagline: "Automatize e escale seu atendimento",
    features: [
      "Conexões WhatsApp ilimitadas",
      "3 membros da equipe",
      "500 mensagens IA/mês",
      "Campanhas de disparo",
      "Webhook n8n ilimitado",
    ],
  },
  "Pro": {
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
  format = "compact",
}: {
  label: string;
  used: number;
  limit: number | null;
  /** "currency" formata como dólar (US$ X.XX) — custo de IA é um valor em USD, não contagem. */
  format?: "compact" | "currency";
}) {
  const t = useT();
  const unlimited = limit === null;
  const pct =
    unlimited || limit === 0 ? 0 : Math.min((used / limit) * 100, 100);
  const danger = !unlimited && limit > 0 && used / limit >= 0.9;
  const fmt = (n: number) =>
    format === "currency" ? `US$ ${n.toFixed(2)}` : formatCompact(n);

  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-txt-mut">{t(label)}</span>
        <span
          className={cn(
            "whitespace-nowrap font-medium",
            danger ? "text-amber" : "text-txt"
          )}
        >
          {fmt(used)} /{" "}
          {unlimited
            ? t("ilimitado")
            : format === "currency"
              ? limit.toFixed(2) // "US$" já aparece no valor usado — evita repetição
              : formatCompact(limit)}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-raised">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            danger ? "bg-amber" : "bg-txt-mut"
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
  aiMode,
  aiCostUsd,
  aiCostLimitUsd,
  aiUsageStatus,
  isOwner,
  showSuccess,
}: {
  subscription: SubscriptionRow | null;
  currentPlan: PlanRow | null;
  plans: PlanRow[];
  aiUsed: number;
  connectionsCount: number;
  teamCount: number;
  /** organizations.ai_mode — "managed" | "byok" | "disabled". */
  aiMode: string;
  /** org_usage_monthly.total_ai_cost_usd do mês corrente (0 se sem registro). */
  aiCostUsd: number;
  /** org_usage_monthly.plan_limit_ai_cost_usd — null = sem limite. */
  aiCostLimitUsd: number | null;
  /** org_usage_monthly.status — "ok" | "warning" | "blocked". */
  aiUsageStatus: string;
  isOwner: boolean;
  showSuccess: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(showSuccess);
  const [checkingOutPlanId, setCheckingOutPlanId] = useState<string | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [downgrading, setDowngrading] = useState(false);

  function handleModalClose() {
    setModalOpen(false);
    // Remove ?success=true da URL sem recarregar
    window.history.replaceState(null, "", "/app/billing");
    router.refresh();
  }

  async function startStripeCheckout(planId: string) {
    setCheckingOutPlanId(planId);
    try {
      const res = await fetch("/api/checkout/stripe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: planId }),
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        toast.error(json.error ?? t("Não foi possível iniciar o checkout."));
        return;
      }
      window.location.href = json.url;
    } catch {
      toast.error(t("Erro de conexão."));
    } finally {
      setCheckingOutPlanId(null);
    }
  }

  async function openStripePortal() {
    setOpeningPortal(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        toast.error(json.error ?? t("Não foi possível abrir o portal."));
        return;
      }
      window.location.href = json.url;
    } catch {
      toast.error(t("Erro de conexão."));
    } finally {
      setOpeningPortal(false);
    }
  }

  async function handleDowngradeToFree() {
    if (
      !window.confirm(
        t("Isso encerra seu teste antes do prazo. Você pode assinar de novo quando quiser.")
      )
    ) {
      return;
    }
    setDowngrading(true);
    try {
      const res = await fetch("/api/billing/downgrade", { method: "POST" });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? t("Não foi possível mudar para o plano Free."));
        return;
      }
      toast.success(t("Plano alterado para Free."));
      router.refresh();
    } catch {
      toast.error(t("Erro de conexão."));
    } finally {
      setDowngrading(false);
    }
  }

  const status = subscription ? statusLabels[subscription.status] : null;
  // Math.floor sobre epoch ms (não differenceInCalendarDays, que usa
  // fuso local) — servidor (SSR) e cliente (hidratação) sempre calculam
  // o mesmo número, evitando hydration mismatch perto da virada do dia.
  const trialDaysLeft =
    subscription?.status === "trial" && subscription.trial_ends_at
      ? Math.floor(
          (new Date(subscription.trial_ends_at).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24)
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
                    ? `${t("Próxima renovação:")} ${formatUtcDate(subscription.current_period_end)}`
                    : currentPlan?.price_cents === 0
                      ? t("Plano gratuito permanente — sem cobrança.")
                      : t("Gerencie seu plano abaixo.")}
              </CardDescription>
            </div>
            <div className="flex flex-col items-end gap-2">
              {currentPlan && currentPlan.price_cents > 0 && (
                <p className="font-display text-xl font-semibold text-txt">
                  {formatBRL(currentPlan.price_cents)}
                  <span className="text-xs font-normal text-txt-dim">/{t("mês")}</span>
                </p>
              )}
              {isOwner && subscription?.stripe_subscription_id && (
                <button
                  onClick={() => void openStripePortal()}
                  disabled={openingPortal}
                  className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-1.5 text-xs font-medium text-txt transition-colors hover:border-txt-mut disabled:opacity-60"
                >
                  {openingPortal ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Settings className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {t("Gerenciar assinatura")}
                </button>
              )}
            </div>
          </div>

          {/* Alerta de custo de IA — só faz sentido no modo gerenciado (teto nosso). */}
          {aiMode === "managed" &&
            (aiUsageStatus === "warning" || aiUsageStatus === "blocked") && (
              <div
                className={cn(
                  "mt-5 flex flex-col gap-3 rounded-lg border p-3.5 sm:flex-row sm:items-center sm:justify-between",
                  aiUsageStatus === "blocked"
                    ? "border-danger/30 bg-danger-soft"
                    : "border-amber/30 bg-amber-soft"
                )}
                role="alert"
              >
                <p
                  className={cn(
                    "flex items-start gap-2 text-xs font-medium leading-relaxed",
                    aiUsageStatus === "blocked" ? "text-danger" : "text-amber"
                  )}
                >
                  {aiUsageStatus === "blocked" ? (
                    <AlertOctagon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  )}
                  {aiUsageStatus === "blocked"
                    ? t("Limite de custo de IA atingido — o assistente automático está pausado.")
                    : t("Você está perto do limite de custo de IA do seu plano.")}
                </p>
                <a
                  href="#planos"
                  className={cn(
                    "focus-ring inline-flex shrink-0 items-center justify-center rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90",
                    aiUsageStatus === "blocked"
                      ? "bg-danger text-white"
                      : "bg-amber text-black"
                  )}
                >
                  {t("Fazer upgrade")}
                </a>
              </div>
            )}

          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <UsageBar
              label="Mensagens IA no mês"
              used={aiUsed}
              // Durante o trial, o teto real aplicado pelo gatekeeper
              // (routeToAiBot em lib/pipeline.ts) é fixo em 100 — sobrepõe
              // o limite do plano sendo testado. Precisa bater com o
              // mesmo número lá; ver TRIAL_AI_MESSAGE_LIMIT.
              limit={
                subscription?.status === "trial"
                  ? 100
                  : (currentPlan?.ai_messages_limit ?? 0)
              }
            />
            <UsageBar
              label="Conexões WhatsApp"
              used={connectionsCount}
              limit={currentPlan?.connections_limit ?? null}
            />
            <UsageBar
              label="Membros da equipe"
              used={teamCount}
              limit={currentPlan?.team_limit ?? null}
            />

            {/* 4ª célula — depende do modo de IA da organização */}
            {aiMode === "managed" && (
              <div>
                <UsageBar
                  label="Custo de IA no mês"
                  used={aiCostUsd}
                  limit={aiCostLimitUsd}
                  format="currency"
                />
                <p className="mt-2 text-xs text-txt-mut">
                  {t("Mensagens respondidas pelo seu assistente de IA contam para o limite. Mensagens respondidas manualmente pela sua equipe não contam.")}
                </p>
              </div>
            )}

            {aiMode === "byok" && (
              <div className="rounded-lg border border-line bg-surface-raised/60 p-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-txt">
                  <KeyRound className="h-3.5 w-3.5 text-txt-mut" aria-hidden />
                  {t("Chave própria (BYOK)")}
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-txt-mut">
                  {t("Você está usando sua própria chave de IA (Claude ou ChatGPT, conforme configurado em Integrações) — sem limite de custo da nossa parte.")}
                </p>
              </div>
            )}

            {aiMode === "disabled" && (
              <div className="rounded-lg border border-line bg-surface-raised/60 p-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-txt">
                  <BotOff className="h-3.5 w-3.5 text-txt-dim" aria-hidden />
                  {t("IA desligada")}
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-txt-mut">
                  {t("Assistente automático de IA desligado para sua organização. Mensagens continuam chegando normalmente — sua equipe responde manualmente.")}
                </p>
                <Link
                  href="/app/integrations"
                  className="mt-2 inline-flex items-center text-xs font-medium text-txt hover:underline"
                >
                  {t("Reativar em Integrações")} →
                </Link>
              </div>
            )}
          </div>
          <p className="mt-4 flex items-center gap-1.5 text-[11px] text-txt-dim">
            <Zap className="h-3 w-3 text-txt-mut" aria-hidden />
            {t("Webhook n8n e modo manual não consomem mensagens IA — são ilimitados em todos os planos.")}
          </p>
        </Card>

        {/* Planos disponíveis */}
        <section id="planos" className="scroll-mt-6">
          <h2 className="mb-4 font-display text-sm font-semibold text-txt-mut">
            {t("Planos disponíveis")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {plans.map((plan) => {
              const copy = PLAN_COPY[plan.name];
              const isCurrent = plan.id === currentPlan?.id;
              const isFeatured = copy?.featured ?? plan.highlight;
              const hasCheckout = !!plan.stripe_price_id;

              return (
                <div
                  key={plan.id}
                  className={cn(
                    "relative flex flex-col rounded-card border p-5 transition-shadow",
                    isFeatured
                      ? "border-line-strong bg-surface-hover shadow-pop"
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
                        <Check className="mt-0.5 h-3 w-3 shrink-0 text-txt-mut" aria-hidden />
                        {f}
                      </li>
                    ))}
                  </ul>

                  {/* CTA — dono, plano pago, não-atual */}
                  {!isCurrent && isOwner && plan.price_cents > 0 && (
                    <div className="mt-5">
                      {hasCheckout ? (
                        <button
                          onClick={() => void startStripeCheckout(plan.id)}
                          disabled={checkingOutPlanId === plan.id}
                          className={cn(
                            "focus-ring flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-60",
                            isFeatured
                              ? "bg-txt text-ink hover:opacity-90"
                              : "border border-line-strong text-txt hover:border-txt-mut"
                          )}
                        >
                          {checkingOutPlanId === plan.id && (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          )}
                          {t("Assinar")} {plan.name}
                        </button>
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
                      {isOwner && !subscription?.stripe_subscription_id ? (
                        <button
                          onClick={() => void handleDowngradeToFree()}
                          disabled={downgrading}
                          className="focus-ring flex w-full items-center justify-center gap-1.5 rounded-lg border border-line-strong px-3 py-2 text-sm font-semibold text-txt transition-colors hover:border-txt-mut disabled:opacity-60"
                        >
                          {downgrading && (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          )}
                          {t("Usar plano Free")}
                        </button>
                      ) : (
                        <p className="flex items-center justify-center gap-1.5 rounded-lg bg-surface-hover p-2 text-center text-[11px] text-txt-dim">
                          <Shield className="h-3 w-3 text-txt-mut" aria-hidden />
                          {t("Sempre gratuito — sem cartão")}
                        </p>
                      )}
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
