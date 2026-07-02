"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Ban,
  Calendar,
  Check,
  Download,
  FileImage,
  FileText,
  Mail,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Tag,
  User,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { cn, formatFullDate, formatPhone, timeAgo } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ContactNotes } from "./contact-notes";
import type { ContactRow, ConversationRow, TeamMember } from "./types";

export interface ContactCsatStats {
  average: number;
  count: number;
}

type TabId = "info" | "relatorio" | "arquivos" | "foto";

interface MediaMessage {
  id: string;
  content: string;
  message_type: string;
  media_url: string;
  direction: string;
  created_at: string;
}

interface ConvStats {
  total_inbound: number;
  total_outbound: number;
  first_at: string | null;
  last_at: string | null;
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
  const supabase = useMemo(() => createClient(), []);

  const [tab, setTab] = useState<TabId>("info");
  const [newTag, setNewTag] = useState("");

  // Edição inline — nome
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(contact.name ?? "");

  // Edição inline — email
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailInput, setEmailInput] = useState(contact.email ?? "");

  // Edição inline — nascimento
  const [editingBirth, setEditingBirth] = useState(false);
  const [birthInput, setBirthInput] = useState(contact.birth_date ?? "");

  // Relatório
  const [stats, setStats] = useState<ConvStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Arquivos
  const [media, setMedia] = useState<MediaMessage[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);

  // Foto
  const [refreshingPhoto, setRefreshingPhoto] = useState(false);

  // Sincroniza ao trocar de contato
  useEffect(() => {
    setNewTag("");
    setEditingName(false);
    setNameInput(contact.name ?? "");
    setEditingEmail(false);
    setEmailInput(contact.email ?? "");
    setEditingBirth(false);
    setBirthInput(contact.birth_date ?? "");
    setTab("info");
    setStats(null);
    setMedia([]);
  }, [contact.id, contact.name, contact.email, contact.birth_date]);

  // Carrega dados lazy por aba
  useEffect(() => {
    if (tab === "relatorio" && !stats && !statsLoading) {
      setStatsLoading(true);
      void (async () => {
        try {
          const { data } = await supabase
            .from("messages")
            .select("direction, created_at")
            .eq("conversation_id", conversation.id);
          if (data) {
            const inbound = data.filter((m) => m.direction === "inbound").length;
            const outbound = data.filter((m) => m.direction === "outbound").length;
            const sorted = [...data].sort((a, b) =>
              a.created_at.localeCompare(b.created_at)
            );
            setStats({
              total_inbound: inbound,
              total_outbound: outbound,
              first_at: sorted[0]?.created_at ?? null,
              last_at: sorted[sorted.length - 1]?.created_at ?? null,
            });
          }
        } finally {
          setStatsLoading(false);
        }
      })();
    }
    if (tab === "arquivos" && media.length === 0 && !mediaLoading) {
      setMediaLoading(true);
      void (async () => {
        try {
          const { data } = await supabase
            .from("messages")
            .select("id, content, message_type, media_url, direction, created_at")
            .eq("conversation_id", conversation.id)
            .not("media_url", "is", null)
            .order("created_at", { ascending: false });
          setMedia((data ?? []) as MediaMessage[]);
        } finally {
          setMediaLoading(false);
        }
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, conversation.id]);

  // ── Helpers de edição ──────────────────────────────────────────────────────

  function saveName() {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === contact.name) { setEditingName(false); return; }
    onUpdateContact({ name: trimmed, name_manually_set: true });
    setEditingName(false);
  }

  function saveEmail() {
    const trimmed = emailInput.trim();
    if (trimmed === (contact.email ?? "")) { setEditingEmail(false); return; }
    onUpdateContact({ email: trimmed || null });
    setEditingEmail(false);
  }

  function saveBirth() {
    if (birthInput === (contact.birth_date ?? "")) { setEditingBirth(false); return; }
    onUpdateContact({ birth_date: birthInput || null });
    setEditingBirth(false);
  }

  function addTag() {
    const tag = newTag.trim().toLowerCase();
    if (!tag || contact.tags.includes(tag)) { setNewTag(""); return; }
    onUpdateContact({ tags: [...contact.tags, tag] });
    setNewTag("");
  }

  function removeTag(tag: string) {
    onUpdateContact({ tags: contact.tags.filter((t) => t !== tag) });
  }

  const assignedName = conversation.assigned_to
    ? (team.find((m) => m.id === conversation.assigned_to)?.name ?? "—")
    : t("Ninguém");

  const tabs: { id: TabId; label: string }[] = [
    { id: "info", label: t("Info") },
    { id: "relatorio", label: t("Relatório") },
    { id: "arquivos", label: t("Arquivos") },
    { id: "foto", label: t("Foto") },
  ];

  return (
    <div className="flex h-full flex-col overflow-y-auto p-5">
      {/* Identidade */}
      <div className="flex flex-col items-center text-center">
        <Avatar name={contact.name ?? contact.phone} imageUrl={contact.avatar_url} size="lg" />
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
            <button onClick={saveName} className="focus-ring rounded p-0.5 text-lime hover:opacity-80" aria-label={t("Salvar nome")}>
              <Check className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setEditingName(false)} className="focus-ring rounded p-0.5 text-txt-dim hover:text-txt" aria-label={t("Cancelar")}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-1">
            <p className="font-display text-base font-semibold">
              {contact.name || t("Sem nome")}
            </p>
            <button
              onClick={() => { setNameInput(contact.name ?? ""); setEditingName(true); }}
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

      {/* Tabs */}
      <div className="mt-5 flex gap-0.5 rounded-lg border border-line bg-ink p-0.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 rounded-md px-1.5 py-1 text-[11px] font-medium transition-colors",
              tab === t.id
                ? "bg-surface-raised text-txt shadow-sm"
                : "text-txt-dim hover:text-txt"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Info ─────────────────────────────────────────────────────── */}
      {tab === "info" && (
        <>
          {/* Meta da conversa */}
          <dl className="mt-4 space-y-2 rounded-lg border border-line bg-ink p-3 text-xs">
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

          {/* Campos editáveis: email e nascimento */}
          <div className="mt-3 space-y-1.5">
            {/* Email */}
            <div className="flex items-center gap-1.5 rounded-md border border-line bg-ink px-2.5 py-1.5">
              <Mail className="h-3 w-3 shrink-0 text-txt-dim" aria-hidden />
              {editingEmail ? (
                <div className="flex flex-1 items-center gap-1">
                  <input
                    autoFocus
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEmail();
                      if (e.key === "Escape") setEditingEmail(false);
                    }}
                    placeholder="email@exemplo.com"
                    className="min-w-0 flex-1 bg-transparent text-xs focus:outline-none"
                  />
                  <button onClick={saveEmail} className="shrink-0 text-lime"><Check className="h-3 w-3" /></button>
                  <button onClick={() => setEditingEmail(false)} className="shrink-0 text-txt-dim"><X className="h-3 w-3" /></button>
                </div>
              ) : (
                <button
                  onClick={() => { setEmailInput(contact.email ?? ""); setEditingEmail(true); }}
                  className="flex flex-1 items-center justify-between text-xs hover:text-txt"
                >
                  <span className={contact.email ? "text-txt" : "text-txt-dim"}>
                    {contact.email || t("Adicionar e-mail")}
                  </span>
                  <Pencil className="h-2.5 w-2.5 text-txt-dim" />
                </button>
              )}
            </div>

            {/* Nascimento */}
            <div className="flex items-center gap-1.5 rounded-md border border-line bg-ink px-2.5 py-1.5">
              <Calendar className="h-3 w-3 shrink-0 text-txt-dim" aria-hidden />
              {editingBirth ? (
                <div className="flex flex-1 items-center gap-1">
                  <input
                    autoFocus
                    type="date"
                    value={birthInput}
                    onChange={(e) => setBirthInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveBirth();
                      if (e.key === "Escape") setEditingBirth(false);
                    }}
                    className="min-w-0 flex-1 bg-transparent text-xs focus:outline-none"
                  />
                  <button onClick={saveBirth} className="shrink-0 text-lime"><Check className="h-3 w-3" /></button>
                  <button onClick={() => setEditingBirth(false)} className="shrink-0 text-txt-dim"><X className="h-3 w-3" /></button>
                </div>
              ) : (
                <button
                  onClick={() => { setBirthInput(contact.birth_date ?? ""); setEditingBirth(true); }}
                  className="flex flex-1 items-center justify-between text-xs hover:text-txt"
                >
                  <span className={contact.birth_date ? "text-txt" : "text-txt-dim"}>
                    {contact.birth_date
                      ? new Date(contact.birth_date + "T00:00:00").toLocaleDateString("pt-BR")
                      : t("Adicionar nascimento")}
                  </span>
                  <Pencil className="h-2.5 w-2.5 text-txt-dim" />
                </button>
              )}
            </div>
          </div>

          {/* Ações */}
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
          <section className="mt-5">
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
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
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
          <ContactNotes
            contactId={contact.id}
            orgId={orgId}
            conversationId={conversation.id}
          />
        </>
      )}

      {/* ── Tab: Relatório ──────────────────────────────────────────────── */}
      {tab === "relatorio" && (
        <div className="mt-4">
          {statsLoading ? (
            <p className="py-8 text-center text-xs text-txt-dim">{t("Carregando...")}</p>
          ) : stats ? (
            <dl className="space-y-2 rounded-lg border border-line bg-ink p-3 text-xs">
              <div className="flex justify-between">
                <dt className="text-txt-dim">{t("Mensagens recebidas")}</dt>
                <dd className="font-medium text-txt">{stats.total_inbound}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-txt-dim">{t("Mensagens enviadas")}</dt>
                <dd className="font-medium text-txt">{stats.total_outbound}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-txt-dim">{t("Total de mensagens")}</dt>
                <dd className="font-medium text-lime">
                  {stats.total_inbound + stats.total_outbound}
                </dd>
              </div>
              <div className="my-1 border-t border-line" />
              <div className="flex justify-between">
                <dt className="text-txt-dim">{t("Primeira mensagem")}</dt>
                <dd className="text-txt-mut">
                  {stats.first_at ? formatFullDate(stats.first_at) : "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-txt-dim">{t("Última mensagem")}</dt>
                <dd className="text-txt-mut">
                  {stats.last_at ? timeAgo(stats.last_at) : "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-txt-dim">{t("Total de conversas")}</dt>
                <dd className="font-medium text-txt">{conversationCount}</dd>
              </div>
              {csatStats && csatStats.count > 0 && (
                <>
                  <div className="my-1 border-t border-line" />
                  <div className="flex justify-between">
                    <dt className="text-txt-dim">{t("CSAT médio")}</dt>
                    <dd className="font-medium text-lime">
                      {csatStats.average.toFixed(1)} ⭐ ({csatStats.count})
                    </dd>
                  </div>
                </>
              )}
            </dl>
          ) : (
            <p className="py-8 text-center text-xs text-txt-dim">{t("Sem dados ainda.")}</p>
          )}
        </div>
      )}

      {/* ── Tab: Arquivos ───────────────────────────────────────────────── */}
      {tab === "arquivos" && (
        <div className="mt-4">
          {mediaLoading ? (
            <p className="py-8 text-center text-xs text-txt-dim">{t("Carregando...")}</p>
          ) : media.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-txt-dim">
              <FileImage className="h-8 w-8 opacity-30" />
              <p className="text-xs">{t("Nenhum arquivo nesta conversa.")}</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {media.map((m) => (
                <a
                  key={m.id}
                  href={m.media_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 rounded-md border border-line bg-ink p-2 text-xs hover:border-lime/40 hover:bg-surface-raised"
                >
                  {m.message_type === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.media_url}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-surface-raised">
                      <FileText className="h-5 w-5 text-txt-dim" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-txt">
                      {m.content || m.message_type}
                    </p>
                    <p className="text-txt-mut">{timeAgo(m.created_at)}</p>
                  </div>
                  <Badge tone={m.direction === "inbound" ? "neutral" : "lime"} className="shrink-0 text-[10px]">
                    {m.direction === "inbound" ? t("Recebido") : t("Enviado")}
                  </Badge>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Foto ───────────────────────────────────────────────────── */}
      {tab === "foto" && (
        <div className="mt-4 flex flex-col items-center gap-4">
          {contact.avatar_url ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={contact.avatar_url}
                alt={contact.name ?? contact.phone}
                className="h-48 w-48 rounded-full object-cover shadow-lg"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
              <p className="text-xs text-txt-dim">
                {t("Foto de perfil do WhatsApp")}
              </p>
              <div className="flex items-center gap-3">
                <a
                  href={contact.avatar_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-lime hover:underline"
                >
                  <Download className="h-3 w-3" />
                  {t("Abrir em tamanho original")}
                </a>
                <button
                  onClick={() => {
                    setRefreshingPhoto(true);
                    fetch(`/api/contacts/${contact.id}/refresh-photo`, { method: "POST" })
                      .then((r) => r.json())
                      .then((d: { ok?: boolean; avatar_url?: string | null; status?: string }) => {
                        if (d.ok && d.avatar_url) onUpdateContact({ avatar_url: d.avatar_url, profile_photo_status: d.status as ContactRow["profile_photo_status"] });
                        else if (d.ok) toast.info(d.status === "private" ? t("Foto privada — o contato restringiu o acesso.") : t("Foto não encontrada."));
                      })
                      .catch(() => toast.error(t("Não foi possível atualizar a foto.")))
                      .finally(() => setRefreshingPhoto(false));
                  }}
                  disabled={refreshingPhoto}
                  className="flex items-center gap-1 text-xs text-txt-dim hover:text-txt disabled:opacity-40"
                >
                  <RefreshCw className={cn("h-3 w-3", refreshingPhoto && "animate-spin")} />
                  {t("Atualizar")}
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 py-8 text-txt-dim">
              <User className="h-12 w-12 opacity-20" />
              <p className="text-xs">
                {contact.profile_photo_status === "private"
                  ? t("Foto privada — o contato restringiu o acesso.")
                  : t("Foto de perfil não disponível.")}
              </p>
              {contact.profile_photo_status !== "private" && (
                <button
                  onClick={() => {
                    setRefreshingPhoto(true);
                    fetch(`/api/contacts/${contact.id}/refresh-photo`, { method: "POST" })
                      .then((r) => r.json())
                      .then((d: { ok?: boolean; avatar_url?: string | null; status?: string }) => {
                        if (d.ok && d.avatar_url) {
                          toast.success(t("Foto carregada!"));
                          onUpdateContact({ avatar_url: d.avatar_url, profile_photo_status: d.status as ContactRow["profile_photo_status"] });
                        } else if (d.ok) {
                          toast.info(d.status === "private" ? t("Foto privada — o contato restringiu o acesso.") : t("Foto não encontrada."));
                          onUpdateContact({ profile_photo_status: d.status as ContactRow["profile_photo_status"] });
                        }
                      })
                      .catch(() => toast.error(t("Não foi possível buscar a foto.")))
                      .finally(() => setRefreshingPhoto(false));
                  }}
                  disabled={refreshingPhoto}
                  className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs hover:bg-surface-hover disabled:opacity-40"
                >
                  <RefreshCw className={cn("h-3 w-3", refreshingPhoto && "animate-spin")} />
                  {refreshingPhoto ? t("Buscando…") : t("Buscar foto de perfil")}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
