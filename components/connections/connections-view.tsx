"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Bot,
  Clock,
  Inbox,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Star,
  Trash2,
  Workflow,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { cn, formatPhone, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { FeatureBadge } from "@/components/ui/feature-badge";
import { EmbeddedSignupButton } from "@/components/whatsapp/embedded-signup-button";
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
};

/** Status do webhook externo por conexão, calculado no servidor. */
export interface WebhookInfo {
  id: string;
  status: "ok" | "warn" | "down" | "idle";
  lastStatus: number | null;
}

export function ConnectionsView({
  initialConnections,
  connectionsLimit,
  signupEnabled,
  qrEnabled,
  limitOverride = false,
  webhookInfo = {},
}: {
  initialConnections: WhatsappConnectionRow[];
  connectionsLimit: number;
  signupEnabled: boolean;
  qrEnabled: boolean;
  /** Super Admin: ignora o limite de conexões do plano (exibe badge) */
  limitOverride?: boolean;
  /** Status do webhook externo por connection_id (modo external_webhook) */
  webhookInfo?: Record<string, WebhookInfo>;
}) {
  const router = useRouter();
  const t = useT();
  const [connections, setConnections] = useState(initialConnections);
  const [qrOpen, setQrOpen] = useState(false);
  // Modal de aceite obrigatório antes de abrir o QR Code (WhatsApp Web não oficial)
  const [consentOpen, setConsentOpen] = useState(false);
  const [reconnectId, setReconnectId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [csatConnectionId, setCsatConnectionId] = useState<string | null>(null);
  const [testingWebhookId, setTestingWebhookId] = useState<string | null>(null);

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
        const supabase = createClient();
        const { error } = await supabase
          .from("whatsapp_connections")
          .delete()
          .eq("id", connection.id);
        if (error) {
          toast.error(t("Não foi possível excluir a conexão."));
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

  const overLimit = connections.length >= connectionsLimit;
  const canAddMore = !overLimit || limitOverride;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-lg font-semibold">{t("Conexões WhatsApp")}</h1>
              {limitOverride && overLimit && <FeatureBadge requiredPlan={t("superior")} />}
            </div>
            <p className="mt-0.5 text-sm text-txt-mut">
              {connections.length} {t("de")} {connectionsLimit}{" "}
              {connectionsLimit === 1 ? t("conexão") : t("conexões")} {t("do seu plano")}
            </p>
          </div>
        </header>

        {/* Conectar novo número — dois modos lado a lado */}
        {canAddMore ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {/* QR Code (Evolution API) */}
            <Card className={cn(!qrEnabled && "opacity-70")}>
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-lime-soft">
                  <QrCode className="h-5 w-5 text-lime" aria-hidden />
                </div>
                <div>
                  <CardTitle>QR Code</CardTitle>
                  <CardDescription>
                    {t("Conecta em segundos, qualquer número — sem burocracia.")}
                  </CardDescription>
                </div>
              </div>
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

            {/* API Oficial Meta */}
            <Card className={cn(!signupEnabled && "opacity-70")}>
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ok-soft">
                  <ShieldCheck className="h-5 w-5 text-ok" aria-hidden />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle>{t("API Oficial Meta")}</CardTitle>
                    {!signupEnabled && <Badge tone="amber">{t("Em breve")}</Badge>}
                  </div>
                  <CardDescription>
                    {t("Número verificado, templates aprovados e campanhas oficiais.")}
                  </CardDescription>
                </div>
              </div>
              {/* Benefícios da API oficial */}
              <ul className="mt-3 space-y-1 text-xs text-txt-mut">
                <li>✅ {t("Número verificado com ✓ verde")}</li>
                <li>✅ {t("Templates aprovados pela Meta")}</li>
                <li>✅ {t("Campanhas oficiais e zero risco de ban")}</li>
              </ul>

              {signupEnabled ? (
                <div className="mt-4 space-y-2">
                  {/* Sub-caminho 1: conectar número existente (Embedded Signup) */}
                  <EmbeddedSignupButton onConnected={() => router.refresh()} />
                  {/* Sub-caminho 2: quero um número novo com API oficial */}
                  <Link
                    href="/app/connections/api-oficial"
                    className="focus-ring flex w-full items-center justify-center gap-1.5 rounded-lg border border-line-strong px-3 py-2 text-xs font-medium text-txt transition-colors hover:border-ok/50 hover:text-ok"
                  >
                    {t("Quero um número novo com API oficial")}
                  </Link>
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  <p className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-line p-2.5 text-center text-xs text-txt-dim">
                    <Clock className="h-3.5 w-3.5" aria-hidden />
                    {t("Conexão do seu número em análise na Meta — use QR Code por enquanto.")}
                  </p>
                  {/* Venda de número novo com API oficial sempre disponível */}
                  <Link
                    href="/app/connections/api-oficial"
                    className="focus-ring flex w-full items-center justify-center gap-1.5 rounded-lg bg-ok-soft px-3 py-2 text-xs font-medium text-ok transition-colors hover:bg-ok/20"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                    {t("Quero um número novo com API oficial")}
                  </Link>
                </div>
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
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ok-soft">
                        <Smartphone className="h-5 w-5 text-ok" aria-hidden />
                      </div>
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
                          onClick={() => void qrAction(conn, "logout")}
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
                    <div className="grid grid-cols-3 gap-2">
                      {modes.map((mode) => (
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
