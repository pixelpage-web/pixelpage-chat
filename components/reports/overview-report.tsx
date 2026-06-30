"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { MessageSquare, Users, Clock, TrendingUp } from "lucide-react";

interface OverviewStats {
  openConversations: number;
  resolvedToday: number;
  agentsOnline: number;
  avgResponseMin: number | null;
}

export function OverviewReport({ orgId }: { orgId: string }) {
  const t = useT();
  const supabase = useMemo(() => createClient(), []);
  const [stats, setStats] = useState<OverviewStats>({
    openConversations: 0,
    resolvedToday: 0,
    agentsOnline: 0,
    avgResponseMin: null,
  });
  const [loading, setLoading] = useState(true);

  async function load() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [openRes, resolvedRes, teamRes] = await Promise.all([
      supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("status", "open"),
      supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("status", "resolved")
        .gte("last_message_at", todayStart.toISOString()),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId),
    ]);

    setStats({
      openConversations: openRes.count ?? 0,
      resolvedToday: resolvedRes.count ?? 0,
      agentsOnline: teamRes.count ?? 0,
      avgResponseMin: null,
    });
    setLoading(false);
  }

  useEffect(() => {
    void load();

    // Atualizar a cada 30s
    const interval = setInterval(() => { void load(); }, 30_000);
    return () => clearInterval(interval);
  }, [orgId]); // eslint-disable-line

  const kpis = [
    { icon: MessageSquare, label: t("Conversas abertas"), value: stats.openConversations, color: "text-lime" },
    { icon: TrendingUp, label: t("Resolvidas hoje"), value: stats.resolvedToday, color: "text-ok" },
    { icon: Users, label: t("Agentes na equipe"), value: stats.agentsOnline, color: "text-info" },
    { icon: Clock, label: t("Tempo médio resposta"), value: stats.avgResponseMin != null ? `${stats.avgResponseMin}min` : "—", color: "text-amber" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t("Visão Geral")}</h2>
          <p className="text-sm text-txt-dim">{t("Atualiza a cada 30 segundos.")}</p>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-ok">
          <span className="h-2 w-2 animate-pulse rounded-full bg-ok" />
          {t("Ao vivo")}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-line bg-surface p-5">
            <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
            <p className="mt-3 text-2xl font-bold font-display">
              {loading ? "—" : kpi.value}
            </p>
            <p className="mt-1 text-xs text-txt-dim">{kpi.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
