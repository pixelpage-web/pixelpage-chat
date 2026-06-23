"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Bot,
  Check,
  Info,
  Lock,
  Paperclip,
  Pause,
  Play,
  RotateCcw,
  Send,
  SlashSquare,
  Sparkles,
  User,
  UserPlus,
  Workflow,
  X,
} from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useT } from "@/lib/i18n";
import { cn, formatMessageTime, formatPhone } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  ContactRow,
  ConversationRow,
  MessageRow,
  QuickTemplate,
  TeamMember,
} from "./types";

function dayLabel(date: string) {
  const d = new Date(date);
  if (isToday(d)) return "Hoje";
  if (isYesterday(d)) return "Ontem";
  return format(d, "d 'de' MMMM", { locale: ptBR });
}

/** Resumo gerado por IA fixado no topo da conversa (conversations.ai_summary). */
interface AiSummary {
  motivo?: string;
  humor?: string;
  ponto_principal?: string;
}

function AiSummaryNote({
  summary,
  onDismiss,
}: {
  summary: AiSummary;
  onDismiss: () => void;
}) {
  const t = useT();
  return (
    <div
      className="mx-3 mt-3 rounded-lg border px-3.5 py-3 sm:mx-5"
      style={{ backgroundColor: "#FEF3C7", borderColor: "#F59E0B" }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-[#92400E]">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          {t("Resumo gerado pela IA")}
        </p>
        <button
          onClick={onDismiss}
          className="focus-ring -mr-1 -mt-1 rounded-md p-1 text-[#92400E] hover:bg-[#FDE68A]"
          aria-label={t("Fechar resumo")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <dl className="mt-1.5 space-y-1 text-xs leading-relaxed text-[#78350F]">
        {summary.motivo && (
          <div>
            <dt className="inline font-semibold">📋 {t("Motivo")}: </dt>
            <dd className="inline">{summary.motivo}</dd>
          </div>
        )}
        {summary.humor && (
          <div>
            <dt className="inline font-semibold">😤 {t("Humor")}: </dt>
            <dd className="inline">{summary.humor}</dd>
          </div>
        )}
        {summary.ponto_principal && (
          <div>
            <dt className="inline font-semibold">⚡ {t("Importante")}: </dt>
            <dd className="inline">{summary.ponto_principal}</dd>
          </div>
        )}
      </dl>
      <p className="mt-1.5 text-[10px] text-[#92400E]/80">
        {t("Conteúdo gerado por inteligência artificial — confira antes de usar.")}
      </p>
    </div>
  );
}

const senderMeta: Record<
  MessageRow["sender_type"],
  { label: string; icon: typeof Bot | null }
> = {
  contact: { label: "", icon: null },
  human: { label: "Equipe", icon: User },
  ai_bot: { label: "Bot IA", icon: Bot },
  external: { label: "n8n", icon: Workflow },
};

function MessageBubble({ message }: { message: MessageRow }) {
  const t = useT();
  const isInbound = message.direction === "inbound";
  const meta = senderMeta[message.sender_type];
  const SenderIcon = meta.icon;

  return (
    <div className={cn("flex", isInbound ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2 sm:max-w-[70%]",
          isInbound
            ? "rounded-bl-sm bg-surface-raised"
            : "rounded-br-sm bg-lime/15 ring-1 ring-inset ring-lime/20"
        )}
      >
        {/* Mídia: preview de imagem, player de áudio, link de documento */}
        {message.message_type === "image" && message.media_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={message.media_url}
            alt={message.content || t("Imagem")}
            className="mb-1.5 max-h-64 rounded-lg object-cover"
            loading="lazy"
          />
        )}
        {message.message_type === "audio" && message.media_url && (
          <audio controls src={message.media_url} className="mb-1.5 w-56 max-w-full" />
        )}
        {(message.message_type === "document" ||
          message.message_type === "video") &&
          message.media_url && (
            <a
              href={message.media_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-1.5 flex items-center gap-2 rounded-lg border border-line bg-ink/40 px-3 py-2 text-xs text-lime underline"
            >
              📄 {message.content || t("Documento")}
            </a>
          )}
        {message.message_type !== "text" && !message.media_url && (
          <p className="mb-1 text-[11px] uppercase tracking-wide text-txt-dim">
            {message.message_type === "image" && `📷 ${t("Imagem")}`}
            {message.message_type === "audio" && `🎙️ ${t("Áudio")}`}
            {message.message_type === "video" && `🎬 ${t("Vídeo")}`}
            {message.message_type === "sticker" && `✨ ${t("Figurinha")}`}
            {message.message_type === "document" && `📄 ${t("Documento")}`}
          </p>
        )}
        {message.content &&
          !(message.message_type === "document" && message.media_url) && (
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-txt">
              {message.content}
            </p>
          )}
        <div
          className={cn(
            "mt-1 flex items-center gap-1 text-[10px] text-txt-dim",
            isInbound ? "justify-start" : "justify-end"
          )}
        >
          {SenderIcon && (
            <>
              <SenderIcon className="h-3 w-3" aria-hidden />
              <span>{t(meta.label)}</span>
              <span aria-hidden>·</span>
            </>
          )}
          <time dateTime={message.created_at}>
            {formatMessageTime(message.created_at)}
          </time>
        </div>
      </div>
    </div>
  );
}

export function MessageThread({
  conversation,
  contact,
  messages,
  loading,
  readOnly,
  team,
  userId,
  onBack,
  onSend,
  onToggleResolve,
  onToggleBotPause,
  onAssign,
  onShowContact,
  templates,
  onAttach,
  attaching,
  flowName,
  connectionMode,
  onTakeOver,
  onPauseFlow,
  onDismissSummary,
}: {
  conversation: ConversationRow;
  contact: ContactRow;
  messages: MessageRow[];
  loading: boolean;
  readOnly: boolean;
  team: TeamMember[];
  userId: string;
  onBack: () => void;
  onSend: (content: string) => void;
  onToggleResolve: () => void;
  onToggleBotPause: () => void;
  onAssign: (memberId: string | null) => void;
  onShowContact: () => void;
  templates: QuickTemplate[];
  onAttach: (file: File) => void;
  attaching: boolean;
  /** Nome do fluxo ativo nesta conversa (se houver) */
  flowName: string | null;
  /** Modo da conexão da conversa (para o indicador "Bot ativo") */
  connectionMode: string | null;
  /** Pausa o bot E gera o resumo por IA (botão "Assumir atendimento") */
  onTakeOver: () => void;
  /** Interrompe o fluxo ativo e passa para atendimento humano */
  onPauseFlow: () => void;
  onDismissSummary: () => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // "/" no início abre os templates rápidos
  const slashQuery = draft.startsWith("/") ? draft.slice(1).toLowerCase() : null;
  const slashMatches =
    slashQuery !== null
      ? templates.filter((tp) => tp.name.toLowerCase().includes(slashQuery)).slice(0, 6)
      : [];

  // Auto-scroll para a última mensagem
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  async function handleSubmit() {
    const content = draft.trim();
    if (!content || sending || readOnly) return;
    setSending(true);
    setDraft("");
    await Promise.resolve(onSend(content));
    setSending(false);
  }

  const assignedName = conversation.assigned_to
    ? (team.find((m) => m.id === conversation.assigned_to)?.name ?? "—")
    : null;

  // Agrupa mensagens por dia para os separadores
  const groups: { label: string; items: MessageRow[] }[] = [];
  for (const msg of messages) {
    const label = dayLabel(msg.created_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(msg);
    else groups.push({ label, items: [msg] });
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-ink">
      {/* Cabeçalho da conversa */}
      <header className="flex items-center gap-3 border-b border-line bg-surface px-3 py-2.5 sm:px-4">
        <button
          onClick={onBack}
          className="focus-ring rounded-md p-1.5 text-txt-mut hover:bg-surface-hover md:hidden"
          aria-label={t("Voltar para a lista")}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Avatar name={contact.name ?? contact.phone} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {contact.name || formatPhone(contact.phone)}
          </p>
          <p className="truncate text-[11px] text-txt-dim">
            {formatPhone(contact.phone)}
            {assignedName && ` · ${t("atribuída a")} ${assignedName}`}
          </p>
        </div>

        <div className="flex items-center gap-1">
          {/* Pausar/retomar bot nesta conversa */}
          <button
            onClick={onToggleBotPause}
            title={
              conversation.bot_paused
                ? t("Bot pausado — clique para reativar")
                : t("Pausar bot nesta conversa (humano assume)")
            }
            className={cn(
              "focus-ring flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors",
              conversation.bot_paused
                ? "bg-amber-soft text-amber"
                : "text-txt-mut hover:bg-surface-hover hover:text-txt"
            )}
          >
            {conversation.bot_paused ? (
              <>
                <Play className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden sm:inline">{t("Retomar bot")}</span>
              </>
            ) : (
              <>
                <Pause className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden sm:inline">{t("Pausar bot")}</span>
              </>
            )}
          </button>

          {/* Atribuir */}
          <div className="relative">
            <button
              onClick={() => setAssignOpen((v) => !v)}
              title={t("Atribuir conversa")}
              className="focus-ring flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-txt-mut transition-colors hover:bg-surface-hover hover:text-txt"
            >
              <UserPlus className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">{t("Atribuir")}</span>
            </button>
            {assignOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setAssignOpen(false)}
                  aria-hidden
                />
                <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-line bg-surface-raised py-1 shadow-pop">
                  <button
                    onClick={() => {
                      onAssign(userId);
                      setAssignOpen(false);
                    }}
                    className="flex w-full items-center px-3 py-2 text-left text-xs hover:bg-surface-hover"
                  >
                    {t("Atribuir a mim")}
                  </button>
                  {team
                    .filter((m) => m.id !== userId)
                    .map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          onAssign(m.id);
                          setAssignOpen(false);
                        }}
                        className="flex w-full items-center px-3 py-2 text-left text-xs hover:bg-surface-hover"
                      >
                        {m.name}
                      </button>
                    ))}
                  <button
                    onClick={() => {
                      onAssign(null);
                      setAssignOpen(false);
                    }}
                    className="flex w-full items-center px-3 py-2 text-left text-xs text-txt-dim hover:bg-surface-hover"
                  >
                    {t("Remover atribuição")}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Resolver / reabrir */}
          <button
            onClick={onToggleResolve}
            title={
              conversation.status === "open"
                ? t("Marcar como resolvida")
                : t("Reabrir conversa")
            }
            className={cn(
              "focus-ring flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors",
              conversation.status === "open"
                ? "text-txt-mut hover:bg-surface-hover hover:text-ok"
                : "bg-ok-soft text-ok"
            )}
          >
            {conversation.status === "open" ? (
              <>
                <Check className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden sm:inline">{t("Resolver")}</span>
              </>
            ) : (
              <>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden sm:inline">{t("Reabrir")}</span>
              </>
            )}
          </button>

          {/* Info do contato (telas menores que xl) */}
          <button
            onClick={onShowContact}
            title={t("Dados do contato")}
            className="focus-ring rounded-md p-1.5 text-txt-mut hover:bg-surface-hover hover:text-txt xl:hidden"
            aria-label={t("Dados do contato")}
          >
            <Info className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Aviso de bot pausado */}
      {conversation.bot_paused && (
        <div className="border-b border-amber/20 bg-amber-soft px-4 py-1.5 text-center text-[11px] text-amber">
          {t("Bot pausado nesta conversa — sua equipe está no comando.")}
        </div>
      )}

      {/* Resumo gerado por IA — fixado antes das mensagens */}
      {conversation.ai_summary &&
        typeof conversation.ai_summary === "object" &&
        !Array.isArray(conversation.ai_summary) && (
          <AiSummaryNote
            summary={conversation.ai_summary as AiSummary}
            onDismiss={onDismissSummary}
          />
        )}

      {/* Mensagens */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-5">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-3/5" />
            <Skeleton className="ml-auto h-12 w-1/2" />
            <Skeleton className="h-16 w-2/3" />
            <Skeleton className="ml-auto h-10 w-2/5" />
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="space-y-3">
              <div className="sticky top-0 z-10 flex justify-center">
                <span className="rounded-full border border-line bg-surface px-3 py-0.5 text-[10px] font-medium text-txt-dim">
                  {t(group.label)}
                </span>
              </div>
              {group.items.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
            </div>
          ))
        )}
      </div>

      {/* Campo de resposta */}
      <footer className="border-t border-line bg-surface p-3">
        {/* Indicador do modo atual do atendimento */}
        {!readOnly && (
          <div className="empty:hidden [&:not(:empty)]:mb-2">
          {conversation.bot_paused ? (
            <div className="flex items-center justify-between rounded-lg border border-line bg-ink px-3 py-1.5">
              <span className="text-[11px] text-txt-mut">
                👤 {t("Atendimento humano")}
              </span>
              <button
                onClick={onToggleBotPause}
                className="focus-ring rounded-md px-2 py-1 text-[11px] font-semibold text-lime hover:bg-lime-soft"
              >
                {t("Reativar bot")}
              </button>
            </div>
          ) : conversation.current_flow_id ? (
            <div className="flex items-center justify-between rounded-lg border border-lime/25 bg-lime-soft px-3 py-1.5">
              <span className="truncate text-[11px] text-lime">
                ⚡ {t("Fluxo ativo")}: {flowName ?? t("fluxo")}
              </span>
              <button
                onClick={onPauseFlow}
                className="focus-ring ml-2 shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold text-amber hover:bg-amber-soft"
              >
                {t("Pausar fluxo")}
              </button>
            </div>
          ) : connectionMode === "ai_bot" ? (
            <div className="flex items-center justify-between rounded-lg border border-ok/25 bg-ok-soft px-3 py-1.5">
              <span className="text-[11px] text-ok">🤖 {t("Bot ativo")}</span>
              <button
                onClick={onTakeOver}
                className="focus-ring rounded-md px-2 py-1 text-[11px] font-semibold text-txt hover:bg-surface-hover"
              >
                {t("Assumir atendimento")}
              </button>
            </div>
          ) : null}
          </div>
        )}
        {readOnly ? (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-amber/25 bg-amber-soft px-4 py-3 text-xs text-amber">
            <Lock className="h-4 w-4 shrink-0" aria-hidden />
            {t("Seu plano expirou — o inbox está somente leitura. Faça upgrade para voltar a responder.")}
          </div>
        ) : (
          <div className="relative">
            {/* Templates rápidos: digite "/" ou clique no ícone */}
            {(slashMatches.length > 0 || templatesOpen) && templates.length > 0 && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setTemplatesOpen(false)}
                  aria-hidden
                />
                <div className="absolute bottom-full left-0 z-20 mb-2 max-h-56 w-full max-w-md overflow-y-auto rounded-lg border border-line bg-surface-raised py-1 shadow-pop">
                  {(slashQuery !== null ? slashMatches : templates.slice(0, 8)).map(
                    (tp) => (
                      <button
                        key={tp.id}
                        onClick={() => {
                          setDraft(tp.content);
                          setTemplatesOpen(false);
                        }}
                        className="block w-full px-3 py-2 text-left hover:bg-surface-hover"
                      >
                        <span className="text-xs font-semibold text-lime">/{tp.name}</span>
                        <span className="mt-0.5 block truncate text-xs text-txt-mut">
                          {tp.content}
                        </span>
                      </button>
                    )
                  )}
                </div>
              </>
            )}

            <div className="flex items-end gap-2">
              {/* Anexar arquivo (imagem/documento) */}
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onAttach(file);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={attaching}
                title={t("Anexar arquivo")}
                aria-label={t("Anexar arquivo")}
                className="focus-ring flex h-[42px] w-9 shrink-0 items-center justify-center rounded-lg text-txt-dim transition-colors hover:bg-surface-hover hover:text-txt disabled:opacity-50"
              >
                <Paperclip className={cn("h-4 w-4", attaching && "animate-pulse")} />
              </button>
              {templates.length > 0 && (
                <button
                  onClick={() => setTemplatesOpen((v) => !v)}
                  title={t("Templates rápidos (digite /)")}
                  aria-label={t("Templates rápidos (digite /)")}
                  className="focus-ring flex h-[42px] w-9 shrink-0 items-center justify-center rounded-lg text-txt-dim transition-colors hover:bg-surface-hover hover:text-txt"
                >
                  <SlashSquare className="h-4 w-4" />
                </button>
              )}
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSubmit();
                  }
                  if (e.key === "Escape") setTemplatesOpen(false);
                }}
                rows={1}
                placeholder={t("Escreva uma resposta… (Enter envia, / templates)")}
                className="focus-ring max-h-32 min-h-[42px] flex-1 resize-none rounded-lg border border-line bg-ink px-3 py-2.5 text-sm placeholder:text-txt-dim"
              />
              <button
                onClick={() => void handleSubmit()}
                disabled={!draft.trim() || sending}
                className="focus-ring flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg bg-lime text-white transition-colors hover:bg-lime-bright disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={t("Enviar mensagem")}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </footer>
    </div>
  );
}
