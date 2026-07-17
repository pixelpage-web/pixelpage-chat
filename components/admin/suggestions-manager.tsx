"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Lightbulb, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn, timeAgo } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import type { SuggestionRow, SuggestionStatus } from "@/types/database";

type Filter = "all" | SuggestionStatus;

const filters: { value: Filter; label: string }[] = [
  { value: "new", label: "Novas" },
  { value: "reviewed", label: "Avaliadas" },
  { value: "done", label: "Concluídas" },
  { value: "all", label: "Todas" },
];

const statusMeta: Record<SuggestionStatus, { label: string; tone: "lime" | "amber" | "ok" }> = {
  new: { label: "Nova", tone: "lime" },
  reviewed: { label: "Avaliada", tone: "amber" },
  done: { label: "Concluída", tone: "ok" },
};

export function SuggestionsManager({
  initialSuggestions,
  orgNames,
}: {
  initialSuggestions: SuggestionRow[];
  orgNames: Record<string, string>;
}) {
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [filter, setFilter] = useState<Filter>("new");

  const filtered = useMemo(
    () =>
      filter === "all"
        ? suggestions
        : suggestions.filter((s) => s.status === filter),
    [suggestions, filter]
  );

  const newCount = suggestions.filter((s) => s.status === "new").length;

  async function changeStatus(id: string, status: SuggestionStatus) {
    const previous = suggestions;
    setSuggestions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status } : s))
    );
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("suggestions")
        .update({ status })
        .eq("id", id);
      if (error) {
        setSuggestions(previous);
        toast.error("Não foi possível atualizar o status.");
      }
    } catch {
      setSuggestions(previous);
      toast.error("Erro de conexão.");
    }
  }

  async function remove(id: string) {
    const previous = suggestions;
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
    try {
      const supabase = createClient();
      const { error } = await supabase.from("suggestions").delete().eq("id", id);
      if (error) {
        setSuggestions(previous);
        toast.error("Não foi possível excluir a sugestão.");
      }
    } catch {
      setSuggestions(previous);
      toast.error("Erro de conexão.");
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <header>
        <h1 className="font-display text-lg font-semibold">Sugestões dos clientes</h1>
        <p className="mt-0.5 text-sm text-txt-mut">
          Ideias de melhoria enviadas pelo painel —{" "}
          {newCount > 0 ? (
            <span className="font-medium text-txt">{newCount} nova(s)</span>
          ) : (
            "nenhuma nova"
          )}
          .
        </p>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "focus-ring rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              filter === f.value
                ? "bg-surface-raised text-txt"
                : "text-txt-dim hover:bg-surface-raised hover:text-txt"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title="Nenhuma sugestão aqui"
          description="As ideias enviadas pelos clientes (em Configurações ou na Documentação) aparecem nesta lista."
        />
      ) : (
        <ul className="space-y-3">
          {filtered.map((s) => {
            const meta = statusMeta[s.status];
            return (
              <li
                key={s.id}
                className="rounded-card border border-line bg-surface p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2 text-xs text-txt-mut">
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                    <span className="truncate font-medium text-txt">
                      {s.author_name || "Anônimo"}
                    </span>
                    {s.org_id && (
                      <span className="truncate">
                        · {orgNames[s.org_id] ?? s.org_id}
                      </span>
                    )}
                    <span className="shrink-0 text-txt-dim">
                      · {timeAgo(s.created_at)}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Select
                      value={s.status}
                      onChange={(e) =>
                        void changeStatus(s.id, e.target.value as SuggestionStatus)
                      }
                      className="h-8 w-32 text-xs"
                    >
                      <option value="new">Nova</option>
                      <option value="reviewed">Avaliada</option>
                      <option value="done">Concluída</option>
                    </Select>
                    <button
                      onClick={() => void remove(s.id)}
                      className="focus-ring rounded-md p-1.5 text-txt-dim hover:bg-danger-soft hover:text-danger"
                      aria-label="Excluir sugestão"
                      title="Excluir"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-txt">
                  {s.content}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
