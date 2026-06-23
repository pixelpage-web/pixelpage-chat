"use client";

import { useState } from "react";
import { toast } from "sonner";
import { differenceInCalendarDays } from "date-fns";
import { Check, Clock, CreditCard, Sparkles, Zap } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn, formatBRL, formatCompact, formatFullDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input, Label } from "@/components/ui/input";
import type { PlanRow, SubscriptionRow } from "@/types/database";

interface InvoiceItem {
  id: string;
  status: string;
  value: number;
  due_date: string;
  url: string | null;
  description: string | null;
}

const statusLabels: Record<SubscriptionRow["status"], { label: string; tone: "lime" | "amber" | "danger" | "ok" }> = {
  trial: { label: "Período de teste", tone: "lime" },
  active: { label: "Ativa", tone: "ok" },
  past_due: { label: "Pagamento pendente", tone: "amber" },
  canceled: { label: "Cancelada", tone: "danger" },
};

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
  const pct = unlimited || limit === 0 ? 0 : Math.min((used / limit) * 100, 100);
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

export function BillingView({
  subscription,
  currentPlan,
  plans,
  aiUsed,
  connectionsCount,
  teamCount,
  invoices,
  asaasConfigured,
  isOwner,
}: {
  subscription: SubscriptionRow | null;
  currentPlan: PlanRow | null;
  plans: PlanRow[];
  aiUsed: number;
  connectionsCount: number;
  teamCount: number;
  invoices: InvoiceItem[];
  asaasConfigured: boolean;
  isOwner: boolean;
}) {
  const t = useT();
  const [demoOpen, setDemoOpen] = useState(false);
  const [cpfModalPlan, setCpfModalPlan] = useState<PlanRow | null>(null);
  const [cpf, setCpf] = useState("");
  const [subscribing, setSubscribing] = useState(false);

  const status = subscription ? statusLabels[subscription.status] : null;
  const trialDaysLeft =
    subscription?.status === "trial" && subscription.trial_ends_at
      ? differenceInCalendarDays(new Date(subscription.trial_ends_at), new Date())
      : null;

  async function subscribe(plan: PlanRow, cpfCnpj?: string) {
    setSubscribing(true);
    try {
      const res = await fetch("/api/billing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: plan.id, cpf_cnpj: cpfCnpj }),
      });
      const json = (await res.json()) as {
        demo?: boolean;
        need_cpf?: boolean;
        payment_url?: string | null;
        message?: string;
        error?: string;
      };

      if (json.demo) {
        setDemoOpen(true);
        return;
      }
      if (json.need_cpf) {
        setCpfModalPlan(plan);
        return;
      }
      if (!res.ok) {
        toast.error(json.error ?? t("Não foi possível iniciar a assinatura."));
        return;
      }
      setCpfModalPlan(null);
      toast.success(json.message ?? t("Assinatura iniciada!"));
      if (json.payment_url) {
        window.open(json.payment_url, "_blank", "noopener");
      }
    } catch {
      toast.error(t("Erro de conexão. Tente novamente."));
    } finally {
      setSubscribing(false);
    }
  }

  function handlePlanClick(plan: PlanRow) {
    if (!isOwner) {
      toast.error(t("Apenas o dono da organização pode alterar o plano."));
      return;
    }
    if (!asaasConfigured) {
      setDemoOpen(true);
      return;
    }
    void subscribe(plan);
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
        <header>
          <h1 className="font-display text-lg font-semibold">{t("Assinatura")}</h1>
          <p className="mt-0.5 text-sm text-txt-mut">
            {t("Seu plano, consumo do mês e faturas.")}
          </p>
        </header>

        {/* Plano atual + uso */}
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
                    : t("Seu período de teste terminou — escolha um plano para continuar.")
                  : subscription?.current_period_end
                    ? `${t("Próxima renovação:")} ${formatFullDate(subscription.current_period_end)}`
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
            {t("Webhook n8n e modo manual não consomem o saldo de mensagens IA — são ilimitados em todos os planos.")}
          </p>
        </Card>

        {/* Planos */}
        <section>
          <h2 className="mb-3 font-display text-sm font-semibold text-txt-mut">
            {t("Planos disponíveis")}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => {
              const isCurrent = plan.id === currentPlan?.id;
              const isTrial = plan.name === "Trial";
              return (
                <div
                  key={plan.id}
                  className={cn(
                    "flex flex-col rounded-card border p-4",
                    isCurrent
                      ? "border-lime/50 bg-lime-soft shadow-glow"
                      : "border-line bg-surface"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-display text-sm font-semibold">{plan.name}</p>
                    {isCurrent ? (
                      <Badge tone="lime">{t("atual")}</Badge>
                    ) : plan.highlight ? (
                      <Badge tone="amber">⭐ {t("Mais popular")}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-2 font-display text-lg font-semibold">
                    {plan.price_cents > 0 ? (
                      <>
                        {formatBRL(plan.price_cents)}
                        <span className="text-xs font-normal text-txt-dim">/{t("mês")}</span>
                      </>
                    ) : isTrial ? (
                      t("Grátis · 7 dias")
                    ) : (
                      <span className="text-txt-mut">{t("Em breve")}</span>
                    )}
                  </p>
                  <ul className="mt-3 flex-1 space-y-1.5 text-xs text-txt-mut">
                    <li className="flex items-center gap-1.5">
                      <Check className="h-3 w-3 shrink-0 text-lime" aria-hidden />
                      {formatCompact(plan.ai_messages_limit)} {t("mensagens IA/mês")}
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Check className="h-3 w-3 shrink-0 text-lime" aria-hidden />
                      {plan.connections_limit}{" "}
                      {plan.connections_limit === 1 ? t("conexão") : t("conexões")} WhatsApp
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Check className="h-3 w-3 shrink-0 text-lime" aria-hidden />
                      {t("Webhook n8n ilimitado")}
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Check className="h-3 w-3 shrink-0 text-lime" aria-hidden />
                      {plan.team_limit === null
                        ? t("Equipe ilimitada")
                        : `${plan.team_limit} ${plan.team_limit === 1 ? t("membro") : t("membros")}`}
                    </li>
                  </ul>
                  {!isCurrent && !isTrial && (
                    <Button
                      onClick={() => handlePlanClick(plan)}
                      variant={plan.name === "Pro" ? "primary" : "secondary"}
                      size="sm"
                      className="mt-4 w-full"
                      loading={subscribing && cpfModalPlan === null}
                    >
                      <Sparkles className="h-3.5 w-3.5" aria-hidden />
                      {t("Assinar")} {plan.name}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Faturas */}
        <Card>
          <CardTitle>{t("Histórico de faturas")}</CardTitle>
          {invoices.length === 0 ? (
            <p className="mt-4 rounded-lg border border-dashed border-line p-4 text-center text-xs text-txt-dim">
              {asaasConfigured
                ? t("Nenhuma fatura ainda.")
                : t("As faturas aparecem aqui quando a cobrança estiver ativa.")}
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-line overflow-hidden rounded-lg border border-line">
              {invoices.map((inv) => (
                <li
                  key={inv.id}
                  className="flex items-center justify-between gap-3 bg-ink px-3 py-2.5 text-xs"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Badge
                      tone={
                        inv.status === "CONFIRMED" || inv.status === "RECEIVED"
                          ? "ok"
                          : inv.status === "OVERDUE"
                            ? "danger"
                            : "amber"
                      }
                    >
                      {inv.status === "CONFIRMED" || inv.status === "RECEIVED"
                        ? t("Paga")
                        : inv.status === "OVERDUE"
                          ? t("Vencida")
                          : t("Pendente")}
                    </Badge>
                    <span className="truncate text-txt-mut">
                      {inv.description ?? t("Assinatura PixelPage Chat")}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-medium text-txt">
                      {formatBRL(Math.round(inv.value * 100))}
                    </span>
                    <span className="text-txt-dim">{inv.due_date}</span>
                    {inv.url && (
                      <a
                        href={inv.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-lime hover:underline"
                      >
                        {t("ver")}
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Modal demo (Asaas não configurado) */}
      <Modal open={demoOpen} onClose={() => setDemoOpen(false)} title={t("Em breve")}>
        <div className="flex flex-col items-center py-2 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-lime-soft">
            <Clock className="h-6 w-6 text-lime" aria-hidden />
          </div>
          <p className="text-sm leading-relaxed text-txt-mut">
            {t("A cobrança automática está em fase final de configuração. Enquanto isso, fale com a gente para ativar seu plano manualmente.")}
          </p>
          <Button onClick={() => setDemoOpen(false)} variant="secondary" className="mt-5">
            {t("Entendi")}
          </Button>
        </div>
      </Modal>

      {/* Modal CPF/CNPJ (primeira cobrança via Asaas) */}
      <Modal
        open={cpfModalPlan !== null}
        onClose={() => setCpfModalPlan(null)}
        title={`${t("Assinar plano")} ${cpfModalPlan?.name ?? ""}`}
      >
        <p className="text-sm leading-relaxed text-txt-mut">
          {t("Para emitir a cobrança (Pix, boleto ou cartão), informe o CPF ou CNPJ do titular.")}
        </p>
        <div className="mt-4">
          <Label htmlFor="cpf">{t("CPF ou CNPJ")}</Label>
          <Input
            id="cpf"
            value={cpf}
            onChange={(e) => setCpf(e.target.value)}
            placeholder="000.000.000-00"
            inputMode="numeric"
          />
        </div>
        <Button
          onClick={() => cpfModalPlan && void subscribe(cpfModalPlan, cpf)}
          loading={subscribing}
          disabled={cpf.replace(/\D/g, "").length < 11}
          className="mt-4 w-full"
        >
          <CreditCard className="h-4 w-4" aria-hidden />
          {t("Gerar fatura")}
        </Button>
      </Modal>
    </div>
  );
}
