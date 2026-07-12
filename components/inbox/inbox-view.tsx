"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Inbox as InboxIcon, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useUnreadCount } from "@/components/app-shell";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { ConversationList } from "./conversation-list";
import { MessageThread } from "./message-thread";
import { ContactPanel, type ContactCsatStats } from "./contact-panel";
import type { Json, Role } from "@/types/database";
import type {
  CannedResponse,
  ConnectionSummary,
  ContactRow,
  ConversationRow,
  InboxFilter,
  LabelRow,
  MessagePreview,
  MessageRow,
  QuickTemplate,
  TeamMember,
  UnitSummary,
} from "./types";

export function InboxView({
  orgId,
  userId,
  readOnly,
  seedEnabled,
  role,
}: {
  orgId: string;
  userId: string;
  readOnly: boolean;
  seedEnabled: boolean;
  role: Role;
}) {
  const supabase = useMemo(() => createClient(), []);
  const t = useT();
  const { decrementUnread } = useUnreadCount();

  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [contacts, setContacts] = useState<Record<string, ContactRow>>({});
  const [lastMessages, setLastMessages] = useState<Record<string, MessagePreview>>({});
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [connections, setConnections] = useState<ConnectionSummary[]>([]);
  const [connectionFilter, setConnectionFilter] = useState<string | "all">("all");
  const [templates, setTemplates] = useState<QuickTemplate[]>([]);
  const [cannedResponses, setCannedResponses] = useState<CannedResponse[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [orgUnits, setOrgUnits] = useState<UnitSummary[]>([]);
  const [unitFilter, setUnitFilter] = useState<string | "all">("all");
  // Nome dos fluxos (indicador "Fluxo ativo") e CSAT por contato
  const [flowNames, setFlowNames] = useState<Record<string, string>>({});
  const [contactCsat, setContactCsat] = useState<Record<string, ContactCsatStats>>({});
  // Etiquetas da org e mapa de etiquetas por conversa
  const [orgLabels, setOrgLabels] = useState<LabelRow[]>([]);
  const [convLabels, setConvLabels] = useState<Record<string, string[]>>({}); // conversationId → labelId[]
  const [labelFilter, setLabelFilter] = useState<string | null>(null);

  // Ref para os handlers de realtime enxergarem a conversa aberta
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  // ---------------------------------------------------------------------------
  // Carga inicial: conversas + contatos + equipe + prévia das últimas mensagens
  // ---------------------------------------------------------------------------
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [convRes, contactRes, teamRes, connRes, tplRes, flowRes, cannedRes, labelsRes, unitsRes] = await Promise.all([
        supabase
          .from("conversations")
          .select("*")
          .eq("org_id", orgId)
          .eq("archived", false)
          .order("last_message_at", { ascending: false })
          .limit(200),
        supabase.from("contacts").select("*").eq("org_id", orgId),
        supabase.from("profiles").select("id, name").eq("org_id", orgId),
        supabase
          .from("whatsapp_connections")
          .select("id, label, phone_display, mode")
          .eq("org_id", orgId),
        supabase
          .from("message_templates")
          .select("id, name, content")
          .eq("active", true)
          .order("name"),
        supabase.from("flows").select("id, name").eq("org_id", orgId),
        supabase
          .from("canned_responses")
          .select("id, short_code, content")
          .eq("org_id", orgId)
          .order("short_code"),
        supabase
          .from("labels")
          .select("id, title, color, description, show_on_sidebar")
          .eq("org_id", orgId)
          .order("title"),
        supabase
          .from("org_units")
          .select("id, name")
          .eq("org_id", orgId)
          .eq("is_active", true)
          .order("name"),
      ]);
      setOrgUnits(unitsRes.data ?? []);

      if (convRes.error || contactRes.error || teamRes.error) {
        toast.error(t("Não foi possível carregar o inbox. Recarregue a página."));
        return;
      }
      setConnections(connRes.data ?? []);
      setCannedResponses(cannedRes.data ?? []);
      setOrgLabels((labelsRes.data ?? []) as LabelRow[]);
      // Mescla: canned responses (org) + templates globais como fallback
      const canned: QuickTemplate[] = (cannedRes.data ?? []).map((c) => ({
        id: c.id,
        name: c.short_code,
        content: c.content,
        source: "canned" as const,
      }));
      const global: QuickTemplate[] = (tplRes.data ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        content: t.content,
        source: "template" as const,
      }));
      setTemplates([...canned, ...global]);
      setFlowNames(
        Object.fromEntries((flowRes.data ?? []).map((f) => [f.id, f.name]))
      );

      const convs = convRes.data ?? [];
      setConversations(convs);

      // Carregar etiquetas de todas as conversas carregadas
      if (convs.length > 0) {
        const { data: clData } = await supabase
          .from("conversation_labels")
          .select("conversation_id, label_id")
          .in("conversation_id", convs.map((c) => c.id));
        if (clData) {
          const map: Record<string, string[]> = {};
          for (const cl of clData) {
            if (!map[cl.conversation_id]) map[cl.conversation_id] = [];
            map[cl.conversation_id].push(cl.label_id);
          }
          setConvLabels(map);
        }
      }
      setContacts(
        Object.fromEntries((contactRes.data ?? []).map((c) => [c.id, c]))
      );
      setTeam(
        (teamRes.data ?? []).map((p) => ({ id: p.id, name: p.name || "Sem nome" }))
      );

      // Prévia: busca as mensagens mais recentes e fica com a 1ª de cada conversa
      if (convs.length > 0) {
        const { data: previews } = await supabase
          .from("messages")
          .select("conversation_id, content, sender_type, message_type, created_at")
          .in("conversation_id", convs.map((c) => c.id))
          .order("created_at", { ascending: false })
          .limit(400);

        const map: Record<string, MessagePreview> = {};
        for (const m of previews ?? []) {
          if (!map[m.conversation_id]) {
            map[m.conversation_id] = {
              content: m.content,
              sender_type: m.sender_type,
              message_type: m.message_type,
              created_at: m.created_at,
            };
          }
        }
        setLastMessages(map);
      }
    } catch {
      toast.error(t("Erro de conexão ao carregar o inbox."));
    } finally {
      setLoading(false);
    }
  }, [supabase, orgId, t]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // ---------------------------------------------------------------------------
  // Realtime: mensagens novas e mudanças nas conversas chegam sem refresh
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const channel = supabase
      .channel(`inbox-${orgId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as MessageRow;
          setLastMessages((prev) => ({
            ...prev,
            [msg.conversation_id]: {
              content: msg.content,
              sender_type: msg.sender_type,
              message_type: msg.message_type,
              created_at: msg.created_at,
            },
          }));
          if (msg.conversation_id === selectedIdRef.current) {
            setMessages((prev) =>
              prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
            );
            // Conversa aberta na tela — zera não lidas imediatamente
            if (msg.direction === "inbound") {
              void supabase.rpc("mark_conversation_read", {
                p_conversation_id: msg.conversation_id,
              });
            }
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversations",
          filter: `org_id=eq.${orgId}`,
        },
        (payload) => {
          const conv = payload.new as ConversationRow;
          // Conexão desconectada (ou excluída) arquivou a conversa — some
          // do Inbox na hora. Se era a conversa aberta, desseleciona
          // (equivalente a voltar pro Inbox vazio, sem reload).
          if (conv.archived) {
            setConversations((prev) => prev.filter((c) => c.id !== conv.id));
            if (selectedIdRef.current === conv.id) setSelectedId(null);
            return;
          }
          setConversations((prev) => {
            // Reconectou: a conversa não estava mais no state (arquivada
            // antes) — reaparece igual a uma conversa nova.
            const next = prev.some((c) => c.id === conv.id)
              ? prev.map((c) => (c.id === conv.id ? conv : c))
              : [conv, ...prev];
            return [...next].sort(
              (a, b) =>
                new Date(b.last_message_at).getTime() -
                new Date(a.last_message_at).getTime()
            );
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversations",
          filter: `org_id=eq.${orgId}`,
        },
        (payload) => {
          const conv = payload.new as ConversationRow;
          setConversations((prev) =>
            prev.some((c) => c.id === conv.id) ? prev : [conv, ...prev]
          );
          // Contato pode ser novo — busca para exibir nome/telefone
          void supabase
            .from("contacts")
            .select("*")
            .eq("id", conv.contact_id)
            .maybeSingle()
            .then(({ data }) => {
              if (data) setContacts((prev) => ({ ...prev, [data.id]: data }));
            });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, orgId]);

  // ---------------------------------------------------------------------------
  // Seleção de conversa: carrega o histórico e zera não lidas
  // ---------------------------------------------------------------------------
  const selectConversation = useCallback(
    async (id: string) => {
      setSelectedId(id);
      setMessagesLoading(true);
      try {
        const { data, error } = await supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", id)
          .order("created_at", { ascending: true })
          .limit(500);
        if (error) {
          toast.error(t("Não foi possível carregar as mensagens."));
          return;
        }
        setMessages(data ?? []);

        const conv = conversations.find((c) => c.id === id);
        if (conv && conv.unread_count > 0) {
          setConversations((prev) =>
            prev.map((c) => (c.id === id ? { ...c, unread_count: 0 } : c))
          );
          // Ponte otimista: zera o badge do nav (AppShell) na hora, sem esperar
          // o round trip do realtime (DB write → WAL → broadcast → refetch).
          decrementUnread(1);
          supabase.rpc("mark_conversation_read", { p_conversation_id: id }).then(({ error }) => {
            if (error) console.error("Falha ao marcar conversa como lida:", error);
          });
        }

        // Score CSAT do contato (média de todas as avaliações dele)
        if (conv) {
          void supabase
            .from("csat_responses")
            .select("score")
            .eq("contact_id", conv.contact_id)
            .then(({ data: scores }) => {
              if (!scores) return;
              setContactCsat((prev) => ({
                ...prev,
                [conv.contact_id]:
                  scores.length > 0
                    ? {
                        average:
                          scores.reduce((sum, r) => sum + r.score, 0) / scores.length,
                        count: scores.length,
                      }
                    : { average: 0, count: 0 },
              }));
            });
        }
      } catch {
        toast.error(t("Erro de conexão ao abrir a conversa."));
      } finally {
        setMessagesLoading(false);
      }
    },
    [supabase, conversations, t]
  );

  // ---------------------------------------------------------------------------
  // Ações
  // ---------------------------------------------------------------------------
  async function handleSend(content: string) {
    if (!selectedId) return;
    try {
      const res = await fetch("/api/inbox/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: selectedId, content }),
      });
      const json = (await res.json()) as {
        message?: MessageRow;
        error?: string;
        bot_paused?: boolean;
      };
      if (!res.ok || !json.message) {
        toast.error(json.error ?? t("Não foi possível enviar a mensagem."));
        return;
      }
      const msg = json.message;
      setMessages((prev) =>
        prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
      );
      setLastMessages((prev) => ({
        ...prev,
        [msg.conversation_id]: {
          content: msg.content,
          sender_type: msg.sender_type,
          message_type: msg.message_type,
          created_at: msg.created_at,
        },
      }));
      // Reflte a pausa automática do bot na UI imediatamente
      if (json.bot_paused) {
        setConversations((prev) =>
          prev.map((c) => (c.id === selectedId ? { ...c, bot_paused: true } : c))
        );
      }
    } catch {
      toast.error(t("Erro de conexão ao enviar. Tente novamente."));
    }
  }

  async function patchConversation(
    id: string,
    patch: Partial<ConversationRow>,
    errorMsg: string
  ) {
    const previous = conversations;
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );
    try {
      const { error } = await supabase
        .from("conversations")
        .update(patch)
        .eq("id", id);
      if (error) {
        setConversations(previous);
        toast.error(t(errorMsg));
      }
    } catch {
      setConversations(previous);
      toast.error(t("Erro de conexão. Tente novamente."));
    }
  }

  async function handleUpdateContact(
    contactId: string,
    patch: Partial<ContactRow>
  ) {
    const previous = contacts;
    setContacts((prev) => ({
      ...prev,
      [contactId]: { ...prev[contactId], ...patch },
    }));
    try {
      const { error } = await supabase
        .from("contacts")
        .update(patch)
        .eq("id", contactId);
      if (error) {
        setContacts(previous);
        toast.error(t("Não foi possível salvar o contato."));
      } else {
        toast.success(t("Contato atualizado."));
      }
    } catch {
      setContacts(previous);
      toast.error(t("Erro de conexão ao salvar o contato."));
    }
  }

  async function handleAttach(file: File) {
    if (!selectedId) return;
    setAttaching(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("conversation_id", selectedId);
      const res = await fetch("/api/inbox/send-media", { method: "POST", body: form });
      const json = (await res.json()) as { message?: MessageRow; error?: string };
      if (!res.ok || !json.message) {
        toast.error(json.error ?? t("Não foi possível enviar o arquivo."));
        return;
      }
      const msg = json.message;
      setMessages((prev) =>
        prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
      );
    } catch {
      toast.error(t("Erro de conexão ao enviar o arquivo."));
    } finally {
      setAttaching(false);
    }
  }

  async function handleToggleBlock(contact: ContactRow) {
    const next = !contact.blocked;
    setContacts((prev) => ({
      ...prev,
      [contact.id]: { ...prev[contact.id], blocked: next },
    }));
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("contacts")
        .update({ blocked: next })
        .eq("id", contact.id);
      if (error) {
        setContacts((prev) => ({
          ...prev,
          [contact.id]: { ...prev[contact.id], blocked: !next },
        }));
        toast.error(t("Não foi possível atualizar o bloqueio."));
      } else {
        toast.success(next ? t("Contato bloqueado.") : t("Contato desbloqueado."));
      }
    } catch {
      toast.error(t("Erro de conexão."));
    }
  }

  /** Exporta o histórico da conversa aberta como CSV. */
  function handleExportHistory(contact: ContactRow) {
    if (messages.length === 0) {
      toast.error(t("Nada para exportar nesta conversa."));
      return;
    }
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = [
      ["data", "direcao", "remetente", "tipo", "conteudo"].join(";"),
      ...messages.map((m) =>
        [
          esc(new Date(m.created_at).toLocaleString("pt-BR")),
          m.direction,
          m.sender_type,
          m.message_type,
          esc(m.content),
        ].join(";")
      ),
    ];
    const blob = new Blob(["﻿" + rows.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `conversa_${contact.phone}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Exclui o contato permanentemente. O DELETE em `contacts` já cascateia
   * pra conversations → messages (e todo o resto: notas, csat etc.) via FK
   * — não precisa apagar em passos separados. Só depois de confirmar
   * sucesso é que a UI muda (painel fecha, conversa some da lista).
   */
  async function handleDeleteContact(contact: ContactRow) {
    try {
      const supabase = createClient();
      const { error } = await supabase.from("contacts").delete().eq("id", contact.id);
      if (error) {
        toast.error(t("Não foi possível excluir o contato."));
        return;
      }
      setConversations((prev) => prev.filter((c) => c.contact_id !== contact.id));
      setContacts((prev) => {
        const next = { ...prev };
        delete next[contact.id];
        return next;
      });
      setContactModalOpen(false);
      setSelectedId(null);
      toast.success(t("Contato excluído."));
    } catch {
      toast.error(t("Erro de conexão."));
    }
  }

  /**
   * Exclui uma mensagem (só outbound — RLS já bloqueia inbound no banco).
   * Otimista: some da UI na hora, volta se o delete falhar. Não recarrega
   * a conversa inteira, só remove a mensagem do state local.
   */
  async function handleDeleteMessage(messageId: string) {
    const previous = messages;
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    try {
      const supabase = createClient();
      const { error } = await supabase.from("messages").delete().eq("id", messageId);
      if (error) {
        setMessages(previous);
        toast.error(t("Não foi possível excluir a mensagem."));
      }
    } catch {
      setMessages(previous);
      toast.error(t("Erro de conexão."));
    }
  }

  /** Alterna uma etiqueta em uma conversa. */
  async function handleToggleLabel(conversationId: string, labelId: string) {
    const current = convLabels[conversationId] ?? [];
    const has = current.includes(labelId);
    setConvLabels((prev) => ({
      ...prev,
      [conversationId]: has ? current.filter((id) => id !== labelId) : [...current, labelId],
    }));
    try {
      if (has) {
        await supabase
          .from("conversation_labels")
          .delete()
          .eq("conversation_id", conversationId)
          .eq("label_id", labelId);
      } else {
        await supabase
          .from("conversation_labels")
          .insert({ conversation_id: conversationId, label_id: labelId });
      }
    } catch {
      setConvLabels((prev) => ({ ...prev, [conversationId]: current }));
      toast.error(t("Não foi possível atualizar a etiqueta."));
    }
  }

  /** "Assumir atendimento": pausa o bot e gera o resumo por IA em segundo plano. */
  async function handleTakeOver(conversation: ConversationRow) {
    await patchConversation(
      conversation.id,
      { bot_paused: true },
      "Não foi possível assumir o atendimento."
    );
    // Resumo chega via realtime (UPDATE em conversations.ai_summary)
    void fetch("/api/inbox/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: conversation.id }),
    }).catch(() => undefined);
  }

  /** "Pausar fluxo": interrompe o fluxo ativo e passa para atendimento humano. */
  async function handlePauseFlow(conversation: ConversationRow) {
    await patchConversation(
      conversation.id,
      {
        current_flow_id: null,
        current_flow_node_id: null,
        flow_state: {} as Json,
        bot_paused: true,
      },
      "Não foi possível pausar o fluxo."
    );
    toast.success(t("Fluxo pausado — sua equipe está no comando."));
  }

  /** Fecha o resumo de IA fixado no topo da conversa. */
  async function handleDismissSummary(conversation: ConversationRow) {
    setConversations((prev) =>
      prev.map((c) => (c.id === conversation.id ? { ...c, ai_summary: null } : c))
    );
    try {
      await fetch(`/api/inbox/summary?conversation_id=${conversation.id}`, {
        method: "DELETE",
      });
    } catch {
      // realtime restaura o valor se a exclusão falhar
    }
  }

  async function handleSeed() {
    setSeeding(true);
    try {
      const res = await fetch("/api/dev/seed", { method: "POST" });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(json?.error ?? t("Não foi possível criar os dados de exemplo."));
        return;
      }
      toast.success(t("Dados de exemplo criados!"));
      await loadAll();
    } catch {
      toast.error(t("Erro de conexão ao criar dados de exemplo."));
    } finally {
      setSeeding(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  const selectedContact = selected ? (contacts[selected.contact_id] ?? null) : null;
  const selectedContactConversations = selectedContact
    ? conversations.filter((c) => c.contact_id === selectedContact.id).length
    : 0;
  const selectedCsat =
    selectedContact && contactCsat[selectedContact.id]?.count
      ? contactCsat[selectedContact.id]
      : null;
  const selectedConnectionMode = selected?.connection_id
    ? (connections.find((c) => c.id === selected.connection_id)?.mode ?? null)
    : null;
  const selectedFlowName = selected?.current_flow_id
    ? (flowNames[selected.current_flow_id] ?? null)
    : null;

  const isEmpty = !loading && conversations.length === 0;

  return (
    <div className="flex h-full">
      {/* Lista de conversas — esquerda (tela cheia no mobile) */}
      <section
        className={cn(
          "flex w-full shrink-0 flex-col border-r border-line bg-ink md:w-80",
          selectedId && "hidden md:flex"
        )}
      >
        <ConversationList
          loading={loading}
          conversations={conversations}
          contacts={contacts}
          lastMessages={lastMessages}
          filter={filter}
          onFilterChange={setFilter}
          selectedId={selectedId}
          onSelect={(id) => void selectConversation(id)}
          userId={userId}
          connections={connections}
          connectionFilter={connectionFilter}
          onConnectionFilterChange={setConnectionFilter}
          orgLabels={orgLabels}
          convLabels={convLabels}
          labelFilter={labelFilter}
          onLabelFilterChange={setLabelFilter}
          orgUnits={orgUnits}
          unitFilter={unitFilter}
          onUnitFilterChange={setUnitFilter}
          canFilterByUnit={role === "owner" || role === "admin"}
          emptyAction={
            seedEnabled ? (
              <Button
                onClick={() => void handleSeed()}
                loading={seeding}
                variant="secondary"
                size="sm"
              >
                <Sparkles className="h-4 w-4" aria-hidden />
                {t("Criar dados de exemplo")}
              </Button>
            ) : undefined
          }
        />
      </section>

      {/* Painel da conversa — centro */}
      {selected && selectedContact ? (
        <>
          <section
            className={cn("flex min-w-0 flex-1 flex-col", !selectedId && "hidden md:flex")}
          >
            <MessageThread
              conversation={selected}
              contact={selectedContact}
              messages={messages}
              loading={messagesLoading}
              readOnly={readOnly}
              onDeleteMessage={(id) => void handleDeleteMessage(id)}
              team={team}
              userId={userId}
              orgId={orgId}
              onBack={() => setSelectedId(null)}
              onSend={(content) => void handleSend(content)}
              onToggleResolve={() =>
                void patchConversation(
                  selected.id,
                  { status: selected.status === "open" ? "resolved" : "open" },
                  "Não foi possível atualizar o status."
                )
              }
              onToggleBotPause={() =>
                void patchConversation(
                  selected.id,
                  { bot_paused: !selected.bot_paused },
                  "Não foi possível pausar/retomar o bot."
                )
              }
              onAssign={(memberId) =>
                void patchConversation(
                  selected.id,
                  { assigned_to: memberId },
                  "Não foi possível atribuir a conversa."
                )
              }
              onShowContact={() => setContactModalOpen(true)}
              templates={templates}
              onAttach={(file) => void handleAttach(file)}
              attaching={attaching}
              flowName={selectedFlowName}
              connectionMode={selectedConnectionMode}
              connections={connections}
              onTakeOver={() => void handleTakeOver(selected)}
              onPauseFlow={() => void handlePauseFlow(selected)}
              onDismissSummary={() => void handleDismissSummary(selected)}
              orgLabels={orgLabels}
              activeLabels={convLabels[selected.id] ?? []}
              onToggleLabel={(labelId) => void handleToggleLabel(selected.id, labelId)}
            />
          </section>

          {/* Dados do contato em modal (telas menores que xl) */}
          <Modal
            open={contactModalOpen}
            onClose={() => setContactModalOpen(false)}
            title={t("Contato")}
            className="max-h-[85dvh] overflow-y-auto"
          >
            <ContactPanel
              contact={selectedContact}
              conversation={selected}
              team={team}
              conversationCount={selectedContactConversations}
              csatStats={selectedCsat}
              orgId={orgId}
              onUpdateContact={(patch) =>
                void handleUpdateContact(selectedContact.id, patch)
              }
              onToggleBlock={() => void handleToggleBlock(selectedContact)}
              onExportHistory={() => handleExportHistory(selectedContact)}
              onDeleteContact={() => void handleDeleteContact(selectedContact)}
            />
          </Modal>

          {/* Painel do contato — direita (desktop largo) */}
          <aside className="hidden w-72 shrink-0 border-l border-line bg-surface xl:block">
            <ContactPanel
              contact={selectedContact}
              conversation={selected}
              team={team}
              conversationCount={selectedContactConversations}
              csatStats={selectedCsat}
              orgId={orgId}
              onUpdateContact={(patch) =>
                void handleUpdateContact(selectedContact.id, patch)
              }
              onToggleBlock={() => void handleToggleBlock(selectedContact)}
              onExportHistory={() => handleExportHistory(selectedContact)}
              onDeleteContact={() => void handleDeleteContact(selectedContact)}
            />
          </aside>
        </>
      ) : (
        <section className="hidden flex-1 items-center justify-center md:flex">
          {isEmpty ? (
            <EmptyState
              icon={InboxIcon}
              title={t("Nenhuma conversa ainda")}
              description={t("Quando alguém mandar mensagem para o WhatsApp da sua empresa, a conversa aparece aqui em tempo real.")}
              action={
                seedEnabled ? (
                  <Button onClick={() => void handleSeed()} loading={seeding} variant="secondary">
                    <Sparkles className="h-4 w-4" aria-hidden />
                    {t("Criar dados de exemplo")}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <EmptyState
              icon={InboxIcon}
              title={t("Selecione uma conversa")}
              description={t("Escolha uma conversa na lista ao lado para ver as mensagens.")}
            />
          )}
        </section>
      )}

    </div>
  );
}
