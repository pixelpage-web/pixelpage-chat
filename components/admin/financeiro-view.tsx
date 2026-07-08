import Link from "next/link";
import {
  AlertOctagon,
  AlertTriangle,
  Bot,
  ChevronRight,
  Clock,
  DollarSign,
  MessageSquare,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { cn, formatCompact } from "@/lib/utils";
import {
  FinanceiroOrgList,
  type FinRow,
  type ModelUsage,
} from "@/components/admin/financeiro-org-list";

// ─── tipos ────────────────────────────────────────────────────────────────────

export interface FinAlert {
  severity: "critico" | "atencao" | "aviso";
  orgId: string;
  orgName: string;
  reason: string;
}

export interface FinanceiroViewProps {
  monthLabel: string;
  planBreakdown: { plan: string; count: number }[];
  mrrTotal: number;
  aiCostTotal: number;
  marginTotal: number;
  messagesToday: number;
  messagesMonth: number;
  alerts: FinAlert[];
  rows: FinRow[];
  usageByOrg: Record<string, ModelUsage[]>;
  /** Erro ao chamar a RPC (ex.: migração 0029 ainda não aplicada). */
  loadError: string | null;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const severityMeta = {
  critico: {
    label: "CRÍTICO",
    icon: AlertOctagon,
    container: "border-danger/30 bg-danger/10 hover:border-danger/50",
    icolor: "text-danger",
    chip: "bg-danger text-white",
  },
  atencao: {
    label: "ATENÇÃO",
    icon: AlertTriangle,
    container: "border-[#F59E0B]/25 bg-[#F59E0B]/5 hover:border-[#F59E0B]/45",
    icolor: "text-[#F59E0B]",
    chip: "bg-[#F59E0B]/15 text-[#F59E0B]",
  },
  aviso: {
    label: "AVISO",
    icon: Clock,
    container: "border-panel-border bg-panel-surface hover:border-[#3A3A3A]",
    icolor: "text-[#888]",
    chip: "bg-panel-card text-[#888]",
  },
} as const;

// ─── componente ───────────────────────────────────────────────────────────────

export function FinanceiroView({
  monthLabel,
  planBreakdown,
  mrrTotal,
  aiCostTotal,
  marginTotal,
  messagesToday,
  messagesMonth,
  alerts,
  rows,
  usageByOrg,
  loadError,
}: FinanceiroViewProps) {
  const marginNegative = marginTotal < 0;

  const stats = [
    {
      label: "MRR total",
      value: fmtBRL(mrrTotal),
      sub: "assinaturas ativas",
      icon: DollarSign,
      tone: "accent" as const,
    },
    {
      label: "Custo de IA no mês",
      value: `US$ ${aiCostTotal.toFixed(2)}`,
      sub: "modo gerenciado (BYOK não conta)",
      icon: Bot,
      tone: "plain" as const,
    },
    {
      label: "Margem estimada",
      value: `${marginNegative ? "−" : ""}${fmtBRL(Math.abs(marginTotal))}`,
      sub: "MRR − custo de IA",
      icon: TrendingUp,
      tone: marginNegative ? ("danger" as const) : ("accent" as const),
    },
    {
      label: "Mensagens hoje",
      value: formatCompact(messagesToday),
      sub: `${formatCompact(messagesMonth)} no mês`,
      icon: MessageSquare,
      tone: "plain" as const,
    },
  ];

  return (
    <div className="min-h-full bg-panel">
      <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
        {/* ── Header ─────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#333]">
              PIXELPAGE · SUPER ADMIN
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-[#F8F8F8]">
              Financeiro
            </h1>
          </div>
          <div className="rounded-xl border border-panel-border bg-panel-card px-4 py-2.5 text-right">
            <p className="text-[9px] uppercase tracking-widest text-[#3A3A3A]">
              Mês de referência
            </p>
            <p className="mt-0.5 text-xs font-semibold capitalize text-[#666]">
              {monthLabel}
            </p>
          </div>
        </div>

        {/* ── Erro de carga (ex.: migração pendente) ──── */}
        {loadError && (
          <div className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-xs text-danger">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              Não foi possível carregar os dados financeiros:{" "}
              <span className="font-mono">{loadError}</span>
              {" "}— verifique se a migração 0029 (get_admin_financial_dashboard)
              foi aplicada.
            </span>
          </div>
        )}

        {/* ── KPI cards ──────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className={cn(
                "relative overflow-hidden rounded-xl border p-5",
                stat.tone === "accent" && "border-forest/25 bg-forest/5",
                stat.tone === "danger" && "border-danger/30 bg-danger/10",
                stat.tone === "plain" && "border-panel-border bg-panel-card"
              )}
            >
              {stat.tone === "accent" && (
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      "radial-gradient(ellipse at top right, rgba(93,214,44,0.10) 0%, transparent 65%)",
                  }}
                  aria-hidden
                />
              )}
              <div className="relative">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[11px] text-[#555]">{stat.label}</p>
                  <div
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                      stat.tone === "accent" && "bg-forest/15",
                      stat.tone === "danger" && "bg-danger/15",
                      stat.tone === "plain" && "bg-panel-surface"
                    )}
                  >
                    <stat.icon
                      className={cn(
                        "h-3.5 w-3.5",
                        stat.tone === "accent" && "text-forest",
                        stat.tone === "danger" && "text-danger",
                        stat.tone === "plain" && "text-[#444]"
                      )}
                      aria-hidden
                    />
                  </div>
                </div>
                <p
                  className={cn(
                    "mt-2 font-display text-2xl font-bold tabular-nums leading-none",
                    stat.tone === "accent" && "text-forest",
                    stat.tone === "danger" && "text-danger",
                    stat.tone === "plain" && "text-[#F8F8F8]"
                  )}
                >
                  {stat.value}
                </p>
                <p className="mt-1.5 text-[10px] text-[#3A3A3A]">{stat.sub}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-[10px] leading-relaxed text-[#3A3A3A]">
          MRR em R$ (preço dos planos via Cakto) · custo de IA em US$ (tabela
          ai_model_pricing) · margem estimada = MRR − custo, sem conversão
          cambial.
        </p>

        {/* ── Alertas + clientes por plano ───────────── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-panel-border bg-panel-card p-5 lg:col-span-2">
            <h2 className="text-sm font-semibold text-[#F8F8F8]">
              Central de alertas
            </h2>
            <p className="mt-0.5 text-[11px] text-[#444]">
              ordenados por urgência · clique para abrir a organização
            </p>

            {alerts.length === 0 ? (
              <p className="mt-5 flex items-center gap-2 text-xs text-[#555]">
                <ShieldCheck className="h-3.5 w-3.5 text-forest" aria-hidden />
                Nenhum alerta no momento — margens saudáveis e pagamentos em dia.
              </p>
            ) : (
              <ol className="mt-4 space-y-2">
                {alerts.map((alert) => {
                  const meta = severityMeta[alert.severity];
                  return (
                    <li key={`${alert.severity}-${alert.orgId}`}>
                      <Link
                        href={`/admin/organizations/${alert.orgId}`}
                        className={cn(
                          "flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border px-3 py-2.5 text-xs transition-colors sm:flex-nowrap",
                          meta.container
                        )}
                      >
                        <meta.icon
                          className={cn("h-3.5 w-3.5 shrink-0", meta.icolor)}
                          aria-hidden
                        />
                        <span
                          className={cn(
                            "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider",
                            meta.chip
                          )}
                        >
                          {meta.label}
                        </span>
                        <span className="min-w-0 truncate font-medium text-[#F8F8F8]">
                          {alert.orgName}
                        </span>
                        {/* No mobile a razão quebra para a própria linha (é a informação
                            principal do alerta); de sm: pra cima fica na mesma linha. */}
                        <span className="order-last w-full text-[#777] sm:order-none sm:w-auto sm:min-w-0 sm:flex-1 sm:truncate">
                          {alert.reason}
                        </span>
                        <ChevronRight
                          className="ml-auto h-3.5 w-3.5 shrink-0 text-[#444] sm:ml-0"
                          aria-hidden
                        />
                      </Link>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          <div className="rounded-xl border border-panel-border bg-panel-card p-5">
            <h2 className="text-sm font-semibold text-[#F8F8F8]">
              Clientes ativos por plano
            </h2>
            <p className="mt-0.5 text-[11px] text-[#444]">
              assinaturas com status “Ativa”
            </p>
            {planBreakdown.length === 0 ? (
              <p className="mt-5 text-xs text-[#555]">
                Nenhum cliente com assinatura ativa ainda.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-panel-border">
                {planBreakdown.map((p) => (
                  <li
                    key={p.plan}
                    className="flex items-center justify-between py-2.5"
                  >
                    <span className="text-xs text-[#666]">{p.plan}</span>
                    <span className="font-display text-sm font-bold tabular-nums text-forest">
                      {p.count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* ── Margem por cliente ─────────────────────── */}
        <section>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-[#F8F8F8]">
                Margem por cliente
              </h2>
              <p className="mt-0.5 text-[11px] text-[#444]">
                pior margem primeiro · clique numa linha para detalhes de uso de IA
              </p>
            </div>
          </div>
          <FinanceiroOrgList rows={rows} usageByOrg={usageByOrg} />
        </section>
      </div>
    </div>
  );
}
