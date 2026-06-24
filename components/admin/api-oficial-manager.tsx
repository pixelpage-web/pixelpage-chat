"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn, timeAgo } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { ApiOficialRequestRow, ApiOficialStatus } from "@/types/database";

type Filter = "all" | ApiOficialStatus;

const filters: { value: Filter; label: string }[] = [
  { value: "pending", label: "Pendentes" },
  { value: "contacted", label: "Contatados" },
  { value: "in_progress", label: "Em andamento" },
  { value: "completed", label: "Concluídos" },
  { value: "all", label: "Todos" },
];

const statusMeta: Record<
  ApiOficialStatus,
  { label: string; tone: "lime" | "amber" | "ok" | "danger" | "neutral" }
> = {
  pending: { label: "Pendente", tone: "lime" },
  contacted: { label: "Contatado", tone: "amber" },
  in_progress: { label: "Em andamento", tone: "amber" },
  completed: { label: "Concluído", tone: "ok" },
  rejected: { label: "Recusado", tone: "danger" },
};

export function ApiOficialManager({
  initialRequests,
  orgNames,
}: {
  initialRequests: ApiOficialRequestRow[];
  orgNames: Record<string, string>;
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [filter, setFilter] = useState<Filter>("pending");
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const filtered = useMemo(
    () => (filter === "all" ? requests : requests.filter((r) => r.status === filter)),
    [requests, filter]
  );
  const pendingCount = requests.filter((r) => r.status === "pending").length;

  async function patch(id: string, fields: Partial<ApiOficialRequestRow>) {
    const previous = requests;
    setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, ...fields } : r)));
    try {
      const supabase = createClient();
      const { error } = await supabase.from("api_oficial_requests").update(fields).eq("id", id);
      if (error) {
        setRequests(previous);
        toast.error("Não foi possível atualizar.");
      } else {
        toast.success("Pedido atualizado.");
      }
    } catch {
      setRequests(previous);
      toast.error("Erro de conexão.");
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <header>
        <h1 className="font-display text-lg font-semibold">Pedidos de API Oficial</h1>
        <p className="mt-0.5 text-sm text-txt-mut">
          Leads de número novo com API Oficial da Meta —{" "}
          {pendingCount > 0 ? (
            <span className="font-medium text-lime">{pendingCount} pendente(s)</span>
          ) : (
            "nenhum pendente"
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
                ? "bg-lime-soft text-lime"
                : "text-txt-dim hover:bg-surface-raised hover:text-txt"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Nenhum pedido aqui"
          description="Quando um cliente solicitar um número com API Oficial (em Conexões → API Oficial), o lead aparece nesta lista."
        />
      ) : (
        <ul className="space-y-3">
          {filtered.map((r) => {
            const meta = statusMeta[r.status];
            return (
              <li key={r.id} className="rounded-card border border-line bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      <span className="font-semibold text-txt">{r.company_name || "—"}</span>
                      <span className="text-xs text-txt-dim">· {timeAgo(r.created_at)}</span>
                    </div>
                    <p className="mt-1 text-xs text-txt-mut">
                      {r.org_id && orgNames[r.org_id] ? `${orgNames[r.org_id]} · ` : ""}
                      {r.contact_name} · {r.contact_whatsapp}
                      {r.contact_email ? ` · ${r.contact_email}` : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-txt-dim">
                      Documento: {r.document || "—"} · Número desejado:{" "}
                      {r.desired_phone || "qualquer disponível"}
                    </p>
                  </div>
                  <Select
                    value={r.status}
                    onChange={(e) => void patch(r.id, { status: e.target.value as ApiOficialStatus })}
                    className="h-8 w-36 shrink-0 text-xs"
                  >
                    <option value="pending">Pendente</option>
                    <option value="contacted">Contatado</option>
                    <option value="in_progress">Em andamento</option>
                    <option value="completed">Concluído</option>
                    <option value="rejected">Recusado</option>
                  </Select>
                </div>

                {/* Notas internas */}
                <div className="mt-3">
                  <Textarea
                    value={noteDrafts[r.id] ?? r.notes}
                    onChange={(e) =>
                      setNoteDrafts((prev) => ({ ...prev, [r.id]: e.target.value }))
                    }
                    placeholder="Notas internas (visíveis só para a equipe)…"
                    className="min-h-[60px] text-xs"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-2"
                    onClick={() => void patch(r.id, { notes: noteDrafts[r.id] ?? r.notes })}
                  >
                    Salvar nota
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
