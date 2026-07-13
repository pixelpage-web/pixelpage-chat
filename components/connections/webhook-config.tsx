"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  RefreshCw,
  Send,
  Sparkles,
  Wrench,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { cn, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CodeBlock } from "@/components/integrations/code-block";
import type { ExternalWebhookRow, WebhookLogRow } from "@/types/database";

function randomSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

type Tab = "platform" | "own";

export function WebhookConfig({
  connection,
  orgId,
  initialWebhook,
  initialLogs,
  appUrl,
  platformWorkflowUrl,
  hasApiKey,
  hasN8nKey,
}: {
  connection: { id: string; label: string };
  orgId: string;
  initialWebhook: ExternalWebhookRow | null;
  initialLogs: WebhookLogRow[];
  appUrl: string;
  platformWorkflowUrl: string;
  hasApiKey: boolean;
  hasN8nKey: boolean;
}) {
  const t = useT();
  const [webhook, setWebhook] = useState(initialWebhook);
  const [logs, setLogs] = useState(initialLogs);
  const [url, setUrl] = useState(
    initialWebhook && !initialWebhook.use_platform_workflow ? initialWebhook.url : ""
  );
  const [showSecret, setShowSecret] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(
    initialWebhook && !initialWebhook.use_platform_workflow ? "own" : "platform"
  );
  const [n8nApiKey, setN8nApiKey] = useState("");
  const [n8nKeyRevealed, setN8nKeyRevealed] = useState(!hasN8nKey);

  const payloadExample = `{
  "event": "message.received",
  "organization_id": "${orgId}",
  "conversation_id": "uuid-da-conversa",
  "contact": { "name": "Maria Silva", "phone": "5511999998888" },
  "message": {
    "id": "wamid.XXX",
    "text": "Oi, qual o horário de vocês?",
    "type": "text",
    "media_url": null,
    "timestamp": "2026-06-24T14:32:00.000Z"
  },
  "reply_token": "uuid-da-conversa.a1b2c3...",
  "app_url": "${appUrl}"
}`;

  const replyExample = `// No seu fluxo n8n, responda chamando a API da PixelPage Chat:
POST ${appUrl}/api/v1/messages
Authorization: Bearer SUA_API_KEY
Content-Type: application/json

{
  "reply_token": "{{ $json.reply_token }}",
  "text": "Atendemos de seg a sex, das 9h às 18h!"
}`;

  const verifyExample = `// Verifique a assinatura (Node/JS) antes de confiar no payload:
import { createHmac } from "crypto";

const assinatura = req.headers["x-pixelpage-signature"]; // "sha256=..."
const esperado =
  "sha256=" +
  createHmac("sha256", SEU_SECRET)
    .update(JSON.stringify(req.body), "utf8")
    .digest("hex");

if (assinatura !== esperado) {
  throw new Error("Assinatura inválida — descarte o evento.");
}`;

  /** Garante que existe uma linha external_webhooks para esta conexão. */
  async function ensureWebhook(
    patch: Partial<ExternalWebhookRow>
  ): Promise<ExternalWebhookRow | null> {
    const supabase = createClient();
    if (webhook) {
      const { data, error } = await supabase
        .from("external_webhooks")
        .update(patch)
        .eq("id", webhook.id)
        .select("*")
        .single();
      if (error || !data) return null;
      setWebhook(data);
      return data;
    }
    const { data, error } = await supabase
      .from("external_webhooks")
      .insert({
        org_id: orgId,
        connection_id: connection.id,
        url: patch.url ?? platformWorkflowUrl,
        secret: randomSecret(),
        ...patch,
      })
      .select("*")
      .single();
    if (error || !data) return null;
    setWebhook(data);
    return data;
  }

  // ----------------------------------------------------------------- Aba 1
  async function activatePlatform() {
    setBusy("platform");
    try {
      const created = await ensureWebhook({
        url: platformWorkflowUrl,
        use_platform_workflow: true,
        active: true,
      });
      if (!created) {
        toast.error(t("Não foi possível ativar o workflow."));
        return;
      }
      toast.success(t("Workflow pronto ativado!"));
    } catch {
      toast.error(t("Erro de conexão."));
    } finally {
      setBusy(null);
    }
  }

  // ----------------------------------------------------------------- Aba 2
  // Passa pela rota do servidor (não escreve mais direto em external_webhooks)
  // — validação de SSRF acontece lá antes de qualquer gravação.
  async function saveOwn() {
    const trimmed = url.trim();
    if (!/^https:\/\/.+/.test(trimmed)) {
      toast.error(t("Informe uma URL https:// válida."));
      return;
    }
    const trimmedN8nKey = n8nApiKey.trim();
    setBusy("save");
    try {
      const res = await fetch("/api/connections/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connection_id: connection.id,
          url: trimmed,
          ...(trimmedN8nKey ? { n8n_api_key: trimmedN8nKey } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as
        | ExternalWebhookRow
        | { error?: string };
      if (!res.ok) {
        toast.error(
          ("error" in data && data.error) || t("Não foi possível salvar o webhook.")
        );
        return;
      }
      setWebhook(data as ExternalWebhookRow);
      if (trimmedN8nKey) {
        setN8nApiKey("");
        setN8nKeyRevealed(false);
      }
      toast.success(t("Webhook salvo!"));
    } catch {
      toast.error(t("Erro de conexão."));
    } finally {
      setBusy(null);
    }
  }

  async function rotateSecret() {
    if (!webhook) return;
    setBusy("secret");
    try {
      const updated = await ensureWebhook({ secret: randomSecret() });
      if (updated) {
        setShowSecret(true);
        toast.success(t("Novo secret gerado — atualize seu n8n!"));
      }
    } finally {
      setBusy(null);
    }
  }

  async function sendTest() {
    if (!webhook) {
      toast.error(t("Salve o webhook antes de testar."));
      return;
    }
    setBusy("test");
    try {
      const res = await fetch("/api/integrations/webhook-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhook_id: webhook.id }),
      });
      const json = (await res.json()) as { error?: string; status_code?: number };
      if (!res.ok) toast.error(json.error ?? t("Falha no evento de teste."));
      else toast.success(`${t("Evento de teste entregue")} (HTTP ${json.status_code}).`);

      const supabase = createClient();
      const { data } = await supabase
        .from("webhook_logs")
        .select("*")
        .eq("webhook_id", webhook.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (data) setLogs(data);
    } catch {
      toast.error(t("Erro de conexão ao testar."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
        <div>
          <Link
            href="/app/connections"
            className="focus-ring inline-flex items-center gap-1.5 rounded text-xs text-txt-mut transition-colors hover:text-txt"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            {t("Voltar para Conexões")}
          </Link>
          <h1 className="mt-2 font-display text-lg font-semibold">
            {t("Webhook externo (n8n)")} · {connection.label}
          </h1>
          <p className="mt-0.5 text-sm text-txt-mut">
            {t("Escolha usar o workflow pronto da plataforma ou conectar o seu próprio n8n.")}
          </p>
        </div>

        {/* Abas */}
        <div className="flex gap-1 rounded-lg border border-line bg-surface p-1">
          {(
            [
              { id: "platform", label: t("Workflow pronto"), icon: Sparkles },
              { id: "own", label: t("Meu n8n"), icon: Wrench },
            ] as const
          ).map((tabItem) => (
            <button
              key={tabItem.id}
              onClick={() => setTab(tabItem.id)}
              className={cn(
                "focus-ring flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                tab === tabItem.id
                  ? "bg-lime-soft text-lime"
                  : "text-txt-mut hover:bg-surface-hover hover:text-txt"
              )}
            >
              <tabItem.icon className="h-4 w-4" aria-hidden />
              {tabItem.label}
            </button>
          ))}
        </div>

        {/* ---------------------------------------------------------- Aba 1 */}
        {tab === "platform" && (
          <Card>
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-lime-soft">
                <Sparkles className="h-5 w-5 text-lime" aria-hidden />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{t("Workflow PixelPage Chat")}</CardTitle>
                  <Badge tone="lime">{t("Recomendado")}</Badge>
                </div>
                <CardDescription>
                  {t("Use nosso workflow de atendimento com IA já configurado. Sem precisar de conta n8n própria.")}
                </CardDescription>
              </div>
            </div>

            <ul className="mt-4 space-y-1.5 text-sm text-txt-mut">
              {[
                "Bot com IA (Claude) respondendo automaticamente",
                "Histórico de conversas",
                "Transferência para humano",
                "Fácil de personalizar",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0 text-ok" aria-hidden />
                  {t(item)}
                </li>
              ))}
            </ul>

            {webhook?.use_platform_workflow ? (
              <div className="mt-5 space-y-4">
                <div className="flex items-center gap-2 rounded-lg border border-ok/30 bg-ok-soft px-3 py-2 text-xs text-ok">
                  <Check className="h-4 w-4 shrink-0" aria-hidden />
                  {t("Workflow pronto ativo para esta conexão.")}
                </div>

                <div>
                  <Label hint={t("endereço que recebe suas mensagens no n8n da plataforma")}>
                    {t("URL do workflow")}
                  </Label>
                  <CodeBlock code={platformWorkflowUrl} label="webhook url" />
                </div>

                {/* API key da org */}
                <div>
                  <Label>{t("API key da sua organização")}</Label>
                  {hasApiKey ? (
                    <p className="flex items-center gap-1.5 rounded-lg border border-line bg-ink px-3 py-2 text-xs text-txt-mut">
                      <KeyRound className="h-3.5 w-3.5 shrink-0 text-lime" aria-hidden />
                      {t("Sua API key já existe. O workflow usa o reply_token do evento — você não precisa colá-la em lugar nenhum.")}
                    </p>
                  ) : (
                    <Link
                      href="/app/integrations"
                      className="focus-ring flex items-center gap-1.5 rounded-lg border border-dashed border-line px-3 py-2 text-xs text-txt-mut transition-colors hover:border-lime/50 hover:text-lime"
                    >
                      <KeyRound className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {t("Gerar uma API key em Integrações (mostrada uma única vez)")}
                    </Link>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void sendTest()} loading={busy === "test"} variant="outline" size="sm">
                    <Send className="h-4 w-4" aria-hidden />
                    {t("Testar conexão")}
                  </Button>
                  <Link
                    href="/app/help"
                    className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 text-xs font-medium text-txt transition-colors hover:border-lime/50 hover:text-lime"
                  >
                    {t("Como personalizar (Central de Ajuda)")}
                  </Link>
                </div>
              </div>
            ) : (
              <Button onClick={() => void activatePlatform()} loading={busy === "platform"} className="mt-5">
                <Sparkles className="h-4 w-4" aria-hidden />
                {t("Ativar workflow pronto")}
              </Button>
            )}
          </Card>
        )}

        {/* ---------------------------------------------------------- Aba 2 */}
        {tab === "own" && (
          <Card>
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-soft">
                <Wrench className="h-5 w-5 text-amber" aria-hidden />
              </div>
              <div>
                <CardTitle>{t("Usar meu próprio n8n")}</CardTitle>
                <CardDescription>
                  {t("Cole a URL do webhook do seu workflow n8n. Você tem controle total sobre a lógica de atendimento.")}
                </CardDescription>
              </div>
            </div>

            {webhook && webhook.failures_count >= 3 && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft p-3 text-xs text-danger">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  {t("Seu webhook falhou")} {webhook.failures_count} {t("vezes seguidas")}
                  {webhook.last_status ? ` (HTTP ${webhook.last_status})` : ""}.{" "}
                  {t("Verifique se a URL do n8n está acessível.")}
                </span>
              </div>
            )}

            <div className="mt-5 space-y-4">
              <div>
                <Label htmlFor="own-url" hint={t("A URL pública do webhook no seu n8n")}>
                  {t("URL do webhook")}
                </Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="own-url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://seu-n8n.app.n8n.cloud/webhook/meu-bot"
                    className="flex-1"
                  />
                  <Button
                    onClick={() => void saveOwn()}
                    loading={busy === "save"}
                    variant="secondary"
                    disabled={!url.trim()}
                  >
                    {t("Salvar")}
                  </Button>
                </div>
                <p className="mt-1 text-[11px] text-txt-dim">
                  {t("Exemplo: https://seu-n8n.app.n8n.cloud/webhook/meu-bot")}
                </p>
              </div>

              <div>
                <Label
                  htmlFor="own-n8n-key"
                  hint={t(
                    "só necessário se seu n8n exigir autenticação — enviada como header Authorization: Bearer"
                  )}
                >
                  {t("Chave de autenticação (opcional)")}
                </Label>
                {!n8nKeyRevealed ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-line bg-ink px-3 py-2.5 text-xs text-txt-mut">
                    <span className="flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {t("Chave de autenticação configurada")}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setN8nApiKey("");
                        setN8nKeyRevealed(true);
                      }}
                      className="focus-ring rounded text-xs font-medium text-lime transition-colors hover:underline"
                    >
                      {t("Trocar")}
                    </button>
                  </div>
                ) : (
                  <Input
                    id="own-n8n-key"
                    type="password"
                    value={n8nApiKey}
                    onChange={(e) => setN8nApiKey(e.target.value)}
                    placeholder={t("Cole a chave/token exigida pelo seu n8n")}
                    autoComplete="off"
                  />
                )}
              </div>

              {webhook && !webhook.use_platform_workflow && (
                <>
                  <div>
                    <Label hint={t("use este segredo no seu n8n para verificar que veio da plataforma")}>
                      {t("Secret de assinatura")}
                    </Label>
                    <div className="flex items-center gap-2">
                      <code className="h-10 flex-1 truncate rounded-lg border border-line bg-ink px-3 leading-10 text-xs text-txt-mut">
                        {showSecret ? webhook.secret : "•".repeat(40)}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowSecret((v) => !v)}
                        aria-label={showSecret ? t("Ocultar secret") : t("Mostrar secret")}
                      >
                        {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => void rotateSecret()}
                        loading={busy === "secret"}
                        aria-label={t("Gerar novo secret")}
                        title={t("Gerar novo secret")}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <Button onClick={() => void sendTest()} loading={busy === "test"} variant="outline" size="sm">
                    <Send className="h-4 w-4" aria-hidden />
                    {t("Enviar evento de teste")}
                  </Button>
                </>
              )}

              {/* Documentação inline */}
              <details className="group rounded-lg border border-line">
                <summary className="focus-ring flex cursor-pointer select-none items-center gap-1.5 rounded-lg px-4 py-3 text-sm font-medium text-txt-mut transition-colors hover:text-txt">
                  <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {t("Como configurar seu n8n")}
                </summary>
                <div className="space-y-3 border-t border-line p-4">
                  <ol className="list-inside list-decimal space-y-1 text-xs leading-relaxed text-txt-mut">
                    <li>{t("No n8n, crie um novo workflow")}</li>
                    <li>{t("Adicione um nó “Webhook” com método POST")}</li>
                    <li>{t("Cole a URL gerada pelo n8n aqui no campo acima")}</li>
                    <li>{t("Para responder, faça POST em /api/v1/messages com sua API key")}</li>
                  </ol>
                  <p className="text-xs font-medium text-txt-mut">{t("Payload que você vai receber:")}</p>
                  <CodeBlock code={payloadExample} label={t("payload recebido")} />
                  <p className="text-xs font-medium text-txt-mut">{t("Como responder ao cliente:")}</p>
                  <CodeBlock code={replyExample} label={t("como responder")} />
                  <p className="text-xs font-medium text-txt-mut">
                    {t("Verificar a assinatura (opcional, mas recomendado):")}
                  </p>
                  <CodeBlock code={verifyExample} label={t("verificar assinatura")} />
                </div>
              </details>

              {/* Log dos últimos 20 disparos */}
              <div>
                <Label>{t("Últimos disparos")} ({logs.length})</Label>
                {logs.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-line p-3 text-center text-xs text-txt-dim">
                    {t("Nenhum disparo ainda — use o evento de teste acima.")}
                  </p>
                ) : (
                  <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                    {logs.map((log) => (
                      <li
                        key={log.id}
                        className="flex items-center justify-between gap-3 bg-ink px-3 py-2 text-xs"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <Badge tone={log.status_code && log.status_code < 400 ? "ok" : "danger"}>
                            {log.status_code ?? "ERR"}
                          </Badge>
                          <span className="truncate text-txt-mut">{log.event}</span>
                          {log.error && <span className="truncate text-danger">{log.error}</span>}
                        </div>
                        <span
                          className={cn(
                            "shrink-0 text-txt-dim",
                            log.response_ms && log.response_ms > 5000 && "text-amber"
                          )}
                        >
                          {log.response_ms != null && `${log.response_ms}ms · `}
                          {timeAgo(log.created_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
