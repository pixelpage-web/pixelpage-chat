"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Headphones, Send, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn, timeAgo } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Textarea, Label } from "@/components/ui/input";
import type {
  SupportTicketMessageRow,
  SupportTicketRow,
  SupportTicketStatus,
} from "@/types/database";

type Filter = "all" | SupportTicketStatus;

const filters: { value: Filter; label: string }[] = [
  { value: "open", label: "Abertos" },
  { value: "answered", label: "Respondidos" },
  { value: "closed", label: "Fechados" },
  { value: "all", label: "Todos" },
];

const statusMeta: Record<SupportTicketStatus, { label: string; tone: "lime" | "amber" | "ok" }> = {
  open: { label: "Aberto", tone: "lime" },
  answered: { label: "Respondido", tone: "amber" },
  closed: { label: "Fechado", tone: "ok" },
};

export function SupportManager({
  initialTickets,
  messagesByTicket,
  orgNames,
}: {
  initialTickets: SupportTicketRow[];
  messagesByTicket: Record<string, SupportTicketMessageRow[]>;
  orgNames: Record<string, string>;
}) {
  const [tickets, setTickets] = useState(initialTickets);
  const [threads, setThreads] = useState(messagesByTicket);
  const [filter, setFilter] = useState<Filter>("open");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);

  // Estado do modal de exclusão
  const [deleteTarget, setDeleteTarget] = useState<SupportTicketRow | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(
    () => (filter === "all" ? tickets : tickets.filter((ti) => ti.status === filter)),
    [tickets, filter]
  );
  const openCount = tickets.filter((ti) => ti.status === "open").length;

  async function reply(ticketId: string) {
    const text = (drafts[ticketId] ?? "").trim();
    if (!text) return;
    setSending(ticketId);
    try {
      const res = await fetch("/api/admin/support/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_id: ticketId, body: text }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        toast.error(json?.error ?? "Falha ao enviar.");
        return;
      }
      // Atualiza thread + status localmente
      setThreads((prev) => ({
        ...prev,
        [ticketId]: [
          ...(prev[ticketId] ?? []),
          {
            id: crypto.randomUUID(),
            ticket_id: ticketId,
            author_id: null,
            from_admin: true,
            body: text,
            created_at: new Date().toISOString(),
          },
        ],
      }));
      setTickets((prev) =>
        prev.map((ti) => (ti.id === ticketId ? { ...ti, status: "answered" } : ti))
      );
      setDrafts((prev) => ({ ...prev, [ticketId]: "" }));
      toast.success("Resposta enviada.");
    } catch {
      toast.error("Erro de conexão.");
    } finally {
      setSending(null);
    }
  }

  async function setStatus(ticketId: string, status: SupportTicketStatus) {
    const previous = tickets;
    setTickets((prev) => prev.map((ti) => (ti.id === ticketId ? { ...ti, status } : ti)));
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("support_tickets")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", ticketId);
      if (error) {
        setTickets(previous);
        toast.error("Não foi possível atualizar o status.");
      }
    } catch {
      setTickets(previous);
      toast.error("Erro de conexão.");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || !deleteReason.trim()) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/admin/support/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_id: deleteTarget.id, reason: deleteReason.trim() }),
      });
      if (!res.ok) {
        toast.error("Não foi possível excluir o ticket.");
        return;
      }
      setTickets((prev) => prev.filter((t) => t.id !== deleteTarget.id));
      toast.success("Ticket excluído (soft-delete).");
      setDeleteTarget(null);
      setDeleteReason("");
    } catch {
      toast.error("Erro de conexão.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <header>
        <h1 className="font-display text-lg font-semibold">Suporte & Tickets</h1>
        <p className="mt-0.5 text-sm text-txt-mut">
          Mensagens enviadas pelos clientes pelo botão de suporte —{" "}
          {openCount > 0 ? (
            <span className="font-medium text-lime">{openCount} aberto(s)</span>
          ) : (
            "nenhum aberto"
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
          icon={Headphones}
          title="Nenhum ticket aqui"
          description="Quando um cliente enviar uma mensagem pelo botão de suporte (ícone “?”), o chamado aparece nesta lista para você responder."
        />
      ) : (
        <ul className="space-y-3">
          {filtered.map((ti) => {
            const meta = statusMeta[ti.status];
            const thread = threads[ti.id] ?? [];
            return (
              <li key={ti.id} className="rounded-card border border-line bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      <span className="font-semibold text-txt">{ti.subject || "Sem assunto"}</span>
                      <span className="text-xs text-txt-dim">· {timeAgo(ti.created_at)}</span>
                    </div>
                    <p className="mt-1 text-xs text-txt-mut">
                      {ti.author_name} · {ti.author_email}
                      {ti.org_id && orgNames[ti.org_id] ? ` · ${orgNames[ti.org_id]}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {ti.status !== "closed" ? (
                      <button
                        onClick={() => void setStatus(ti.id, "closed")}
                        className="focus-ring shrink-0 rounded-md px-2 py-1 text-xs text-txt-dim hover:bg-surface-raised hover:text-txt"
                      >
                        Fechar
                      </button>
                    ) : (
                      <button
                        onClick={() => void setStatus(ti.id, "open")}
                        className="focus-ring shrink-0 rounded-md px-2 py-1 text-xs text-txt-dim hover:bg-surface-raised hover:text-txt"
                      >
                        Reabrir
                      </button>
                    )}
                    <button
                      onClick={() => { setDeleteTarget(ti); setDeleteReason(""); }}
                      className="focus-ring shrink-0 rounded-md px-2 py-1 text-xs text-danger/70 hover:bg-danger-soft hover:text-danger"
                      title="Excluir ticket"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Mensagem original + thread */}
                <div className="mt-3 space-y-2">
                  <div className="rounded-lg bg-ink px-3 py-2 text-sm leading-relaxed text-txt">
                    {ti.message}
                  </div>
                  {thread.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        "rounded-lg px-3 py-2 text-sm leading-relaxed",
                        m.from_admin
                          ? "ml-6 border border-lime/25 bg-lime-soft text-txt"
                          : "mr-6 bg-ink text-txt"
                      )}
                    >
                      <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-txt-dim">
                        {m.from_admin ? "Equipe" : ti.author_name} · {timeAgo(m.created_at)}
                      </p>
                      {m.body}
                    </div>
                  ))}
                </div>

                {/* Responder */}
                {ti.status !== "closed" && (
                  <div className="mt-3">
                    <Textarea
                      value={drafts[ti.id] ?? ""}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [ti.id]: e.target.value }))}
                      placeholder="Escreva uma resposta…"
                      className="min-h-[60px] text-sm"
                    />
                    <Button
                      size="sm"
                      className="mt-2"
                      loading={sending === ti.id}
                      onClick={() => void reply(ti.id)}
                    >
                      <Send className="h-3.5 w-3.5" aria-hidden />
                      Responder
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {/* Modal de confirmação de exclusão */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl">
            <button
              onClick={() => setDeleteTarget(null)}
              className="absolute right-4 top-4 rounded-md p-1 text-txt-dim hover:text-txt"
            >
              <X className="h-4 w-4" />
            </button>

            <h2 className="font-display text-base font-semibold text-danger">
              Excluir ticket de suporte
            </h2>
            <p className="mt-1 text-xs text-txt-dim">
              Soft-delete — o ticket não será apagado do banco, apenas ocultado.
              A ação é registrada no audit log.
            </p>

            {/* Preview do conteúdo */}
            <div className="mt-4 rounded-lg border border-danger/20 bg-danger-soft p-3">
              <p className="text-xs font-semibold text-txt">{deleteTarget.subject || "Sem assunto"}</p>
              <p className="mt-1 text-[11px] text-txt-mut">
                {deleteTarget.author_name} · {deleteTarget.author_email}
              </p>
              <p className="mt-2 line-clamp-3 text-xs text-txt-mut">{deleteTarget.message}</p>
            </div>

            {/* Motivo obrigatório */}
            <div className="mt-4">
              <Label htmlFor="delete-reason">Motivo da exclusão (obrigatório)</Label>
              <Textarea
                id="delete-reason"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Ex.: spam, conteúdo impróprio, duplicado…"
                className="mt-1 min-h-[60px] text-sm"
              />
            </div>

            <div className="mt-4 flex gap-2">
              <Button
                variant="danger"
                size="sm"
                className="flex-1"
                loading={deleting}
                disabled={!deleteReason.trim()}
                onClick={() => void confirmDelete()}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Confirmar exclusão
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
