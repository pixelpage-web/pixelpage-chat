"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Bot,
  KeyRound,
  Lock,
  MessageSquare,
  PlugZap,
  QrCode,
  Trash2,
  Workflow,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { HelpTip } from "@/components/ui/help-tip";
import { CodeBlock } from "@/components/integrations/code-block";
import type { Json } from "@/types/database";

interface EnvFlags {
  claude_api_key: boolean;
  claude_model: boolean;
  claude_max_tokens: boolean;
  claude_temperature: boolean;
  meta_app_id: boolean;
  meta_verify_token: boolean;
  meta_system_token: boolean;
  evolution_url: boolean;
  evolution_key: boolean;
}

interface AdminApiKey {
  id: string;
  label: string;
  last_used_at: string | null;
  created_at: string;
  org_name: string;
}

/** Botão "Testar conexão" dos blocos de integração. */
function TestButton({ type }: { type: "claude" | "evolution" | "meta" }) {
  const [testing, setTesting] = useState(false);
  async function run() {
    setTesting(true);
    try {
      const res = await fetch("/api/admin/test-integration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const json = (await res.json()) as { ok?: boolean; detail?: string; error?: string };
      if (json.ok) toast.success(json.detail ?? "Conexão OK!");
      else toast.error(json.detail ?? json.error ?? "Falha no teste.");
    } catch {
      toast.error("Erro de conexão ao testar.");
    } finally {
      setTesting(false);
    }
  }
  return (
    <Button onClick={() => void run()} loading={testing} variant="outline" size="sm">
      <PlugZap className="h-3.5 w-3.5" aria-hidden />
      Testar conexão
    </Button>
  );
}

function EnvBadge({ set }: { set: boolean }) {
  if (!set) return null;
  return (
    <span className="ml-1.5 inline-flex items-center gap-1 rounded bg-amber-soft px-1.5 py-0.5 text-[10px] text-amber">
      <Lock className="h-2.5 w-2.5" aria-hidden /> definido em env (prioridade)
    </span>
  );
}

export function SettingsManager({
  initialSettings,
  envFlags,
  webhookUrl,
  apiKeys: initialApiKeys,
}: {
  initialSettings: Record<string, Json>;
  envFlags: EnvFlags;
  webhookUrl: string;
  apiKeys: AdminApiKey[];
}) {
  const claude = (initialSettings.claude ?? {}) as {
    model?: string;
    max_tokens?: number;
    temperature?: number;
  };
  const meta = (initialSettings.meta ?? {}) as {
    app_id?: string;
    verify_token?: string;
  };
  const evolution = (initialSettings.evolution ?? {}) as {
    url?: string;
    api_key?: string;
  };
  const n8n = (initialSettings.n8n ?? {}) as { url?: string };

  const [claudeModel, setClaudeModel] = useState(claude.model ?? "claude-haiku-4-5");
  const [maxTokens, setMaxTokens] = useState(String(claude.max_tokens ?? 1024));
  const [temperature, setTemperature] = useState(String(claude.temperature ?? 0.7));
  const [metaAppId, setMetaAppId] = useState(meta.app_id ?? "");
  const [verifyToken, setVerifyToken] = useState(meta.verify_token ?? "");
  const [evoUrl, setEvoUrl] = useState(evolution.url ?? "");
  const [evoKey, setEvoKey] = useState(evolution.api_key ?? "");
  const [n8nUrl, setN8nUrl] = useState(n8n.url ?? "");
  const [apiKeys, setApiKeys] = useState(initialApiKeys);
  const [saving, setSaving] = useState<string | null>(null);

  async function revokeKey(id: string) {
    if (!window.confirm("Revogar esta API key? A integração do cliente para de funcionar.")) return;
    const previous = apiKeys;
    setApiKeys((prev) => prev.filter((k) => k.id !== id));
    try {
      const supabase = createClient();
      const { error } = await supabase.from("api_keys").delete().eq("id", id);
      if (error) {
        setApiKeys(previous);
        toast.error("Não foi possível revogar.");
      } else {
        toast.success("Chave revogada.");
      }
    } catch {
      setApiKeys(previous);
      toast.error("Erro de conexão.");
    }
  }

  async function saveSetting(key: string, value: Json) {
    setSaving(key);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("admin_settings")
        .upsert({ key, value, updated_at: new Date().toISOString() });
      if (error) {
        toast.error("Não foi possível salvar.");
        return;
      }
      toast.success("Configuração salva.");
    } catch {
      toast.error("Erro de conexão ao salvar.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="font-display text-lg font-semibold">Configurações globais</h1>
        <p className="mt-0.5 text-sm text-txt-mut">
          Valores definidos em variáveis de ambiente sempre têm prioridade sobre
          este painel.
        </p>
      </header>

      {/* Claude */}
      <Card>
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-lime-soft">
            <Bot className="h-5 w-5 text-lime" aria-hidden />
          </div>
          <div>
            <CardTitle>Claude API</CardTitle>
            <CardDescription>
              Modelo e parâmetros do bot nativo.
              {!envFlags.claude_api_key && (
                <span className="mt-1 block text-amber">
                  ⚠ ANTHROPIC_API_KEY não configurada — o bot e o simulador não
                  funcionam sem ela (somente via env, nunca pelo painel).
                </span>
              )}
            </CardDescription>
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div>
            <Label>
              Modelo padrão
              <EnvBadge set={envFlags.claude_model} />
            </Label>
            <Input
              value={claudeModel}
              onChange={(e) => setClaudeModel(e.target.value)}
              disabled={envFlags.claude_model}
              placeholder="claude-haiku-4-5"
            />
          </div>
          <div>
            <Label>
              max_tokens{" "}
              <HelpTip text="Tamanho máximo de cada resposta do bot, em tokens (~3/4 de uma palavra cada). Valores maiores permitem respostas mais longas, mas custam mais." />
              <EnvBadge set={envFlags.claude_max_tokens} />
            </Label>
            <Input
              type="number"
              min="64"
              value={maxTokens}
              onChange={(e) => setMaxTokens(e.target.value)}
              disabled={envFlags.claude_max_tokens}
            />
          </div>
          <div>
            <Label>
              Temperatura{" "}
              <HelpTip text="Controla a criatividade do bot: 0 = respostas sempre iguais e previsíveis, 1 = mais variadas. Para atendimento, 0.5 a 0.7 funciona bem." />
              <EnvBadge set={envFlags.claude_temperature} />
            </Label>
            <Input
              type="number"
              min="0"
              max="1"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              disabled={envFlags.claude_temperature}
            />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button
            onClick={() =>
              void saveSetting("claude", {
                model: claudeModel,
                max_tokens: Number(maxTokens) || 1024,
                temperature: Number(temperature) || 0.7,
              })
            }
            loading={saving === "claude"}
            variant="secondary"
            size="sm"
          >
            Salvar Claude
          </Button>
          <TestButton type="claude" />
        </div>
        <p className="mt-2 text-[11px] text-txt-dim">
          Custo estimado por 1.000 mensagens do bot (haiku, ~900 tokens in / 120 out
          cada): ≈ US$ 1,50
        </p>
      </Card>

      {/* Evolution API (QR Code) */}
      <Card>
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-lime-soft">
            <QrCode className="h-5 w-5 text-lime" aria-hidden />
          </div>
          <div>
            <CardTitle>Evolution API (QR Code)</CardTitle>
            <CardDescription>
              Habilita as conexões via QR Code. Aponte para a sua instância
              (self-hosted ou cloud).
            </CardDescription>
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <Label>
              URL da instância
              <EnvBadge set={envFlags.evolution_url} />
            </Label>
            <Input
              value={evoUrl}
              onChange={(e) => setEvoUrl(e.target.value)}
              disabled={envFlags.evolution_url}
              placeholder="https://evo.seudominio.com.br"
            />
          </div>
          <div>
            <Label>
              API Key global{" "}
              <HelpTip text="Chave de autenticação da SUA instância Evolution API (variável AUTHENTICATION_API_KEY do servidor onde ela roda). Não é a chave de nenhum cliente." />
              <EnvBadge set={envFlags.evolution_key} />
            </Label>
            <Input
              type="password"
              value={evoKey}
              onChange={(e) => setEvoKey(e.target.value)}
              disabled={envFlags.evolution_key}
              placeholder="AUTHENTICATION_API_KEY"
            />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button
            onClick={() => void saveSetting("evolution", { url: evoUrl, api_key: evoKey })}
            loading={saving === "evolution"}
            variant="secondary"
            size="sm"
          >
            Salvar Evolution
          </Button>
          <TestButton type="evolution" />
        </div>
      </Card>

      {/* Meta */}
      <Card>
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-raised">
            <MessageSquare className="h-5 w-5 text-txt" aria-hidden />
          </div>
          <div>
            <CardTitle>Meta / WhatsApp</CardTitle>
            <CardDescription>
              Configuração do webhook no painel da Meta (developers.facebook.com).
            </CardDescription>
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <Label>
              App ID{" "}
              <HelpTip text="Identificador do seu app na Meta. Encontre em developers.facebook.com → seu app → Configurações → Básico. O App Secret (usado nos webhooks) fica na mesma tela." />
              <EnvBadge set={envFlags.meta_app_id} />
            </Label>
            <Input
              value={metaAppId}
              onChange={(e) => setMetaAppId(e.target.value)}
              disabled={envFlags.meta_app_id}
              placeholder="1234567890"
            />
          </div>
          <div>
            <Label>
              Verify token{" "}
              <HelpTip text="Senha que você inventa e cola igual nos dois lugares: aqui e no painel da Meta (WhatsApp → Configuration → Webhook). Serve para a Meta provar que é ela chamando seu webhook." />
              <EnvBadge set={envFlags.meta_verify_token} />
            </Label>
            <Input
              value={verifyToken}
              onChange={(e) => setVerifyToken(e.target.value)}
              disabled={envFlags.meta_verify_token}
              placeholder="um-valor-secreto-seu"
            />
          </div>
        </div>
        {!envFlags.meta_system_token && (
          <p className="mt-3 text-xs text-amber">
            ⚠ META_SYSTEM_USER_TOKEN não configurado — envio de mensagens
            desativado (somente via env).
          </p>
        )}
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium text-txt-mut">
            Como configurar no painel da Meta:
          </p>
          <ol className="list-inside list-decimal space-y-1 text-xs leading-relaxed text-txt-mut">
            <li>
              Abra seu app em developers.facebook.com → WhatsApp → Configuration
            </li>
            <li>
              Em <strong>Webhook</strong>, clique em Edit e cole a Callback URL e
              o Verify token abaixo
            </li>
            <li>
              Em <strong>Webhook fields</strong>, assine o campo{" "}
              <code className="text-lime">messages</code>
            </li>
          </ol>
          <CodeBlock code={webhookUrl} label="callback url" />
        </div>
        <div className="mt-4 flex gap-2">
          <Button
            onClick={() =>
              void saveSetting("meta", { app_id: metaAppId, verify_token: verifyToken })
            }
            loading={saving === "meta"}
            variant="secondary"
            size="sm"
          >
            Salvar Meta
          </Button>
          <TestButton type="meta" />
        </div>
      </Card>

      {/* n8n global (automações internas da plataforma) */}
      <Card>
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-raised">
            <Workflow className="h-5 w-5 text-amber" aria-hidden />
          </div>
          <div>
            <CardTitle>n8n global (opcional)</CardTitle>
            <CardDescription>
              URL base do n8n DA PLATAFORMA, para automações internas suas — não
              confundir com os webhooks n8n dos clientes.
            </CardDescription>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Input
            value={n8nUrl}
            onChange={(e) => setN8nUrl(e.target.value)}
            placeholder="https://n8n.pixelpagechat.com.br"
            className="flex-1"
          />
          <Button
            onClick={() => void saveSetting("n8n", { url: n8nUrl })}
            loading={saving === "n8n"}
            variant="secondary"
            size="sm"
          >
            Salvar n8n
          </Button>
        </div>
      </Card>

      {/* API keys de todos os clientes */}
      <Card>
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-lime-soft">
            <KeyRound className="h-5 w-5 text-lime" aria-hidden />
          </div>
          <div>
            <CardTitle>API keys dos clientes</CardTitle>
            <CardDescription>
              Todas as chaves geradas na plataforma — revogue qualquer uma em caso
              de abuso.
            </CardDescription>
          </div>
        </div>
        {apiKeys.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-line p-3 text-center text-xs text-txt-dim">
            Nenhuma API key gerada ainda.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-line overflow-hidden rounded-lg border border-line">
            {apiKeys.map((key) => (
              <li
                key={key.id}
                className="flex items-center justify-between gap-3 bg-ink px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-txt">
                    {key.org_name} · {key.label}
                  </p>
                  <p className="text-txt-dim">
                    criada {timeAgo(key.created_at)} ·{" "}
                    {key.last_used_at
                      ? `usada ${timeAgo(key.last_used_at)}`
                      : "nunca usada"}
                  </p>
                </div>
                <button
                  onClick={() => void revokeKey(key.id)}
                  className="focus-ring shrink-0 rounded-md p-1.5 text-txt-dim hover:bg-danger-soft hover:text-danger"
                  aria-label={`Revogar chave de ${key.org_name}`}
                  title="Revogar"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
