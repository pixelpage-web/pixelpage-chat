"use client";

import { useMemo, useState } from "react";
import {
  Bot,
  FileText,
  Image as ImageIcon,
  Inbox as InboxIcon,
  Mic,
  Search,
  User,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { KeyboardShortcutsButton } from "./keyboard-shortcuts";
import { useT } from "@/lib/i18n";
import { cn, formatConversationTime, formatPhone } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { ConversationSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import type {
  ConnectionSummary,
  ContactRow,
  ConversationRow,
  InboxFilter,
  LabelRow,
  MessagePreview,
  UnitSummary,
} from "./types";

const filters: { value: InboxFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "open", label: "Abertas" },
  { value: "resolved", label: "Resolvidas" },
  { value: "pending", label: "Pendentes" },
  { value: "mine", label: "Minhas" },
];

/** Prefixo da prévia indicando quem mandou a última mensagem. */
function previewPrefix(preview: MessagePreview) {
  switch (preview.sender_type) {
    case "human":
      return <User className="h-3 w-3 shrink-0 text-txt-dim" aria-label="Equipe" />;
    case "ai_bot":
      return <Bot className="h-3 w-3 shrink-0 text-lime" aria-label="Bot IA" />;
    case "external":
      return <Workflow className="h-3 w-3 shrink-0 text-amber" aria-label="n8n" />;
    default:
      return null;
  }
}

function previewText(
  preview: MessagePreview | undefined,
  t: (s: string) => string
): { icon: LucideIcon | null; text: string } {
  if (!preview) return { icon: null, text: t("Sem mensagens") };
  if (preview.message_type === "image") return { icon: ImageIcon, text: t("Imagem") };
  if (preview.message_type === "audio") return { icon: Mic, text: t("Áudio") };
  if (preview.message_type === "document") return { icon: FileText, text: t("Documento") };
  return { icon: null, text: preview.content };
}

export function ConversationList({
  loading,
  conversations,
  contacts,
  lastMessages,
  filter,
  onFilterChange,
  selectedId,
  onSelect,
  emptyAction,
  userId,
  connections,
  connectionFilter,
  onConnectionFilterChange,
  orgLabels = [],
  convLabels = {},
  labelFilter,
  onLabelFilterChange,
  orgUnits = [],
  unitFilter = "all",
  onUnitFilterChange,
  canFilterByUnit = false,
}: {
  loading: boolean;
  conversations: ConversationRow[];
  contacts: Record<string, ContactRow>;
  lastMessages: Record<string, MessagePreview>;
  filter: InboxFilter;
  onFilterChange: (f: InboxFilter) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  emptyAction?: React.ReactNode;
  userId: string;
  connections: ConnectionSummary[];
  connectionFilter: string | "all";
  onConnectionFilterChange: (id: string | "all") => void;
  orgLabels?: LabelRow[];
  convLabels?: Record<string, string[]>;
  labelFilter?: string | null;
  onLabelFilterChange?: (id: string | null) => void;
  orgUnits?: UnitSummary[];
  unitFilter?: string | "all";
  onUnitFilterChange?: (id: string | "all") => void;
  canFilterByUnit?: boolean;
}) {
  const t = useT();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return conversations.filter((c) => {
      if (filter === "open" && c.status !== "open") return false;
      if (filter === "resolved" && c.status !== "resolved") return false;
      if (filter === "pending" && c.status !== "pending") return false;
      if (filter === "mine" && c.assigned_to !== userId) return false;
      if (connectionFilter !== "all" && c.connection_id !== connectionFilter)
        return false;
      if (labelFilter && !(convLabels[c.id] ?? []).includes(labelFilter))
        return false;
      if (unitFilter !== "all" && c.unit_id !== unitFilter) return false;
      if (term) {
        const contact = contacts[c.contact_id];
        const name = contact?.name?.toLowerCase() ?? "";
        const phone = contact?.phone ?? "";
        if (!name.includes(term) && !phone.includes(term)) return false;
      }
      return true;
    });
  }, [conversations, contacts, filter, search, userId, connectionFilter, labelFilter, convLabels, unitFilter]);

  const openCount = useMemo(
    () => conversations.filter((c) => c.status === "open" && c.unread_count > 0).length,
    [conversations]
  );

  return (
    <>
      <header className="border-b border-line px-4 pb-3 pt-4">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-lg font-semibold">Inbox</h1>
          <div className="flex items-center gap-2">
            {openCount > 0 && (
              <span className="rounded-full bg-lime px-2 py-0.5 text-[11px] font-semibold text-white">
                {openCount} {openCount > 1 ? t("não lidas") : t("não lida")}
              </span>
            )}
            <KeyboardShortcutsButton />
          </div>
        </div>

        <div className="relative mt-3">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-txt-dim"
            aria-hidden
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Buscar contato ou telefone…")}
            className="focus-ring h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm placeholder:text-txt-dim"
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-1">
          {filters.map((f) => (
            <button
              key={f.value}
              onClick={() => onFilterChange(f.value)}
              className={cn(
                "focus-ring rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                filter === f.value
                  ? "bg-lime-soft text-lime"
                  : "text-txt-dim hover:bg-surface-raised hover:text-txt"
              )}
            >
              {t(f.label)}
            </button>
          ))}
        </div>

        {/* Filtro por etiqueta */}
        {orgLabels.filter((l) => l.show_on_sidebar).length > 0 && onLabelFilterChange && (
          <div className="mt-2 flex flex-wrap gap-1">
            {orgLabels.filter((l) => l.show_on_sidebar).map((label) => (
              <button
                key={label.id}
                onClick={() => onLabelFilterChange(labelFilter === label.id ? null : label.id)}
                className={cn(
                  "focus-ring flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
                  labelFilter === label.id
                    ? "border-transparent text-white"
                    : "border-line bg-transparent text-txt-dim hover:text-txt"
                )}
                style={labelFilter === label.id ? { backgroundColor: label.color, borderColor: label.color } : undefined}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: label.color }}
                />
                {label.title}
              </button>
            ))}
          </div>
        )}

        {/* Filtro por conexão — aparece com múltiplos números */}
        {connections.length > 1 && (
          <select
            value={connectionFilter}
            onChange={(e) => onConnectionFilterChange(e.target.value)}
            className="focus-ring mt-2 h-8 w-full rounded-md border border-line bg-surface px-2 text-xs text-txt-mut"
            aria-label={t("Filtrar por conexão")}
          >
            <option value="all">{t("Todas as conexões")}</option>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} {c.phone_display ? `(${c.phone_display})` : ""}
              </option>
            ))}
          </select>
        )}

        {/* Filtro por unidade — só pra dono/admin, quando existem unidades */}
        {canFilterByUnit && orgUnits.length > 0 && onUnitFilterChange && (
          <select
            value={unitFilter}
            onChange={(e) => onUnitFilterChange(e.target.value)}
            className="focus-ring mt-2 h-8 w-full rounded-md border border-line bg-surface px-2 text-xs text-txt-mut"
            aria-label={t("Filtrar por unidade")}
          >
            <option value="all">{t("Todas as unidades")}</option>
            {orgUnits.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <>
            <ConversationSkeleton />
            <ConversationSkeleton />
            <ConversationSkeleton />
            <ConversationSkeleton />
            <ConversationSkeleton />
          </>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={InboxIcon}
            title={
              conversations.length === 0
                ? t("Nenhuma conversa ainda")
                : t("Nada por aqui")
            }
            description={
              conversations.length === 0
                ? t("Quando alguém mandar mensagem para o seu WhatsApp, a conversa aparece aqui em tempo real.")
                : t("Nenhuma conversa corresponde ao filtro ou à busca.")
            }
            action={conversations.length === 0 ? emptyAction : undefined}
            className="py-10"
          />
        ) : (
          <ul>
            {filtered.map((conv) => {
              const contact = contacts[conv.contact_id];
              const preview = lastMessages[conv.id];
              const previewMeta = previewText(preview, t);
              const displayName =
                contact?.name || (contact ? formatPhone(contact.phone) : t("Contato"));
              return (
                <li key={conv.id}>
                  <button
                    onClick={() => onSelect(conv.id)}
                    className={cn(
                      "focus-ring flex w-full items-center gap-3 border-b border-line/50 px-4 py-3 text-left transition-colors",
                      selectedId === conv.id
                        ? "bg-surface"
                        : "hover:bg-surface/60"
                    )}
                  >
                    <Avatar
                      name={contact?.name ?? contact?.phone}
                      imageUrl={contact?.avatar_url ?? undefined}
                      colorSeed={contact?.id}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p
                          className={cn(
                            "truncate text-sm",
                            conv.unread_count > 0
                              ? "font-semibold text-txt"
                              : "font-medium text-txt"
                          )}
                        >
                          {displayName}
                        </p>
                        <span className="shrink-0 text-[11px] text-txt-dim">
                          {formatConversationTime(conv.last_message_at)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5 text-xs text-txt-mut">
                          {preview && previewPrefix(preview)}
                          {previewMeta.icon && (
                            <previewMeta.icon className="h-3 w-3 shrink-0" aria-hidden />
                          )}
                          <span className="truncate">{previewMeta.text}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {/* Label dots */}
                          {(convLabels[conv.id] ?? []).slice(0, 3).map((lid) => {
                            const lbl = orgLabels.find((l) => l.id === lid);
                            return lbl ? (
                              <span
                                key={lid}
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: lbl.color }}
                                title={lbl.title}
                              />
                            ) : null;
                          })}
                          {conv.status === "resolved" && (
                            <span className="rounded bg-surface-raised px-1.5 py-0.5 text-[10px] text-txt-dim">
                              {t("Resolvida")}
                            </span>
                          )}
                          {conv.unread_count > 0 && (
                            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-lime px-1.5 text-[11px] font-bold text-white">
                              {conv.unread_count}
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
