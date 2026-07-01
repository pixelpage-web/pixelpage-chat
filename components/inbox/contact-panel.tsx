"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Ban, Check, Download, Pencil, Phone, Plus, Tag, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn, formatFullDate, formatPhone, timeAgo } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ContactNotes } from "./contact-notes";
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
  orgId,
  onUpdateContact,
  onToggleBlock,
  onExportHistory,
}: {
  contact: ContactRow;
  conversation: ConversationRow;
  team: TeamMember[];
  conversationCount: number;
  csatStats: ContactCsatStats | null;
  orgId: string;
  onUpdateContact: (patch: Partial<ContactRow>) => void;
  onToggleBlock: () => void;
  onExportHistory: () => void;
}) {
  const t = useT();
  const [newTag, setNewTag] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(contact.name ?? "");

  // Sincroniza ao trocar de contato
  useEffect(() => {
    setNewTag("");
    setEditingName(false);
    setNameInput(contact.name ?? "");
  }, [contact.id, contact.name]);

  function saveName() {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === contact.name) {
      setEditingName(false);
      return;
    }
    onUpdateContact({ name: trimmed, name_manually_set: true });
    setEditingName(false);
  }

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
        {editingName ? (
          <div className="mt-3 flex items-center gap-1">
            <input
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName();
                if (e.key === "Escape") setEditingName(false);
              }}
              className="rounded border border-lime bg-ink px-2 py-0.5 text-sm font-semibold focus:outline-none"
              placeholder={t("Nome do contato")}
            />
            <button
              onClick={saveName}
              className="focus-ring rounded p-0.5 text-lime hover:opacity-80"
              aria-label={t("Salvar nome")}
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setEditingName(false)}
              className="focus-ring rounded p-0.5 text-txt-dim hover:text-txt"
              aria-label={t("Cancelar")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-1">
            <p className="font-display text-base font-semibold">
              {contact.name || t("Sem nome")}
            </p>
            <button
              onClick={() => {
                setNameInput(contact.name ?? "");
                setEditingName(true);
              }}
              className="focus-ring rounded p-0.5 text-txt-dim hover:text-txt"
              aria-label={t("Editar nome")}
            >
              <Pencil className="h-3 w-3" />
            </button>
          </div>
        )}
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

      {/* Notas — lista timestamped de notas por contato */}
      <ContactNotes
        contactId={contact.id}
        orgId={orgId}
        conversationId={conversation.id}
      />
    </div>
  );
}
