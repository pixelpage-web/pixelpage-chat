"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

interface AgentStats {
  id: string;
  name: string;
  assigned: number;
  resolved: number;
  open: number;
}

export function AgentsReport({ orgId }: { orgId: string }) {
  const t = useT();
  const supabase = useMemo(() => createClient(), []);
  const [agents, setAgents] = useState<AgentStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: team } = await supabase
        .from("profiles")
        .select("id, name")
        .eq("org_id", orgId);
      if (!team) { setLoading(false); return; }

      const { data: conversations } = await supabase
        .from("conversations")
        .select("assigned_to, status")
        .eq("org_id", orgId)
        .not("assigned_to", "is", null);

      const stats: AgentStats[] = team.map((agent) => {
        const agentConvs = (conversations ?? []).filter((c) => c.assigned_to === agent.id);
        return {
          id: agent.id,
          name: agent.name || "Sem nome",
          assigned: agentConvs.length,
          resolved: agentConvs.filter((c) => c.status === "resolved").length,
          open: agentConvs.filter((c) => c.status === "open").length,
        };
      }).sort((a, b) => b.assigned - a.assigned);

      setAgents(stats);
      setLoading(false);
    }
    void load();
  }, [orgId, supabase]);

  function exportCsv() {
    const rows = [
      ["Agente", "Atribuídas", "Abertas", "Resolvidas"].join(";"),
      ...agents.map((a) => [a.name, a.assigned, a.open, a.resolved].join(";")),
    ];
    const blob = new Blob(["﻿" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "relatorio_agentes.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("Relatório por Agentes")}</h2>
        <Button size="sm" variant="secondary" onClick={exportCsv}>
          <Download className="h-4 w-4" />
          {t("Exportar CSV")}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-surface" />)}</div>
      ) : agents.length === 0 ? (
        <p className="text-sm text-txt-dim">{t("Nenhum agente com conversas atribuídas.")}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-surface text-xs text-txt-dim">
              <tr>
                <th className="px-4 py-3 text-left">{t("Agente")}</th>
                <th className="px-4 py-3 text-right">{t("Total")}</th>
                <th className="px-4 py-3 text-right">{t("Abertas")}</th>
                <th className="px-4 py-3 text-right">{t("Resolvidas")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {agents.map((agent) => (
                <tr key={agent.id} className="hover:bg-surface/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={agent.name} size="sm" />
                      <span className="font-medium">{agent.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-txt-dim">{agent.assigned}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono text-lime">{agent.open}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono text-ok">{agent.resolved}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
