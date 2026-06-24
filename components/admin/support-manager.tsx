"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Headphones, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn, timeAgo } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
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
    </div>
  );
}
