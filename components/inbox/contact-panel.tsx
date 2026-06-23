"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Ban, Download, Phone, Plus, Sparkles, Tag, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn, formatFullDate, formatPhone, timeAgo } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ContactRow, ConversationRow, TeamMember } from "./types";

/** Histórico de CSAT do contato (média e nº de avaliações). */
export interface ContactCsatStats {
  average: number;
  count: number;
}

export function ContactPanel({
  contact,
  conversation,
  team,
  conversationCount,
  csatStats,
  onUpdateContact,
  onToggleBlock,
  onExportHistory,
}: {
  contact: ContactRow;
  conversation: ConversationRow;
  team: TeamMember[];
  conversationCount: number;
  csatStats: ContactCsatStats | null;
  onUpdateContact: (patch: Partial<ContactRow>) => void;
  onToggleBlock: () => void;
  onExportHistory: () => void;
}) {
  const t = useT();
  const [notes, setNotes] = useState(contact.notes);
  const [newTag, setNewTag] = useState("");
  const [generatingNote, setGeneratingNote] = useState(false);

  /** "✨ Gerar nota com IA": preenche o campo — o usuário edita antes de salvar. */
  async function handleGenerateNote() {
    setGeneratingNote(true);
    try {
      const res = await fetch("/api/inbox/ai-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversation.id }),
      });
      const json = (await res.json()) as { note?: string; error?: string };
      if (!res.ok || !json.note) {
        toast.error(json.error ?? t("Não foi possível gerar a nota."));
        return;
      }
      setNotes(json.note);
      toast.success(t("Nota gerada! Revise e clique em salvar."));
    } catch {
      toast.error(t("Erro de conexão ao gerar a nota."));
    } finally {
      setGeneratingNote(false);
    }
  }

  // Sincroniza ao trocar de contato
  useEffect(() => {
    setNotes(contact.notes);
    setNewTag("");
  }, [contact.id, contact.notes]);

  function addTag() {
    const tag = newTag.trim().toLowerCase();
    if (!tag || contact.tags.includes(tag)) {
      setNewTag("");
      return;
    }
    onUpdateContact({ tags: [...contact.tags, tag] });
    setNewTag("");
  }

  function removeTag(tag: string) {
    onUpdateContact({ tags: contact.tags.filter((t) => t !== tag) });
  }

  const assignedName = conversation.assigned_to
    ? (team.find((m) => m.id === conversation.assigned_to)?.name ?? "—")
    : t("Ninguém");

  return (
    <div className="flex h-full flex-col overflow-y-auto p-5">
      {/* Identidade */}
      <div className="flex flex-col items-center text-center">
        <Avatar name={contact.name ?? contact.phone} size="lg" />
        <p className="mt-3 font-display text-base font-semibold">
          {contact.name || t("Sem nome")}
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-txt-mut">
          <Phone className="h-3 w-3" aria-hidden />
          {formatPhone(contact.phone)}
        </p>
      </div>

      {/* Meta da conversa */}
      <dl className="mt-6 space-y-2 rounded-lg border border-line bg-ink p-3 text-xs">
        <div className="flex justify-between">
          <dt className="text-txt-dim">{t("Status")}</dt>
          <dd>
            <Badge tone={conversation.status === "open" ? "lime" : "neutral"}>
              {conversation.status === "open" ? t("Aberta") : t("Resolvida")}
            </Badge>
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-txt-dim">Bot</dt>
          <dd>
            <Badge tone={conversation.bot_paused ? "amber" : "ok"}>
              {conversation.bot_paused ? t("Pausado") : t("Ativo")}
            </Badge>
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-txt-dim">{t("Atribuída a")}</dt>
          <dd className="font-medium text-txt">{assignedName}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-txt-dim">{t("Cliente desde")}</dt>
          <dd className="text-txt-mut">{formatFullDate(contact.created_at)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-txt-dim">{t("Conversas")}</dt>
          <dd className="font-medium text-txt">{conversationCount}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-txt-dim">{t("Última interação")}</dt>
          <dd className="text-txt-mut">{timeAgo(conversation.last_message_at)}</dd>
        </div>
        {csatStats && csatStats.count > 0 && (
          <div className="flex justify-between">
            <dt className="text-txt-dim">{t("Satisfação (CSAT)")}</dt>
            <dd className="font-medium text-lime">
              {csatStats.average.toFixed(1)} ⭐{" "}
              <span className="font-normal text-txt-dim">
                ({csatStats.count}{" "}
                {csatStats.count === 1 ? t("avaliação") : t("avaliações")})
              </span>
            </dd>
          </div>
        )}
      </dl>

      {/* Ações do contato */}
      <div className="mt-4 flex gap-2">
        <Button
          size="sm"
          variant={contact.blocked ? "primary" : "outline"}
          className="flex-1"
          onClick={onToggleBlock}
        >
          <Ban className="h-3.5 w-3.5" aria-hidden />
          {contact.blocked ? t("Desbloquear") : t("Bloquear")}
        </Button>
        <Button size="sm" variant="outline" className="flex-1" onClick={onExportHistory}>
          <Download className="h-3.5 w-3.5" aria-hidden />
          {t("Exportar")}
        </Button>
      </div>
      {contact.blocked && (
        <p className="mt-2 rounded-md bg-danger-soft px-2.5 py-1.5 text-[11px] text-danger">
          {t("Contato bloqueado — novas mensagens dele são ignoradas.")}
        </p>
      )}

      {/* Etiquetas */}
      <section className="mt-6">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-txt-dim">
          <Tag className="h-3 w-3" aria-hidden />
          {t("Etiquetas")}
        </h3>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {contact.tags.length === 0 && (
            <p className="text-xs text-txt-dim">{t("Nenhuma etiqueta.")}</p>
          )}
          {contact.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-raised px-2 py-0.5 text-[11px]"
            >
              {tag}
              <button
                onClick={() => removeTag(tag)}
                className="focus-ring rounded-full text-txt-dim hover:text-danger"
                aria-label={`${t("Remover etiqueta")} ${tag}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-2 flex gap-1.5">
          <input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder={t("Nova etiqueta")}
            className="focus-ring h-8 min-w-0 flex-1 rounded-md border border-line bg-ink px-2.5 text-xs placeholder:text-txt-dim"
          />
          <button
            onClick={addTag}
            className={cn(
              "focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line text-txt-mut",
              "hover:border-lime/40 hover:text-lime"
            )}
            aria-label={t("Adicionar etiqueta")}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </section>

      {/* Notas */}
      <section className="mt-6 flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-txt-dim">
            {t("Notas internas")}
          </h3>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px] text-lime hover:bg-lime-soft"
            loading={generatingNote}
            onClick={() => void handleGenerateNote()}
            title={t("A IA resume a conversa numa nota — você edita antes de salvar.")}
          >
            <Sparkles className="h-3 w-3" aria-hidden />
            {t("Gerar nota com IA")}
          </Button>
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t("Anotações sobre este contato (só sua equipe vê)…")}
          className="focus-ring mt-2 min-h-[96px] flex-1 resize-none rounded-lg border border-line bg-ink px-3 py-2.5 text-xs leading-relaxed placeholder:text-txt-dim"
        />
        {notes !== contact.notes && (
          <Button
            size="sm"
            className="mt-2"
            onClick={() => onUpdateContact({ notes })}
          >
            {t("Salvar notas")}
          </Button>
        )}
      </section>
    </div>
  );
}
