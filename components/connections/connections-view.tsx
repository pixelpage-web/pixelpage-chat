"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock,
  Inbox,
  Loader2,
  Lock,
  QrCode,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  Trash2,
  Workflow,
  Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { cn, formatPhone, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { FeatureBadge } from "@/components/ui/feature-badge";
import { Modal } from "@/components/ui/modal";
import { Ticker } from "@/components/ui/Ticker";
import { IconBadge } from "@/components/ui/IconBadge";
import { QrConnectModal } from "@/components/whatsapp/qr-connect-modal";
import { QrConsentModal } from "./qr-consent-modal";
import { CsatSettingsModal } from "./csat-settings-modal";
import Link from "next/link";
import type { ConnectionMode, WhatsappConnectionRow } from "@/types/database";

const modes: {
  value: ConnectionMode;
  label: string;
  hint: string;
  icon: typeof Inbox;
}[] = [
  { value: "manual", label: "Manual", hint: "sua equipe responde", icon: Inbox },
  { value: "ai_bot", label: "Bot IA", hint: "responde sozinho", icon: Bot },
  {
    value: "external_webhook",
    label: "Webhook",
    hint: "encaminha pro n8n",
    icon: Workflow,
  },
];

const statusMeta: Record<
  WhatsappConnectionRow["status"],
  { label: string; tone: "ok" | "amber" | "danger" }
> = {
  connected: { label: "Conectado", tone: "ok" },
  pending: { label: "Pendente", tone: "amber" },
  disconnected: { label: "Desconectado", tone: "danger" },
  error: { label: "Erro", tone: "danger" },
};

/** Status do webhook externo por conexão, calculado no servidor. */
export interface WebhookInfo {
  id: string;
  status: "ok" | "warn" | "down" | "idle";
  lastStatus: number | null;
}

export function ConnectionsView({
  orgId,
  initialConnections,
  connectionsLimit,
  qrEnabled,
  hasMetaApi,
  limitOverride = false,
  webhookInfo = {},
  showWebhookMode = true,
}: {
  orgId: string;
  initialConnections: WhatsappConnectionRow[];
  /** null = plano sem limite de conexões */
  connectionsLimit: number | null;
  qrEnabled: boolean;
  hasMetaApi: boolean;
  /** Super Admin: ignora o limite de conexões do plano (exibe badge) */
  limitOverride?: boolean;
  /** Status do webhook externo por connection_id (modo external_webhook) */
  webhookInfo?: Record<string, WebhookInfo>;
  /** false = plano básico (Free/Starter) — some "Webhook" do seletor de modo */
  showWebhookMode?: boolean;
}) {
  const router = useRouter();
  const t = useT();
  const [connections, setConnections] = useState(initialConnections);

  // Realtime: status da conexão muda (QR escaneado, sessão caiu etc.) sem
  // precisar de F5 — a tela ficava presa em "nenhum número conectado" até
  // reload manual porque não havia nenhum listener aqui (router.refresh() no
  // onConnected do QrConnectModal atualiza os dados do server component, mas
  // não resincroniza o useState local, que só lê initialConnections na 1ª
  // montagem).
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`connections-${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_connections",
          filter: `org_id=eq.${orgId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as WhatsappConnectionRow;
            setConnections((prev) =>
              prev.some((c) => c.id === row.id) ? prev : [...prev, row]
            );
          } else if (payload.eventType === "UPDATE") {
            const row = payload.new as WhatsappConnectionRow;
            setConnections((prev) =>
              prev.map((c) => (c.id === row.id ? { ...c, ...row } : c))
            );
          } else if (payload.eventType === "DELETE") {
            const oldRow = payload.old as { id: string };
            setConnections((prev) => prev.filter((c) => c.id !== oldRow.id));
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orgId]);
  const [qrOpen, setQrOpen] = useState(false);
  // Modal de aceite obrigatório antes de abrir o QR Code (WhatsApp Web não oficial)
  const [consentOpen, setConsentOpen] = useState(false);
  const [reconnectId, setReconnectId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [logoutConfirmId, setLogoutConfirmId] = useState<string | null>(null);
  const [csatConnectionId, setCsatConnectionId] = useState<string | null>(null);
  const [testingWebhookId, setTestingWebhookId] = useState<string | null>(null);

  const metaConn = connections.find((c) => c.connection_type === "meta_api") ?? null;
  const metaConnected = metaConn?.status === "connected";

  // Teste rápido do webhook externo direto na listagem (Tarefa 4)
  async function quickTestWebhook(webhookId: string) {
    setTestingWebhookId(webhookId);
    try {
      const res = await fetch("/api/integrations/webhook-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhook_id: webhookId }),
      });
      const json = (await res.json().catch(() => null)) as
        | { error?: string; status_code?: number }
        | null;
      if (!res.ok) toast.error(json?.error ?? t("Falha no evento de teste."));
      else toast.success(`${t("Evento de teste entregue")} (HTTP ${json?.status_code}).`);
    } catch {
      toast.error(t("Erro de conexão ao testar."));
    } finally {
      setTestingWebhookId(null);
    }
  }

  async function qrAction(
    connection: WhatsappConnectionRow,
    action: "logout" | "delete"
  ) {
    setBusyId(connection.id);
    try {
      if (connection.connection_type === "qr_code") {
        const res = await fetch("/api/whatsapp/qr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, connection_id: connection.id }),
        });
        if (!res.ok) {
          const json = (await res.json().catch(() => null)) as { error?: string } | null;
          toast.error(json?.error ?? t("Erro de conexão."));
          return;
        }
      } else if (action === "delete") {
        const res = await fetch(`/api/connections/${connection.id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const json = (await res.json().catch(() => null)) as { error?: string } | null;
          toast.error(json?.error ?? t("Não foi possível excluir a conexão."));
          return;
        }
      }
      if (action === "delete") {
        setConnections((prev) => prev.filter((c) => c.id !== connection.id));
        toast.success(t("Conexão excluída."));
      } else {
        setConnections((prev) =>
          prev.map((c) =>
            c.id === connection.id ? { ...c, status: "disconnected" } : c
          )
        );
        toast.success(t("Sessão desconectada."));
      }
    } catch {
      toast.error(t("Erro de conexão."));
    } finally {
      setBusyId(null);
    }
  }

  async function changeMode(id: string, mode: ConnectionMode) {
    const previous = connections;
    setConnections((prev) => prev.map((c) => (c.id === id ? { ...c, mode } : c)));
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("whatsapp_connections")
        .update({ mode })
        .eq("id", id);
      if (error) {
        setConnections(previous);
        toast.error(t("Não foi possível trocar o modo."));
      } else {
        const label = modes.find((m) => m.value === mode)?.label ?? mode;
        toast.success(`${t("Modo alterado para")} ${t(label)}.`);
      }
    } catch {
      setConnections(previous);
      toast.error(t("Erro de conexão."));
    }
  }

  const overLimit = connectionsLimit !== null && connections.length >= connectionsLimit;
  const canAddMore = !overLimit || limitOverride;
  const visibleModes = modes.filter((m) => showWebhookMode || m.value !== "external_webhook");

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-lg font-semibold">{t("Conexões WhatsApp")}</h1>
              {limitOverride && overLimit && <FeatureBadge requiredPlan={t("superior")} />}
            </div>
            {connectionsLimit === null ? (
              <p className="mt-0.5 text-sm text-txt-mut">
                {connections.length} {connections.length === 1 ? t("conexão ativa") : t("conexões ativas")}
              </p>
            ) : (
              <p className="mt-0.5 text-sm text-txt-mut">
                {connections.length} {t("de")} {connectionsLimit}{" "}
                {connectionsLimit === 1 ? t("conexão") : t("conexões")} {t("do seu plano")}
              </p>
            )}
          </div>
        </header>

        {/* Conectar novo número — dois modos lado a lado */}
        {canAddMore ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {/* QR Code (Evolution API) */}
            <Card
              className={cn(
                "group relative",
                !qrEnabled && "opacity-70"
              )}
            >
              <div className="flex items-start gap-3">
                <IconBadge icon={QrCode} />
                <div>
                  <CardTitle>QR Code</CardTitle>
                  <CardDescription>
                    {t("Conecta em segundos, qualquer número — sem burocracia.")}
                  </CardDescription>
                </div>
              </div>

              <ul className="mt-4 space-y-2 text-xs leading-relaxed text-txt-mut">
                <li className="flex items-start gap-2">
                  <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-lime" aria-hidden />
                  {t("Ideal para começar ou testar — sem espera de aprovação.")}
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-txt-dim" aria-hidden />
                  {t("Não é a API oficial — o número segue as regras do WhatsApp comum.")}
                </li>
                <li className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" aria-hidden />
                  {t("Envio em volume alto ou disparo em massa aumenta o risco de bloqueio.")}
                </li>
              </ul>

              {qrEnabled ? (
                <Button
                  onClick={() => {
                    // Aceite obrigatório antes de iniciar a conexão QR
                    setReconnectId(null);
                    setConsentOpen(true);
                  }}
                  className="mt-4 w-full"
                >
                  <QrCode className="h-4 w-4" aria-hidden />
                  {t("Conectar agora")}
                </Button>
              ) : (
                <p className="mt-4 rounded-lg border border-dashed border-line p-2.5 text-center text-xs text-txt-dim">
                  {t("Indisponível — Evolution API não configurada pelo administrador.")}
                </p>
              )}
            </Card>

            {/* API Oficial Meta — reflete o estado real da org (mesma fonte de
                dado da página dedicada /app/connections/api-oficial): bloqueado
                sem plano Pro, CTA para conectar, ou resumo quando já ativo. */}
            <Card
              className={cn(
                "relative overflow-hidden",
                !hasMetaApi && "opacity-90"
              )}
            >
              {/* Glow decorativo no canto — reforça "upgrade premium" sem poluir */}
              <div
                className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-lime/10 blur-2xl"
                aria-hidden
              />

              <div className="relative flex items-start gap-3">
                <IconBadge icon={ShieldCheck} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle>{t("API Oficial Meta")}</CardTitle>
                    <Badge tone="lime" className="gap-1">
                      <Sparkles className="h-2.5 w-2.5" aria-hidden />
                      {t("Recomendado")}
                    </Badge>
                  </div>
                  <CardDescription>
                    {t("Licenciada pela Meta — verificação oficial, sem risco de ban por volume.")}
                  </CardDescription>
                  <p className="mt-1 text-[11px] text-txt-dim">
                    {t("PixelPage Chat é Tech Provider oficial Meta")}
                  </p>
                </div>
              </div>

              {/* Plano não inclui Meta API */}
              {!hasMetaApi && (
                <div className="relative mt-4 flex flex-col items-center gap-3 rounded-lg border border-dashed border-line py-5 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-hover">
                    <Lock className="h-5 w-5 text-txt-dim" aria-hidden />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{t("Benefício do plano Pro")}</p>
                    <p className="mt-0.5 max-w-[230px] text-xs text-txt-mut">
                      {t("Faça upgrade para conectar um número com a API oficial da Meta.")}
                    </p>
                  </div>
                  <Link
                    href="/app/billing"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-lime px-3.5 py-1.5 text-xs font-semibold text-black transition-opacity hover:opacity-90"
                  >
                    {t("Ver planos")}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </div>
              )}

              {/* Pro, já conectado — resumo + gerenciar na página dedicada */}
              {hasMetaApi && metaConnected && (
                <div className="relative mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-ok/30 bg-ok-soft p-3">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-ok" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {metaConn!.phone_display ? formatPhone(metaConn!.phone_display) : metaConn!.label}
                    </p>
                    <p className="text-xs text-txt-mut">
                      {metaConn!.connected_at
                        ? `${t("Conectado")} ${timeAgo(metaConn!.connected_at)}`
                        : t("Conectado")}
                    </p>
                  </div>
                  <Link
                    href="/app/connections/api-oficial"
                    className="focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-txt transition-colors hover:border-ok/50 hover:text-ok"
                  >
                    <Settings2 className="h-3.5 w-3.5" aria-hidden />
                    {t("Gerenciar")}
                  </Link>
                </div>
              )}

              {/* Pro, sem conexão ainda (ou pendente/erro — o detalhe fica na
                  página dedicada, que já lida com cada estado) */}
              {hasMetaApi && !metaConnected && (
                <>
                  <ul className="relative mt-4 space-y-2 text-xs leading-relaxed text-txt-mut">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" aria-hidden />
                      {t("Qualquer volume de envio, dentro das políticas de mensageria da Meta.")}
                    </li>
                    <li className="flex items-start gap-2">
                      <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" aria-hidden />
                      {t("Mais rápido com um número limpo, sem WhatsApp pessoal ativo.")}
                    </li>
                    <li className="flex items-start gap-2">
                      <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" aria-hidden />
                      {t("Já usa o número? Desative o WhatsApp pessoal e aguarde ~5 min antes de conectar.")}
                    </li>
                  </ul>
                  {metaConn?.status === "error" && (
                    <p className="relative mt-3 flex items-center gap-1.5 text-[11px] text-danger">
                      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                      {t("A última tentativa falhou — clique para ver o detalhe e tentar de novo.")}
                    </p>
                  )}
                  <Link
                    href="/app/connections/api-oficial"
                    className="focus-ring relative mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg bg-lime px-3 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90"
                  >
                    <ShieldCheck className="h-4 w-4" aria-hidden />
                    {t("Conectar agora")}
                  </Link>
                </>
              )}
            </Card>
          </div>
        ) : (
          <Card className="border-amber/25">
            <p className="text-sm text-amber">
              {t("Você atingiu o limite de conexões do seu plano.")}{" "}
              <a href="/app/billing" className="underline">
                {t("Faça upgrade")}
              </a>{" "}
              {t("para conectar mais números.")}
            </p>
          </Card>
        )}

        {/* Divisor (item B) */}
        <div className="-mx-4 sm:-mx-6">
          <Ticker />
        </div>

        {/* Lista de conexões */}
        {connections.length === 0 ? (
          <EmptyState
            icon={Smartphone}
            title={t("Nenhum número conectado")}
            description={t("Quando você conectar o WhatsApp da sua empresa, ele aparece aqui com o modo de resposta configurável.")}
          />
        ) : (
          <div className="space-y-3">
            {connections.map((conn) => {
              const status = statusMeta[conn.status];
              return (
                <Card key={conn.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <IconBadge icon={Smartphone} size="sm" />
                      <div>
                        <p className="text-sm font-semibold">{conn.label}</p>
                        <p className="text-xs text-txt-dim">
                          {conn.phone_display
                            ? formatPhone(conn.phone_display)
                            : t("número pendente")}
                          {conn.connected_at &&
                            ` · ${t("conectado")} ${timeAgo(conn.connected_at)}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone="neutral">
                        {conn.connection_type === "qr_code" ? "QR Code" : "API Meta"}
                      </Badge>
                      <Badge tone={status.tone}>{t(status.label)}</Badge>
                    </div>
                  </div>

                  {/* Ações da conexão */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {conn.connection_type === "qr_code" &&
                      conn.status !== "connected" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={busyId === conn.id}
                          onClick={() => {
                            setReconnectId(conn.id);
                            setQrOpen(true);
                          }}
                        >
                          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                          {t("Reconectar")}
                        </Button>
                      )}
                    {conn.connection_type === "qr_code" &&
                      conn.status === "connected" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={busyId === conn.id}
                          onClick={() => setLogoutConfirmId(conn.id)}
                        >
                          {t("Desconectar sessão")}
                        </Button>
                      )}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setCsatConnectionId(conn.id)}
                    >
                      <Star
                        className={cn(
                          "h-3.5 w-3.5",
                          conn.csat_enabled ? "text-lime" : "text-txt-dim"
                        )}
                        aria-hidden
                      />
                      CSAT
                      {conn.csat_enabled && (
                        <span className="ml-0.5 text-[10px] text-lime">{t("ativo")}</span>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-txt-dim hover:text-danger"
                      loading={busyId === conn.id}
                      onClick={() => {
                        if (
                          window.confirm(
                            t("Excluir esta conexão? As conversas existentes são mantidas.")
                          )
                        ) {
                          void qrAction(conn, "delete");
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      {t("Excluir")}
                    </Button>
                  </div>

                  {/* Modo de resposta por conexão */}
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-medium text-txt-mut">
                      {t("Modo de resposta")}
                    </p>
                    <div className={cn("grid gap-2", visibleModes.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
                      {visibleModes.map((mode) => (
                        <button
                          key={mode.value}
                          onClick={() => void changeMode(conn.id, mode.value)}
                          className={cn(
                            "focus-ring rounded-lg border p-2.5 text-left transition-colors",
                            conn.mode === mode.value
                              ? "border-lime/60 bg-lime-soft"
                              : "border-line bg-surface-raised hover:border-line-strong"
                          )}
                        >
                          <mode.icon
                            className={cn(
                              "h-4 w-4",
                              conn.mode === mode.value ? "text-lime" : "text-txt-dim"
                            )}
                            aria-hidden
                          />
                          <p
                            className={cn(
                              "mt-1.5 text-xs font-semibold",
                              conn.mode === mode.value ? "text-lime" : "text-txt"
                            )}
                          >
                            {t(mode.label)}
                          </p>
                          <p className="text-[10px] leading-tight text-txt-dim">
                            {t(mode.hint)}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Status do webhook externo + configuração (modo Webhook) */}
                  {conn.mode === "external_webhook" &&
                    (() => {
                      const info = webhookInfo[conn.id];
                      const meta = {
                        ok: { dot: "bg-ok", label: t("Ativo") },
                        warn: { dot: "bg-amber", label: t("Com falhas") },
                        down: { dot: "bg-danger", label: t("Offline") },
                        idle: { dot: "bg-txt-dim", label: t("Aguardando configuração") },
                      }[info?.status ?? "idle"];
                      return (
                        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-3">
                          <span className="flex items-center gap-1.5 text-xs text-txt-mut">
                            <span className={cn("h-2 w-2 rounded-full", meta.dot)} aria-hidden />
                            {t("Webhook")}: {meta.label}
                            {info?.lastStatus ? ` · HTTP ${info.lastStatus}` : ""}
                          </span>
                          <div className="ml-auto flex gap-2">
                            {info?.id && (
                              <Button
                                size="sm"
                                variant="ghost"
                                loading={testingWebhookId === info.id}
                                onClick={() => void quickTestWebhook(info.id)}
                              >
                                {t("Testar")}
                              </Button>
                            )}
                            <Link
                              href={`/app/connections/${conn.id}/webhook`}
                              className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-medium text-txt transition-colors hover:border-lime/50 hover:text-lime"
                            >
                              <Workflow className="h-3.5 w-3.5" aria-hidden />
                              {t("Configurar webhook")}
                            </Link>
                          </div>
                        </div>
                      );
                    })()}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Aceite obrigatório → só então abre o QR Code */}
      <QrConsentModal
        open={consentOpen}
        onClose={() => setConsentOpen(false)}
        onAccept={() => {
          setConsentOpen(false);
          setQrOpen(true);
        }}
      />

      {/* Modal de QR Code ao vivo (criar nova ou reconectar) */}
      <QrConnectModal
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        existingConnectionId={reconnectId}
        onConnected={() => {
          setQrOpen(false);
          router.refresh();
        }}
      />

      {/* Confirmação antes de desconectar — as conversas somem do Inbox
          (arquivadas, não excluídas) e voltam sozinhas se reconectar */}
      <Modal
        open={!!logoutConfirmId}
        onClose={() => setLogoutConfirmId(null)}
        title={t("Desconectar sessão")}
      >
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber" aria-hidden />
          <p className="text-sm leading-relaxed text-txt-mut">
            {t(
              "Ao desconectar, todas as mensagens desta conexão serão removidas do Inbox. Os contatos serão mantidos. Deseja continuar?"
            )}
          </p>
        </div>
        <div className="mt-4 flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => setLogoutConfirmId(null)}
          >
            {t("Cancelar")}
          </Button>
          {/* Botão custom (não usa o <Button> compartilhado) — os variants
              dele já trazem bg-lime/border-lime, que colidiriam com o
              laranja pedido aqui já que cn() é só clsx, sem merge de
              utilities conflitantes. */}
          <button
            type="button"
            disabled={busyId === logoutConfirmId}
            onClick={() => {
              const connection = connections.find((c) => c.id === logoutConfirmId);
              setLogoutConfirmId(null);
              if (connection) void qrAction(connection, "logout");
            }}
            className="focus-ring inline-flex h-10 flex-1 select-none items-center justify-center gap-2 rounded-lg bg-brand text-sm font-semibold text-white transition-colors hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busyId === logoutConfirmId && (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            )}
            {t("Desconectar e limpar")}
          </button>
        </div>
      </Modal>

      {/* Configuração de CSAT por conexão */}
      {csatConnectionId &&
        (() => {
          const conn = connections.find((c) => c.id === csatConnectionId);
          if (!conn) return null;
          return (
            <CsatSettingsModal
              key={conn.id}
              connection={conn}
              open
              onClose={() => setCsatConnectionId(null)}
              onSaved={(patch) =>
                setConnections((prev) =>
                  prev.map((c) => (c.id === conn.id ? { ...c, ...patch } : c))
                )
              }
            />
          );
        })()}
    </div>
  );
}
