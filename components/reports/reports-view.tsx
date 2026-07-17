"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BarChart3, Bot, Clock3, Download, Star, User, Workflow } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { cn, formatCompact, formatPhone } from "@/lib/utils";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CsatReport } from "./csat-report";
import type { SenderType } from "@/types/database";

/** Preço do claude-haiku-4-5 (US$/MTok). */
const PRICE_IN = 1;
const PRICE_OUT = 5;

type Period = 7 | 30 | 90;

interface MsgLite {
  created_at: string;
  direction: "inbound" | "outbound";
  sender_type: SenderType;
  conversation_id: string;
}

type ReportTab = "overview" | "csat";

export function ReportsView({ orgId }: { orgId: string }) {
  const t = useT();
  const [period, setPeriod] = useState<Period>(30);
  const [tab, setTab] = useState<ReportTab>("overview");
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<MsgLite[]>([]);
  const [csatAverage, setCsatAverage] = useState<number | null>(null);
  const [convConn, setConvConn] = useState<Record<string, string | null>>({});
  const [convContact, setConvContact] = useState<Record<string, string>>({});
  const [contactNames, setContactNames] = useState<Record<string, string>>({});
  const [connLabels, setConnLabels] = useState<Record<string, string>>({});
  const [tokens, setTokens] = useState({ input: 0, output: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const since = new Date(Date.now() - period * 86400_000).toISOString();

      const [msgRes, convRes, contactRes, connRes, aiRes, csatRes] = await Promise.all([
        supabase
          .from("messages")
          .select("created_at, direction, sender_type, conversation_id")
          .gte("created_at", since)
          .order("created_at", { ascending: true })
          .limit(10000),
        supabase
          .from("conversations")
          .select("id, connection_id, contact_id")
          .eq("org_id", orgId),
        supabase.from("contacts").select("id, name, phone").eq("org_id", orgId),
        supabase
          .from("whatsapp_connections")
          .select("id, label, phone_display")
          .eq("org_id", orgId),
        supabase
          .from("audit_logs")
          .select("metadata")
          .eq("org_id", orgId)
          .in("action", ["ai.reply", "ai.simulate"])
          .gte("created_at", since)
          .limit(5000),
        supabase
          .from("csat_responses")
          .select("score")
          .eq("org_id", orgId)
          .gte("created_at", since)
          .limit(5000),
      ]);

      if (msgRes.error) {
        toast.error(t("Não foi possível carregar os relatórios."));
        return;
      }
      setMessages((msgRes.data ?? []) as MsgLite[]);

      const cc: Record<string, string | null> = {};
      const ct: Record<string, string> = {};
      for (const c of convRes.data ?? []) {
        cc[c.id] = c.connection_id;
        ct[c.id] = c.contact_id;
      }
      setConvConn(cc);
      setConvContact(ct);

      const names: Record<string, string> = {};
      for (const c of contactRes.data ?? []) {
        names[c.id] = c.name || formatPhone(c.phone);
      }
      setContactNames(names);

      const labels: Record<string, string> = {};
      for (const c of connRes.data ?? []) {
        labels[c.id] = c.phone_display ? `${c.label} (${c.phone_display})` : c.label;
      }
      setConnLabels(labels);

      let input = 0;
      let output = 0;
      for (const log of aiRes.data ?? []) {
        const meta = log.metadata as { input_tokens?: number; output_tokens?: number };
        input += meta.input_tokens ?? 0;
        output += meta.output_tokens ?? 0;
      }
      setTokens({ input, output });

      const scores = csatRes.data ?? [];
      setCsatAverage(
        scores.length > 0
          ? scores.reduce((sum, r) => sum + r.score, 0) / scores.length
          : null
      );
    } catch {
      toast.error(t("Erro de conexão ao carregar os relatórios."));
    } finally {
      setLoading(false);
    }
  }, [orgId, period, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // ------------------------------------------------------------- agregações
  const daily = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = period - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400_000);
      map.set(d.toISOString().slice(0, 10), 0);
    }
    for (const m of messages) {
      const key = m.created_at.slice(0, 10);
      if (map.has(key)) map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()];
  }, [messages, period]);
  const maxDaily = Math.max(...daily.map(([, v]) => v), 1);

  const outbound = useMemo(
    () => messages.filter((m) => m.direction === "outbound"),
    [messages]
  );
  const botCount = outbound.filter((m) => m.sender_type === "ai_bot").length;
  const humanCount = outbound.filter((m) => m.sender_type === "human").length;
  const externalCount = outbound.filter((m) => m.sender_type === "external").length;
  const outTotal = Math.max(botCount + humanCount + externalCount, 1);

  // Tempo médio de resposta: 1ª resposta após cada mensagem do cliente
  const responseTimes = useMemo(() => {
    const byConv = new Map<string, MsgLite[]>();
    for (const m of messages) {
      const arr = byConv.get(m.conversation_id) ?? [];
      arr.push(m);
      byConv.set(m.conversation_id, arr);
    }
    let botSum = 0;
    let botN = 0;
    let humanSum = 0;
    let humanN = 0;
    for (const arr of byConv.values()) {
      for (let i = 0; i < arr.length - 1; i++) {
        if (arr[i].direction !== "inbound") continue;
        const next = arr
          .slice(i + 1)
          .find((m) => m.direction === "outbound");
        if (!next) continue;
        const delta =
          (new Date(next.created_at).getTime() -
            new Date(arr[i].created_at).getTime()) /
          60000;
        if (delta < 0 || delta > 24 * 60) continue;
        if (next.sender_type === "ai_bot") {
          botSum += delta;
          botN++;
        } else if (next.sender_type === "human") {
          humanSum += delta;
          humanN++;
        }
      }
    }
    return {
      bot: botN > 0 ? botSum / botN : null,
      human: humanN > 0 ? humanSum / humanN : null,
    };
  }, [messages]);

  const topContacts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of messages) {
      const contactId = convContact[m.conversation_id];
      if (!contactId) continue;
      counts.set(contactId, (counts.get(contactId) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [messages, convContact]);
  const maxTop = Math.max(...topContacts.map(([, v]) => v), 1);

  const byConnection = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of messages) {
      const connId = convConn[m.conversation_id];
      if (!connId) continue;
      counts.set(connId, (counts.get(connId) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [messages, convConn]);

  const costUsd =
    (tokens.input / 1_000_000) * PRICE_IN + (tokens.output / 1_000_000) * PRICE_OUT;

  function fmtMinutes(min: number | null): string {
    if (min === null) return "—";
    if (min < 1) return `${Math.round(min * 60)}s`;
    if (min < 60) return `${min.toFixed(1)} min`;
    return `${(min / 60).toFixed(1)} h`;
  }

  function exportCsv() {
    const rows = [
      ["data", "mensagens"].join(";"),
      ...daily.map(([d, v]) => `${d};${v}`),
    ];
    const blob = new Blob(["﻿" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio_${period}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const donutStyle = {
    background: `conic-gradient(#5DD62C 0 ${(botCount / outTotal) * 360}deg, #F8F8F8 ${(botCount / outTotal) * 360}deg ${((botCount + humanCount) / outTotal) * 360}deg, #F59E0B ${((botCount + humanCount) / outTotal) * 360}deg 360deg)`,
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-lg font-semibold">{t("Relatórios")}</h1>
            <p className="mt-0.5 text-sm text-txt-mut">
              {formatCompact(messages.length)} {t("mensagens no período")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 rounded-lg border border-line bg-surface p-0.5">
              {([7, 30, 90] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={cn(
                    "focus-ring rounded-md px-2.5 py-1 text-xs font-semibold",
                    period === p ? "bg-txt text-ink" : "text-txt-dim hover:text-txt"
                  )}
                >
                  {p}d
                </button>
              ))}
            </div>
            <Button size="sm" variant="secondary" onClick={exportCsv}>
              <Download className="h-4 w-4" aria-hidden />
              CSV
            </Button>
          </div>
        </header>

        {/* Abas: visão geral / satisfação (CSAT) */}
        <nav className="flex gap-1">
          {(
            [
              { value: "overview", label: "Visão geral", icon: BarChart3 },
              { value: "csat", label: "Satisfação", icon: Star },
            ] as { value: ReportTab; label: string; icon: typeof Star }[]
          ).map((item) => (
            <button
              key={item.value}
              onClick={() => setTab(item.value)}
              className={cn(
                "focus-ring flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                tab === item.value
                  ? "bg-surface-raised text-txt"
                  : "text-txt-dim hover:bg-surface-raised hover:text-txt"
              )}
            >
              <item.icon className="h-3.5 w-3.5" aria-hidden />
              {t(item.label)}
            </button>
          ))}
        </nav>

        {tab === "csat" ? (
          <CsatReport orgId={orgId} periodDays={period} />
        ) : loading ? (
          <div className="space-y-3">
            <Skeleton className="h-44 w-full" />
            <Skeleton className="h-44 w-full" />
          </div>
        ) : (
          <>
            {/* Volume por dia */}
            <Card>
              <CardTitle>{t("Volume de mensagens por dia")}</CardTitle>
              <div className="mt-4 flex h-36 items-end gap-px">
                {daily.map(([day, count]) => (
                  <div
                    key={day}
                    title={`${day}: ${count}`}
                    className="group relative flex-1"
                  >
                    <div
                      className="w-full rounded-t bg-txt-mut/70 transition-colors group-hover:bg-txt-mut"
                      style={{ height: `${Math.max((count / maxDaily) * 130, count > 0 ? 4 : 1)}px` }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-txt-dim">
                <span>{daily[0]?.[0]}</span>
                <span>{daily[daily.length - 1]?.[0]}</span>
              </div>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Bot vs humano */}
              <Card>
                <CardTitle>{t("Quem respondeu (bot vs humano)")}</CardTitle>
                <div className="mt-4 flex items-center gap-5">
                  <div
                    className="relative h-28 w-28 shrink-0 rounded-full"
                    style={donutStyle}
                    role="img"
                    aria-label={t("Distribuição de respostas")}
                  >
                    <div className="absolute inset-3 flex items-center justify-center rounded-full bg-surface text-center">
                      <span className="text-xs text-txt-mut">
                        {formatCompact(botCount + humanCount + externalCount)}
                        <br />
                        {t("respostas")}
                      </span>
                    </div>
                  </div>
                  <ul className="space-y-2 text-xs">
                    <li className="flex items-center gap-2">
                      <Bot className="h-3.5 w-3.5 text-txt-mut" aria-hidden />
                      {t("Bot IA")}: <strong>{botCount}</strong> (
                      {Math.round((botCount / outTotal) * 100)}%)
                    </li>
                    <li className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-txt" aria-hidden />
                      {t("Equipe")}: <strong>{humanCount}</strong> (
                      {Math.round((humanCount / outTotal) * 100)}%)
                    </li>
                    <li className="flex items-center gap-2">
                      <Workflow className="h-3.5 w-3.5 text-amber" aria-hidden />
                      n8n: <strong>{externalCount}</strong> (
                      {Math.round((externalCount / outTotal) * 100)}%)
                    </li>
                  </ul>
                </div>
              </Card>

              {/* Tempo de resposta + custo */}
              <Card>
                <CardTitle>{t("Tempo médio de resposta")}</CardTitle>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-surface-raised p-3 text-center">
                    <Bot className="mx-auto h-4 w-4 text-txt-mut" aria-hidden />
                    <p className="mt-1 font-display text-lg font-semibold text-txt">
                      {fmtMinutes(responseTimes.bot)}
                    </p>
                    <p className="text-[11px] text-txt-mut">{t("Bot IA")}</p>
                  </div>
                  <div className="rounded-lg bg-surface-raised p-3 text-center">
                    <Clock3 className="mx-auto h-4 w-4 text-txt-mut" aria-hidden />
                    <p className="mt-1 font-display text-lg font-semibold">
                      {fmtMinutes(responseTimes.human)}
                    </p>
                    <p className="text-[11px] text-txt-mut">{t("Equipe")}</p>
                  </div>
                </div>
                <p className="mt-4 flex items-center justify-between rounded-lg border border-line bg-ink px-3 py-2 text-xs">
                  <span className="text-txt-mut">{t("Custo estimado de IA no período")}</span>
                  <span className="font-semibold text-txt">US$ {costUsd.toFixed(2)}</span>
                </p>
                <button
                  onClick={() => setTab("csat")}
                  className="focus-ring mt-2 flex w-full items-center justify-between rounded-lg border border-line bg-ink px-3 py-2 text-xs hover:border-line-strong"
                >
                  <span className="text-txt-mut">CSAT ({t("satisfação média")})</span>
                  <span className="font-semibold text-txt">
                    {csatAverage !== null ? `${csatAverage.toFixed(1)} ⭐` : t("sem avaliações")}
                  </span>
                </button>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Top contatos */}
              <Card>
                <CardTitle>{t("Top 10 contatos mais ativos")}</CardTitle>
                {topContacts.length === 0 ? (
                  <p className="mt-3 text-xs text-txt-dim">{t("Sem dados no período.")}</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {topContacts.map(([contactId, count]) => (
                      <li key={contactId} className="text-xs">
                        <div className="flex justify-between">
                          <span className="truncate">{contactNames[contactId] ?? "—"}</span>
                          <span className="font-medium">{count}</span>
                        </div>
                        <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-surface-raised">
                          <div
                            className="h-full rounded-full bg-txt-mut/70"
                            style={{ width: `${(count / maxTop) * 100}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {/* Por conexão */}
              <Card>
                <CardTitle>{t("Mensagens por conexão")}</CardTitle>
                {byConnection.length === 0 ? (
                  <p className="mt-3 text-xs text-txt-dim">{t("Sem dados no período.")}</p>
                ) : (
                  <ul className="mt-3 space-y-2 text-xs">
                    {byConnection.map(([connId, count]) => (
                      <li
                        key={connId}
                        className="flex items-center justify-between rounded-lg bg-ink px-3 py-2"
                      >
                        <span className="flex items-center gap-2 truncate">
                          <BarChart3 className="h-3.5 w-3.5 text-txt-dim" aria-hidden />
                          {connLabels[connId] ?? t("Conexão removida")}
                        </span>
                        <span className="font-medium">{formatCompact(count)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
