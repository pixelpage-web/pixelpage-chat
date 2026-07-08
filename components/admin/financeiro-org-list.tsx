"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ChevronDown,
  Cpu,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { statusLabel, statusTone } from "@/components/admin/subscription-status";

// ─── tipos ────────────────────────────────────────────────────────────────────

/** Linha retornada por get_admin_financial_dashboard (0029). */
export interface FinRow {
  org_id: string;
  org_name: string;
  plan_id: string;
  plan_name: string;
  mrr_usd: number;
  subscription_status: string;
  ai_mode: string;
  ai_cost_usd: number;
  ai_cost_limit_usd: number | null;
  usage_status: string;
  margin_usd: number;
  negative_margin_since: string | null;
}

/** Agregado por modelo (ai_usage_logs do mês, agrupado no servidor). */
export interface ModelUsage {
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

/** MRR vem de plans.price_cents (Cakto) — valor em reais. */
function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtUSD(v: number): string {
  return `US$ ${v.toFixed(2)}`;
}

function fmtTokens(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

const usageTone: Record<string, "ok" | "amber" | "danger" | "neutral"> = {
  ok: "neutral",
  warning: "amber",
  exceeded: "danger",
  blocked: "danger",
};

// ─── componente ───────────────────────────────────────────────────────────────

export function FinanceiroOrgList({
  rows,
  usageByOrg,
}: {
  rows: FinRow[];
  usageByOrg: Record<string, ModelUsage[]>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-panel-border bg-panel-card p-8 text-center text-sm text-[#555]">
        Nenhuma organização com assinatura encontrada.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-panel-border overflow-hidden rounded-xl border border-panel-border bg-panel-card">
      {rows.map((row) => {
        const expanded = openId === row.org_id;
        const isByok = row.ai_mode === "byok";
        const negative = !isByok && row.margin_usd < 0;
        const usagePct =
          row.ai_cost_limit_usd && row.ai_cost_limit_usd > 0
            ? Math.round((row.ai_cost_usd / row.ai_cost_limit_usd) * 100)
            : null;
        const models = usageByOrg[row.org_id] ?? [];
        const totalIn = models.reduce((s, m) => s + m.inputTokens, 0);
        const totalOut = models.reduce((s, m) => s + m.outputTokens, 0);

        return (
          <li key={row.org_id}>
            <button
              onClick={() => setOpenId(expanded ? null : row.org_id)}
              aria-expanded={expanded}
              className={cn(
                "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-panel-surface",
                expanded && "bg-panel-surface"
              )}
            >
              {/* Nome + plano + status */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-[#F8F8F8]">
                    {row.org_name}
                  </p>
                  {negative && (
                    <span className="shrink-0 rounded bg-danger px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                      Margem negativa
                    </span>
                  )}
                </div>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[#555]">
                  {row.plan_name}
                  <Badge tone={statusTone[row.subscription_status] ?? "neutral"}>
                    {statusLabel[row.subscription_status] ?? row.subscription_status}
                  </Badge>
                </p>
              </div>

              {/* Uso de IA (só faz sentido com teto — modo managed) */}
              <div className="hidden shrink-0 sm:block">
                {isByok ? (
                  <Badge tone="amber">BYOK</Badge>
                ) : usagePct !== null ? (
                  <Badge tone={usageTone[row.usage_status] ?? "neutral"}>
                    {usagePct}% do teto
                  </Badge>
                ) : (
                  <Badge tone="neutral">sem teto</Badge>
                )}
              </div>

              {/* Custo IA no mês */}
              <div className="hidden w-24 shrink-0 text-right sm:block">
                <p className="text-[9px] uppercase tracking-widest text-[#333]">
                  Custo IA
                </p>
                <p className="text-xs font-semibold tabular-nums text-[#CCC]">
                  {fmtUSD(row.ai_cost_usd)}
                </p>
              </div>

              {/* Margem individual — vermelho inconfundível quando negativa */}
              <div className="w-24 shrink-0 text-right">
                <p className="text-[9px] uppercase tracking-widest text-[#333]">
                  Margem
                </p>
                {isByok ? (
                  <Badge tone="amber" className="sm:hidden">BYOK</Badge>
                ) : (
                  <p
                    className={cn(
                      "text-xs font-bold tabular-nums",
                      negative
                        ? "rounded bg-danger/15 px-1.5 py-0.5 text-danger"
                        : "text-forest"
                    )}
                  >
                    ≈ {row.margin_usd < 0 ? "−" : ""}
                    {fmtBRL(Math.abs(row.margin_usd))}
                  </p>
                )}
                {isByok && (
                  <p className="hidden text-[10px] text-[#555] sm:block">
                    custo do cliente
                  </p>
                )}
              </div>

              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-[#444] transition-transform",
                  expanded && "rotate-180"
                )}
                aria-hidden
              />
            </button>

            {/* Drill-down */}
            {expanded && (
              <div className="space-y-4 border-t border-panel-border bg-panel-surface px-4 py-4">
                {/* Métricas rápidas — visíveis também no mobile (onde as colunas somem) */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <MiniStat label="MRR" value={fmtBRL(row.mrr_usd)} />
                  <MiniStat label="Custo IA no mês" value={fmtUSD(row.ai_cost_usd)} />
                  <MiniStat
                    label="Teto do plano"
                    value={
                      row.ai_cost_limit_usd && row.ai_cost_limit_usd > 0
                        ? fmtUSD(row.ai_cost_limit_usd)
                        : "sem teto"
                    }
                  />
                  <MiniStat
                    label="Tokens (in / out)"
                    value={`${fmtTokens(totalIn)} / ${fmtTokens(totalOut)}`}
                  />
                </div>

                {/* Modelos usados no mês */}
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.22em] text-[#333]">
                    <Cpu className="h-3 w-3" aria-hidden />
                    Modelos usados no mês
                  </p>
                  {models.length === 0 ? (
                    <p className="text-xs text-[#555]">Sem uso de IA neste mês.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[420px] text-xs">
                        <thead>
                          <tr className="text-left text-[9px] uppercase tracking-widest text-[#333]">
                            <th className="pb-1.5 font-medium">Modelo</th>
                            <th className="pb-1.5 text-right font-medium">Chamadas</th>
                            <th className="pb-1.5 text-right font-medium">Tokens in</th>
                            <th className="pb-1.5 text-right font-medium">Tokens out</th>
                            <th className="pb-1.5 text-right font-medium">Custo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-panel-border">
                          {models.map((m) => (
                            <tr key={m.model}>
                              <td className="py-1.5 font-mono text-[11px] text-[#CCC]">
                                {m.model}
                              </td>
                              <td className="py-1.5 text-right tabular-nums text-[#888]">
                                {m.calls}
                              </td>
                              <td className="py-1.5 text-right tabular-nums text-[#888]">
                                {fmtTokens(m.inputTokens)}
                              </td>
                              <td className="py-1.5 text-right tabular-nums text-[#888]">
                                {fmtTokens(m.outputTokens)}
                              </td>
                              <td className="py-1.5 text-right font-semibold tabular-nums text-[#CCC]">
                                {fmtUSD(m.costUsd)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Taxa de transferência bot→humano — honestamente indisponível:
                    conversations.bot_paused é gravado por 4 caminhos diferentes
                    (handoff por keyword, efeito de flow, regra de automação,
                    takeover manual) sem diferenciação nos dados. */}
                <p className="flex items-start gap-1.5 text-[11px] text-[#555]">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                  Taxa de transferência bot→humano: indisponível — requer
                  instrumentação adicional para separar handoff do bot de
                  takeover manual da equipe.
                </p>

                <Link
                  href={`/admin/organizations/${row.org_id}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-forest hover:underline"
                >
                  Ver organização
                  <ArrowUpRight className="h-3 w-3" aria-hidden />
                </Link>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-panel-card px-3 py-2.5">
      <p className="text-[9px] uppercase tracking-widest text-[#333]">{label}</p>
      <p className="mt-0.5 text-xs font-semibold tabular-nums text-[#CCC]">{value}</p>
    </div>
  );
}
