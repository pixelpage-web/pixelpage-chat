"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { formatPhone, timeAgo } from "@/lib/utils";
import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { CsatResponseRow } from "@/types/database";

/**
 * Aba "Satisfação" dos relatórios: nota média, evolução no tempo, média por
 * agente, taxa de resposta e últimas avaliações.
 */

/** 5 estrelas visuais (preenchidas até a nota, arredondada). Nunca carinhas. */
function StarRating({ score, size = "h-3.5 w-3.5" }: { score: number; size?: string }) {
  const rounded = Math.round(score);
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${score} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`${size} ${n <= rounded ? "fill-txt text-txt" : "text-line-strong"}`}
          aria-hidden
        />
      ))}
    </span>
  );
}

export function CsatReport({ orgId, periodDays }: { orgId: string; periodDays: number }) {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [responses, setResponses] = useState<CsatResponseRow[]>([]);
  const [sentCount, setSentCount] = useState(0);
  const [contactNames, setContactNames] = useState<Record<string, string>>({});
  const [agentNames, setAgentNames] = useState<Record<string, string>>({});
  const [units, setUnits] = useState<{ id: string; name: string }[]>([]);
  const [unitFilter, setUnitFilter] = useState<string | "all">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const since = new Date(Date.now() - periodDays * 86400_000).toISOString();

      const [respRes, sentRes, contactRes, teamRes, unitsRes] = await Promise.all([
        supabase
          .from("csat_responses")
          .select("*")
          .eq("org_id", orgId)
          .gte("created_at", since)
          .order("created_at", { ascending: true })
          .limit(5000),
        // Pesquisas enviadas no período (conversas com csat_sent_at)
        supabase
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .gte("csat_sent_at", since),
        supabase.from("contacts").select("id, name, phone").eq("org_id", orgId),
        supabase.from("profiles").select("id, name").eq("org_id", orgId),
        supabase.from("org_units").select("id, name").eq("org_id", orgId).order("name"),
      ]);

      if (respRes.error) {
        toast.error(t("Não foi possível carregar os dados de satisfação."));
        return;
      }
      setResponses(respRes.data ?? []);
      setSentCount(sentRes.count ?? 0);
      setUnits(unitsRes.data ?? []);
      setContactNames(
        Object.fromEntries(
          (contactRes.data ?? []).map((c) => [c.id, c.name || formatPhone(c.phone)])
        )
      );
      setAgentNames(
        Object.fromEntries((teamRes.data ?? []).map((p) => [p.id, p.name || "Sem nome"]))
      );
    } catch {
      toast.error(t("Erro de conexão ao carregar a satisfação."));
    } finally {
      setLoading(false);
    }
  }, [orgId, periodDays, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () => (unitFilter === "all" ? responses : responses.filter((r) => r.unit_id === unitFilter)),
    [responses, unitFilter]
  );

  const average = useMemo(() => {
    if (filtered.length === 0) return null;
    return filtered.reduce((sum, r) => sum + r.score, 0) / filtered.length;
  }, [filtered]);

  /** Evolução da nota: média por dia (só dias com resposta). */
  const timeline = useMemo(() => {
    const byDay = new Map<string, { sum: number; n: number }>();
    for (const r of filtered) {
      const day = r.created_at.slice(0, 10);
      const cur = byDay.get(day) ?? { sum: 0, n: 0 };
      cur.sum += r.score;
      cur.n += 1;
      byDay.set(day, cur);
    }
    return [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, { sum, n }]) => ({ day, avg: sum / n }));
  }, [filtered]);

  const byAgent = useMemo(() => {
    const map = new Map<string, { sum: number; n: number }>();
    for (const r of filtered) {
      const key = r.agent_id ?? "__bot__";
      const cur = map.get(key) ?? { sum: 0, n: 0 };
      cur.sum += r.score;
      cur.n += 1;
      map.set(key, cur);
    }
    return [...map.entries()]
      .map(([agentId, { sum, n }]) => ({
        agentId,
        name:
          agentId === "__bot__"
            ? t("Sem agente (bot)")
            : (agentNames[agentId] ?? "—"),
        avg: sum / n,
        total: n,
      }))
      .sort((a, b) => b.avg - a.avg);
  }, [filtered, agentNames, t]);

  const responseRate = sentCount > 0 ? (filtered.length / sentCount) * 100 : null;
  const last10 = useMemo(() => [...filtered].reverse().slice(0, 10), [filtered]);

  // Polilinha do gráfico (SVG responsivo via viewBox)
  const chart = useMemo(() => {
    if (timeline.length === 0) return null;
    const w = 600;
    const h = 140;
    const pad = 10;
    const xs = (i: number) =>
      timeline.length === 1
        ? w / 2
        : pad + (i / (timeline.length - 1)) * (w - pad * 2);
    const ys = (avg: number) => h - pad - ((avg - 1) / 4) * (h - pad * 2);
    const points = timeline.map((p, i) => `${xs(i)},${ys(p.avg)}`).join(" ");
    return { w, h, points, xs, ys };
  }, [timeline]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-44 w-full" />
      </div>
    );
  }

  if (responses.length === 0 && sentCount === 0) {
    return (
      <Card>
        <div className="flex flex-col items-center py-8 text-center">
          <Star className="h-8 w-8 text-txt-dim" aria-hidden />
          <p className="mt-3 text-sm font-semibold">{t("Sem avaliações no período")}</p>
          <p className="mt-1 max-w-sm text-xs leading-relaxed text-txt-mut">
            {t("Ative a pesquisa de satisfação nas configurações da conexão (botão CSAT) ou use o bloco de CSAT no builder de fluxos. As notas dos clientes aparecem aqui.")}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filtro por unidade — só aparece quando a org tem unidades cadastradas */}
      {units.length > 0 && (
        <select
          value={unitFilter}
          onChange={(e) => setUnitFilter(e.target.value)}
          className="focus-ring h-8 w-full max-w-xs rounded-md border border-line bg-surface px-2 text-xs text-txt-mut"
          aria-label={t("Filtrar por unidade")}
        >
          <option value="all">{t("Todas as unidades")}</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {/* Nota média geral */}
        <Card className="sm:col-span-1">
          <p className="text-xs font-medium text-txt-mut">{t("Nota média geral")}</p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="font-display text-4xl font-semibold text-txt">
              {average !== null ? average.toFixed(1) : "—"}
            </p>
            {average !== null && <StarRating score={average} size="h-4 w-4" />}
          </div>
          <p className="mt-1 text-[11px] text-txt-dim">
            {filtered.length}{" "}
            {filtered.length === 1 ? t("avaliação") : t("avaliações")} {t("no período")}
          </p>
        </Card>

        {/* Enviadas vs respondidas */}
        <Card className="sm:col-span-2">
          <p className="text-xs font-medium text-txt-mut">
            {t("Pesquisas enviadas vs respondidas")}
          </p>
          <div className="mt-3 flex items-end gap-6">
            <div>
              <p className="font-display text-2xl font-semibold">{sentCount}</p>
              <p className="text-[11px] text-txt-dim">{t("enviadas")}</p>
            </div>
            <div>
              <p className="font-display text-2xl font-semibold">{filtered.length}</p>
              <p className="text-[11px] text-txt-dim">{t("respondidas")}</p>
            </div>
            <div>
              <p className="font-display text-2xl font-semibold text-txt">
                {responseRate !== null ? `${Math.round(responseRate)}%` : "—"}
              </p>
              <p className="text-[11px] text-txt-dim">{t("taxa de resposta")}</p>
            </div>
          </div>
          {responseRate !== null && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-raised">
              <div
                className="h-full rounded-full bg-txt-mut/70"
                style={{ width: `${Math.min(responseRate, 100)}%` }}
              />
            </div>
          )}
        </Card>
      </div>

      {/* Evolução da nota */}
      <Card>
        <CardTitle>{t("Evolução da nota ao longo do tempo")}</CardTitle>
        {chart ? (
          <div className="mt-4">
            <svg
              viewBox={`0 0 ${chart.w} ${chart.h}`}
              className="h-36 w-full"
              role="img"
              aria-label={t("Gráfico da evolução da nota média")}
            >
              {/* Linhas de referência (notas 1 a 5) */}
              {[1, 2, 3, 4, 5].map((score) => (
                <g key={score}>
                  <line
                    x1={10}
                    x2={chart.w - 10}
                    y1={chart.ys(score)}
                    y2={chart.ys(score)}
                    stroke="#1E2228"
                    strokeWidth={1}
                  />
                  <text
                    x={0}
                    y={chart.ys(score) + 3}
                    fontSize={9}
                    fill="#64748B"
                  >
                    {score}
                  </text>
                </g>
              ))}
              <polyline
                points={chart.points}
                fill="none"
                stroke="#5DD62C"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {timeline.map((p, i) => (
                <circle
                  key={p.day}
                  cx={chart.xs(i)}
                  cy={chart.ys(p.avg)}
                  r={3}
                  fill="#5DD62C"
                >
                  <title>{`${p.day}: ${p.avg.toFixed(1)}`}</title>
                </circle>
              ))}
            </svg>
            <div className="mt-1 flex justify-between text-[10px] text-txt-dim">
              <span>{timeline[0]?.day}</span>
              <span>{timeline[timeline.length - 1]?.day}</span>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-xs text-txt-dim">{t("Sem dados no período.")}</p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Média por agente */}
        <Card>
          <CardTitle>{t("Nota média por agente")}</CardTitle>
          {byAgent.length === 0 ? (
            <p className="mt-3 text-xs text-txt-dim">{t("Sem dados no período.")}</p>
          ) : (
            <table className="mt-3 w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-txt-dim">
                  <th className="pb-2 font-medium">{t("Agente")}</th>
                  <th className="pb-2 text-right font-medium">{t("Nota média")}</th>
                  <th className="pb-2 text-right font-medium">{t("Respostas")}</th>
                </tr>
              </thead>
              <tbody>
                {byAgent.map((row) => (
                  <tr key={row.agentId} className="border-t border-line">
                    <td className="py-2">{row.name}</td>
                    <td className="py-2 text-right">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-txt">
                        {row.avg.toFixed(1)}
                        <StarRating score={row.avg} />
                      </span>
                    </td>
                    <td className="py-2 text-right text-txt-mut">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* Últimas avaliações */}
        <Card>
          <CardTitle>{t("Últimas 10 avaliações")}</CardTitle>
          {last10.length === 0 ? (
            <p className="mt-3 text-xs text-txt-dim">{t("Sem dados no período.")}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {last10.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between rounded-lg bg-ink px-3 py-2 text-xs"
                >
                  <span className="truncate">
                    {r.contact_id ? (contactNames[r.contact_id] ?? "—") : "—"}
                  </span>
                  <span className="ml-3 flex shrink-0 items-center gap-2">
                    <StarRating score={r.score} />
                    <span className="text-[10px] text-txt-dim">{timeAgo(r.created_at)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
