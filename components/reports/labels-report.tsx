"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

interface LabelStats {
  id: string;
  title: string;
  color: string;
  count: number;
}

export function LabelsReport({ orgId }: { orgId: string }) {
  const t = useT();
  const supabase = useMemo(() => createClient(), []);
  const [stats, setStats] = useState<LabelStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: labels } = await supabase
        .from("labels")
        .select("id, title, color")
        .eq("org_id", orgId);
      if (!labels) { setLoading(false); return; }

      const { data: convLabels } = await supabase
        .from("conversation_labels")
        .select("label_id");

      const countMap: Record<string, number> = {};
      for (const cl of convLabels ?? []) {
        countMap[cl.label_id] = (countMap[cl.label_id] ?? 0) + 1;
      }

      setStats(
        labels
          .map((l) => ({ ...l, count: countMap[l.id] ?? 0 }))
          .sort((a, b) => b.count - a.count)
      );
      setLoading(false);
    }
    void load();
  }, [orgId, supabase]);

  const maxCount = Math.max(...stats.map((s) => s.count), 1);

  function exportCsv() {
    const rows = [
      ["Etiqueta", "Conversas"].join(";"),
      ...stats.map((s) => [s.title, s.count].join(";")),
    ];
    const blob = new Blob(["﻿" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "relatorio_etiquetas.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("Relatório por Etiquetas")}</h2>
        <Button size="sm" variant="secondary" onClick={exportCsv}>
          <Download className="h-4 w-4" />
          {t("Exportar CSV")}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-surface" />)}</div>
      ) : stats.length === 0 ? (
        <p className="text-sm text-txt-dim">{t("Nenhuma etiqueta criada ainda.")}</p>
      ) : (
        <div className="space-y-3">
          {stats.map((s) => (
            <div key={s.id} className="flex items-center gap-4 rounded-lg border border-line bg-surface p-4">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
              <p className="w-40 truncate text-sm font-medium">{s.title}</p>
              <div className="flex-1">
                <div className="h-2 overflow-hidden rounded-full bg-surface-hover">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${(s.count / maxCount) * 100}%`, backgroundColor: s.color }}
                  />
                </div>
              </div>
              <span className="w-10 text-right font-mono text-sm text-txt-dim">{s.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
