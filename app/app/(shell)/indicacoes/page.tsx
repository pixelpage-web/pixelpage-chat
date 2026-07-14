"use client";

import { useEffect, useState, useCallback } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Gift,
  Loader2,
  Share2,
  Trophy,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatFullDate } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import type { MilestoneConfig, MilestoneProgress } from "@/lib/referral";
import type { ReferralRow, ReferralRewardRow } from "@/types/database";

export const dynamic = "force-dynamic";

// ─── labels ───────────────────────────────────────────────────────────────────

const REWARD_LABELS: Record<string, string> = {
  discount_20: "20% de desconto no próximo mês",
  discount_50: "50% de desconto no próximo mês",
  free_month: "1 mês grátis",
  free_6months: "6 meses grátis",
};

// ─── types ────────────────────────────────────────────────────────────────────

type StatsData = {
  link: { id: string; code: string; enabled: boolean; clicks: number; url: string } | null;
  referrals: ReferralRow[];
  rewards: ReferralRewardRow[];
  stats: {
    total: number;
    pending: number;
    activated: number;
    rewarded: number;
    pendingRewards: number;
  };
  milestoneProgress: MilestoneProgress;
  pendingMilestones: MilestoneConfig[];
  hasPaidPlan: boolean;
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function ReferralStatusBadge({ status }: { status: ReferralRow["status"] }) {
  const map = {
    pending:   { tone: "amber" as const, label: "Aguardando assinatura" },
    activated: { tone: "lime" as const,  label: "Ativo" },
    rewarded:  { tone: "ok" as const,    label: "Recompensado" },
    canceled:  { tone: "danger" as const, label: "Cancelado" },
  };
  const { tone, label } = map[status] ?? { tone: "amber" as const, label: status };
  return <Badge tone={tone}>{label}</Badge>;
}

// ─── milestone progress ───────────────────────────────────────────────────────

function MilestoneProgressBar({ progress }: { progress: MilestoneProgress }) {
  const { activatedCount, currentMilestone, nextMilestone, toNextMilestone } = progress;

  const prevAt = currentMilestone?.at ?? 0;
  const nextAt = nextMilestone?.at ?? (currentMilestone?.at ?? 20);
  const rangeSize = nextAt - prevAt;
  const posInRange = activatedCount - prevAt;
  const pct = nextMilestone && rangeSize > 0
    ? Math.min((posInRange / rangeSize) * 100, 100)
    : 100;

  return (
    <div>
      {/* Progress bar */}
      <div className="relative h-2 overflow-hidden rounded-full bg-surface-raised">
        <div
          className="h-full rounded-full bg-lime transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Labels below bar */}
      <div className="mt-2 flex items-center justify-between text-[11px]">
        <span className="text-txt-dim">
          {currentMilestone
            ? `Marco ${currentMilestone.at}: ${currentMilestone.label}`
            : "Nenhum marco atingido"}
        </span>
        {nextMilestone && (
          <span className="font-medium text-lime">
            {toNextMilestone === 1
              ? "1 indicação para "
              : `${toNextMilestone} indicações para `}
            <span className="text-txt">{nextMilestone.label}</span>
          </span>
        )}
        {!nextMilestone && (
          <span className="inline-flex items-center gap-1 font-medium text-lime">
            Nível máximo! <Trophy className="h-3.5 w-3.5" aria-hidden />
          </span>
        )}
      </div>
    </div>
  );
}

// ─── reward card ──────────────────────────────────────────────────────────────

function RewardCard({ reward }: { reward: ReferralRewardRow }) {
  const days = daysUntil(reward.expires_at);
  const expiringSoon = days !== null && days <= 7 && reward.status === "pending";
  const label = REWARD_LABELS[reward.reward_type] ?? reward.reward_type;

  return (
    <div
      className={cn(
        "rounded-card border p-4",
        reward.status === "applied"
          ? "border-lime/30 bg-lime/5"
          : reward.status === "expired"
            ? "border-line bg-surface opacity-60"
            : expiringSoon
              ? "border-amber/40 bg-amber/5"
              : "border-line bg-surface"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <Trophy className="h-4 w-4 text-amber shrink-0" aria-hidden />
            <p className="text-sm font-medium">{label}</p>
          </div>
          <p className="mt-0.5 text-[11px] text-txt-dim">
            Marco de {reward.milestone} indicações
          </p>
          {reward.expires_at && reward.status === "pending" && (
            <p
              className={cn(
                "mt-1 flex items-center gap-1 text-[11px]",
                expiringSoon ? "font-medium text-amber" : "text-txt-dim"
              )}
            >
              {expiringSoon && <AlertTriangle className="h-3 w-3" aria-hidden />}
              {days !== null && days > 0
                ? `Válida por mais ${days} dia${days !== 1 ? "s" : ""}`
                : days === 0
                  ? "Expira hoje!"
                  : "Expirou"}
            </p>
          )}
          {reward.status === "applied" && reward.applied_at && (
            <p className="mt-1 text-[11px] text-txt-dim">
              Aplicada em {formatFullDate(reward.applied_at)}
            </p>
          )}
        </div>
        <Badge
          tone={
            reward.status === "applied"
              ? "ok"
              : reward.status === "expired"
                ? "danger"
                : expiringSoon
                  ? "amber"
                  : "lime"
          }
        >
          {reward.status === "applied"
            ? "Aplicada"
            : reward.status === "expired"
              ? "Expirada"
              : "Pendente"}
        </Badge>
      </div>

      {reward.status === "pending" && (
        <p className="mt-2 text-[11px] text-txt-dim">
          Aguardando aplicação pelo time PixelPage Chat
        </p>
      )}
    </div>
  );
}

// ─── componente principal ─────────────────────────────────────────────────────

export default function IndicacoesPage() {
  const t = useT();
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // 403 em /api/referral/link = papel sem permissão pra gerenciar o link
  // (só owner/admin) — não é falha da página, só uma seção indisponível
  // pra este usuário.
  const [linkForbidden, setLinkForbidden] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [statsRes, linkRes] = await Promise.all([
        fetch("/api/referral/stats"),
        fetch("/api/referral/link"),
      ]);

      if (!statsRes.ok) {
        setData(null);
        setLoadError(true);
        return;
      }
      const stats = await statsRes.json() as Omit<StatsData, "hasPaidPlan">;

      if (!linkRes.ok) {
        setLinkForbidden(linkRes.status === 403);
        setData({ ...stats, hasPaidPlan: true });
        return;
      }
      setLinkForbidden(false);
      const linkData = await linkRes.json() as {
        link: StatsData["link"];
        url: string;
        hasPaidPlan: boolean;
      };
      setData({
        ...stats,
        link: linkData.link
          ? { ...linkData.link, url: linkData.url }
          : stats.link,
        hasPaidPlan: linkData.hasPaidPlan,
      });
    } catch {
      setData(null);
      setLoadError(true);
      toast.error("Erro ao carregar dados de indicações");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createLink() {
    setCreating(true);
    try {
      const res = await fetch("/api/referral/link");
      if (!res.ok) {
        toast.error(
          res.status === 403
            ? "Apenas donos e administradores podem gerenciar o link de indicação."
            : "Não foi possível criar o link."
        );
        return;
      }
      await load();
    } catch {
      toast.error("Erro ao criar link");
    } finally {
      setCreating(false);
    }
  }

  async function copyLink() {
    if (!data?.link?.url) return;
    await navigator.clipboard.writeText(data.link.url);
    toast.success("Link copiado!");
  }

  async function shareLink() {
    if (!data?.link?.url) return;
    if (navigator.share) {
      await navigator.share({
        title: "PixelPage Chat",
        text: "Automatize seu WhatsApp com IA. 7 dias grátis!",
        url: data.link.url,
      });
    } else {
      await copyLink();
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-lime" />
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 px-4 text-center">
        <AlertTriangle className="h-6 w-6 text-danger" aria-hidden />
        <p className="text-sm text-txt-mut">
          {t("Não foi possível carregar os dados de indicações.")}
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setLoading(true);
            void load();
          }}
        >
          {t("Tentar novamente")}
        </Button>
      </div>
    );
  }

  const { stats, milestoneProgress, pendingMilestones, rewards, referrals } = data;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
        <header>
          <h1 className="font-display text-lg font-semibold">{t("Indicações")}</h1>
          <p className="mt-0.5 text-sm text-txt-mut">
            {t("Indique a PixelPage Chat e ganhe recompensas por marcos atingidos.")}
          </p>
        </header>

        {/* Progresso de marcos */}
        {milestoneProgress && (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Trophy className="h-4 w-4 text-amber" aria-hidden />
                  {milestoneProgress.currentMilestone
                    ? `Marco atual: ${milestoneProgress.currentMilestone.label}`
                    : "Seu programa de indicações"}
                </CardTitle>
                <CardDescription>
                  {milestoneProgress.currentMilestone
                    ? `Recompensa: ${milestoneProgress.currentMilestone.description}`
                    : "Comece a indicar e ganhe recompensas por marco"}
                </CardDescription>
              </div>
              <div className="text-right">
                <p className="font-display text-2xl font-bold text-lime">
                  {milestoneProgress.activatedCount}
                </p>
                <p className="text-[11px] text-txt-dim">
                  indicaç{milestoneProgress.activatedCount === 1 ? "ão" : "ões"} ativas
                </p>
              </div>
            </div>

            <div className="mt-5">
              <MilestoneProgressBar progress={milestoneProgress} />
            </div>

            {/* Próximos marcos */}
            {pendingMilestones && pendingMilestones.length > 0 && (
              <div className="mt-5 border-t border-line pt-4">
                <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-txt-dim">
                  Próximas recompensas
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {pendingMilestones.map((m) => (
                    <div
                      key={m.at}
                      className="flex items-center gap-2.5 rounded-lg border border-dashed border-line px-3 py-2 text-[11px]"
                    >
                      <Gift className="h-3.5 w-3.5 shrink-0 text-txt-dim" aria-hidden />
                      <span>
                        <span className="font-medium text-txt">{m.at} indicações →</span>{" "}
                        <span className="text-txt-mut">{m.description}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Estatísticas */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total enviados", value: stats?.total ?? 0, icon: Users, accent: false },
            { label: "Aguardando",     value: stats?.pending ?? 0, icon: Clock, dim: true },
            { label: "Ativados",       value: stats?.activated ?? 0, icon: CheckCircle2, accent: true },
            { label: "Recompensas",    value: stats?.pendingRewards ?? 0, icon: Gift, warn: true },
          ].map(({ label, value, icon: Icon, accent, dim, warn }) => (
            <div key={label} className="rounded-card border border-line bg-surface p-4">
              <div className="flex items-center gap-1.5 text-[11px] text-txt-mut">
                <Icon
                  className={cn(
                    "h-3 w-3",
                    accent ? "text-lime" : warn ? "text-amber" : dim ? "text-txt-dim" : "text-txt-mut"
                  )}
                  aria-hidden
                />
                {label}
              </div>
              <p className={cn("mt-1 font-display text-2xl font-bold", accent && "text-lime")}>
                {value}
              </p>
            </div>
          ))}
        </div>

        {/* Link de indicação */}
        <Card>
          <CardTitle>Seu link de indicação</CardTitle>
          <CardDescription>
            Compartilhe. Quando alguém assinar um plano pago, você ganha uma recompensa.
          </CardDescription>

          {data?.link ? (
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-2 overflow-hidden rounded-lg border border-line bg-surface-raised px-3 py-2">
                <span className="flex-1 truncate font-mono text-xs text-txt-mut">
                  {data.link.url}
                </span>
                <button
                  onClick={copyLink}
                  className="shrink-0 rounded-md p-1.5 text-txt-dim transition-colors hover:bg-surface hover:text-lime"
                  title="Copiar link"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={copyLink} className="gap-1.5">
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                  Copiar link
                </Button>
                <Button variant="outline" size="sm" onClick={shareLink} className="gap-1.5">
                  <Share2 className="h-3.5 w-3.5" aria-hidden />
                  Compartilhar
                </Button>
                <a
                  href={data.link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-txt-mut transition-colors hover:border-lime/40 hover:text-lime"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  Visualizar
                </a>
              </div>

              <p className="text-[11px] text-txt-dim">
                {data.link.clicks}{" "}
                {data.link.clicks === 1 ? "clique" : "cliques"} no seu link
              </p>
            </div>
          ) : (
            <div className="mt-4">
              {linkForbidden ? (
                <p className="rounded-lg border border-dashed border-line p-4 text-center text-sm text-txt-dim">
                  Apenas donos e administradores podem gerenciar o link de indicação.
                </p>
              ) : data.hasPaidPlan === false ? (
                <p className="rounded-lg border border-dashed border-line p-4 text-center text-sm text-txt-dim">
                  Faça upgrade para um plano pago para participar do programa de indicações.
                </p>
              ) : (
                <Button onClick={createLink} loading={creating} className="gap-1.5">
                  <Gift className="h-4 w-4" aria-hidden />
                  Criar meu link de indicação
                </Button>
              )}
            </div>
          )}
        </Card>

        {/* Recompensas */}
        {(rewards?.length ?? 0) > 0 && (
          <section>
            <h2 className="mb-3 font-display text-sm font-semibold text-txt-mut">
              Recompensas por marco
            </h2>
            <div className="space-y-3">
              {rewards?.map((r) => (
                <RewardCard key={r.id} reward={r} />
              ))}
            </div>
          </section>
        )}

        {/* Lista de indicações */}
        {(referrals?.length ?? 0) > 0 && (
          <section>
            <h2 className="mb-3 font-display text-sm font-semibold text-txt-mut">
              Suas indicações
            </h2>
            <div className="space-y-2">
              {referrals?.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-card border border-line bg-surface px-4 py-3"
                >
                  <div className="text-sm">
                    <p className="font-medium">Indicação #{r.id.slice(0, 8)}</p>
                    <p className="text-[11px] text-txt-dim">
                      {new Date(r.created_at).toLocaleDateString("pt-BR")}
                      {r.activated_at && (
                        <> · ativada em {new Date(r.activated_at).toLocaleDateString("pt-BR")}</>
                      )}
                    </p>
                  </div>
                  <ReferralStatusBadge status={r.status} />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
