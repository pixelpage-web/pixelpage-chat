"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Eye, EyeOff, RefreshCw, Send, Workflow } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { cn, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { CodeBlock } from "./code-block";
import type { ExternalWebhookRow, WebhookLogRow } from "@/types/database";

function randomSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const payloadExample = `{
  "event": "message.received",
  "organization_id": "uuid-da-sua-org",
  "conversation_id": "uuid-da-conversa",
  "contact": { "name": "Maria Silva", "phone": "5511999998888" },
  "message": {
    "id": "wamid.XXX",
    "text": "Oi, qual o horário de vocês?",
    "type": "text",
    "timestamp": "2026-06-10T14:32:00.000Z"
  },
  "reply_token": "uuid-da-conversa.a1b2c3..."
}`;

export function WebhookCard({
  orgId,
  initialWebhook,
  initialLogs,
  appUrl,
}: {
  orgId: string;
  initialWebhook: ExternalWebhookRow | null;
  initialLogs: WebhookLogRow[];
  appUrl: string;
}) {
  const t = useT();
  const [webhook, setWebhook] = useState(initialWebhook);
  const [logs, setLogs] = useState(initialLogs);
  const [url, setUrl] = useState(initialWebhook?.url ?? "");
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const replyExample = `// No seu fluxo n8n, responda chamando a API da PixelPage Chat:
POST ${appUrl}/api/v1/messages
Authorization: Bearer SUA_API_KEY
Content-Type: application/json

{
  "reply_token": "{{ $json.reply_token }}",
  "text": "Atendemos de seg a sex, das 9h às 18h!"
}`;

  async function handleSave() {
    const trimmed = url.trim();
    if (!/^https:\/\/.+/.test(trimmed)) {
      toast.error(t("Informe uma URL https:// válida."));
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      if (webhook) {
        const { error } = await supabase
          .from("external_webhooks")
          .update({ url: trimmed })
          .eq("id", webhook.id);
        if (error) {
          toast.error(t("Não foi possível salvar o webhook."));
          return;
        }
        setWebhook({ ...webhook, url: trimmed });
      } else {
        const { data, error } = await supabase
          .from("external_webhooks")
          .insert({ org_id: orgId, url: trimmed, secret: randomSecret() })
          .select("*")
          .single();
        if (error || !data) {
          toast.error(t("Não foi possível criar o webhook."));
          return;
        }
        setWebhook(data);
      }
      toast.success(t("Webhook salvo!"));
    } catch {
      toast.error(t("Erro de conexão ao salvar."));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(active: boolean) {
    if (!webhook) return;
    const previous = webhook;
    setWebhook({ ...webhook, active });
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("external_webhooks")
        .update({ active })
        .eq("id", webhook.id);
      if (error) {
        setWebhook(previous);
        toast.error(t("Não foi possível atualizar o webhook."));
      }
    } catch {
      setWebhook(previous);
      toast.error(t("Erro de conexão."));
    }
  }

  async function handleRotateSecret() {
    if (!webhook) return;
    const secret = randomSecret();
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("external_webhooks")
        .update({ secret })
        .eq("id", webhook.id);
      if (error) {
        toast.error(t("Não foi possível gerar um novo secret."));
        return;
      }
      setWebhook({ ...webhook, secret });
      setShowSecret(true);
      toast.success(t("Novo secret gerado — atualize seu n8n!"));
    } catch {
      toast.error(t("Erro de conexão."));
    }
  }

  async function handleTest() {
    if (!webhook) return;
    setTesting(true);
    try {
      const res = await fetch("/api/integrations/webhook-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhook_id: webhook.id }),
      });
      const json = (await res.json()) as { error?: string; status_code?: number };
      if (!res.ok) {
        toast.error(json.error ?? t("Falha no evento de teste."));
      } else {
        toast.success(`${t("Evento de teste entregue")} (HTTP ${json.status_code}).`);
      }
      // Atualiza o log
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
      setTesting(false);
    }
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-soft">
            <Workflow className="h-5 w-5 text-amber" aria-hidden />
          </div>
          <div>
            <CardTitle>{t("Webhook externo (n8n)")}</CardTitle>
            <CardDescription>
              {t("Cada mensagem recebida é encaminhada para o SEU n8n — ilimitado em todos os planos.")}
            </CardDescription>
          </div>
        </div>
        {webhook && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-txt-mut">
              {webhook.active ? t("Ativo") : t("Pausado")}
            </span>
            <Switch
              checked={webhook.active}
              onChange={(v) => void handleToggleActive(v)}
              label={t("Webhook ativo")}
            />
          </div>
        )}
      </div>

      {webhook && webhook.failures_count >= 3 && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft p-3 text-xs text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {t("Seu webhook falhou")} {webhook.failures_count}{" "}
            {t("vezes seguidas")}
            {webhook.last_status ? ` (${t("último status:")} HTTP ${webhook.last_status})` : ""}.{" "}
            {t("Verifique se a URL do n8n está acessível.")}
          </span>
        </div>
      )}

      <div className="mt-5 space-y-4">
        <div>
          <Label htmlFor="webhook-url">{t("URL do webhook do seu n8n")}</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="webhook-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://seu-n8n.com/webhook/zari"
              className="flex-1"
            />
            <Button
              onClick={() => void handleSave()}
              loading={saving}
              variant="secondary"
              disabled={!url.trim() || url.trim() === webhook?.url}
            >
              {t("Salvar")}
            </Button>
          </div>
        </div>

        {webhook && (
          <>
            <div>
              <Label hint={t("usado na assinatura HMAC SHA-256 (header X-Zari-Signature)")}>
                {t("Secret de assinatura")}
              </Label>
              <div className="flex items-center gap-2">
                <code className="focus-ring h-10 flex-1 truncate rounded-lg border border-line bg-ink px-3 leading-10 text-xs text-txt-mut">
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
                  onClick={() => void handleRotateSecret()}
                  aria-label={t("Gerar novo secret")}
                  title={t("Gerar novo secret")}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <Button onClick={() => void handleTest()} loading={testing} variant="outline" size="sm">
              <Send className="h-4 w-4" aria-hidden />
              {t("Enviar evento de teste")}
            </Button>

            {/* Documentação inline */}
            <details className="group rounded-lg border border-line">
              <summary className="focus-ring cursor-pointer select-none rounded-lg px-4 py-3 text-sm font-medium text-txt-mut transition-colors hover:text-txt">
                📖 {t("Documentação: payload e como responder")}
              </summary>
              <div className="space-y-3 border-t border-line p-4">
                <p className="text-xs leading-relaxed text-txt-mut">
                  {t("A cada mensagem recebida no WhatsApp, enviamos um")}{" "}
                  <code className="text-lime">POST</code>{" "}
                  {t("para a sua URL com este corpo (assinado com HMAC SHA-256 do corpo no header")}{" "}
                  <code className="text-lime">X-Zari-Signature</code>):
                </p>
                <CodeBlock code={payloadExample} label={t("payload recebido")} />
                <p className="text-xs leading-relaxed text-txt-mut">
                  {t("Para responder ao cliente, seu fluxo chama a API pública da PixelPage Chat usando o")}{" "}
                  <code className="text-lime">reply_token</code>:
                </p>
                <CodeBlock code={replyExample} label={t("como responder")} />
              </div>
            </details>

            {/* Log dos últimos disparos */}
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
                        <Badge
                          tone={
                            log.status_code && log.status_code < 400 ? "ok" : "danger"
                          }
                        >
                          {log.status_code ?? "ERR"}
                        </Badge>
                        <span className="truncate text-txt-mut">{log.event}</span>
                        {log.error && (
                          <span className="truncate text-danger">{log.error}</span>
                        )}
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
          </>
        )}
      </div>
    </Card>
  );
}
