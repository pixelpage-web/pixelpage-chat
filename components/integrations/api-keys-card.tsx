"use client";

import { useState } from "react";
import { toast } from "sonner";
import { BookOpen, KeyRound, Plus, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { CodeBlock } from "./code-block";

interface ApiKeyItem {
  id: string;
  label: string;
  last_used_at: string | null;
  created_at: string;
}

export function ApiKeysCard({
  initialKeys,
  appUrl,
  isOwner,
}: {
  initialKeys: ApiKeyItem[];
  appUrl: string;
  isOwner: boolean;
}) {
  const t = useT();
  const [keys, setKeys] = useState(initialKeys);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  const docs = `# Enviar mensagem
curl -X POST ${appUrl}/api/v1/messages \\
  -H "Authorization: Bearer SUA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "to": "5511999998888", "text": "Olá pela API da PixelPage Chat!" }'

# Listar conversas
curl ${appUrl}/api/v1/conversations?status=open \\
  -H "Authorization: Bearer SUA_API_KEY"

# Histórico de uma conversa
curl ${appUrl}/api/v1/conversations/{id}/messages \\
  -H "Authorization: Bearer SUA_API_KEY"`;

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await fetch("/api/integrations/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label || "Padrão" }),
      });
      const json = (await res.json()) as {
        key?: string;
        id?: string;
        label?: string;
        error?: string;
      };
      if (!res.ok || !json.key || !json.id) {
        toast.error(json.error ?? t("Não foi possível gerar a chave."));
        return;
      }
      setKeys((prev) => [
        {
          id: json.id as string,
          label: json.label ?? "Padrão",
          last_used_at: null,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      setNewKey(json.key);
      setLabel("");
    } catch {
      toast.error(t("Erro de conexão ao gerar a chave."));
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    const previous = keys;
    setKeys((prev) => prev.filter((k) => k.id !== id));
    try {
      const res = await fetch(`/api/integrations/api-keys?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setKeys(previous);
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(json?.error ?? t("Não foi possível revogar a chave."));
      } else {
        toast.success(t("Chave revogada."));
      }
    } catch {
      setKeys(previous);
      toast.error(t("Erro de conexão ao revogar."));
    }
  }

  return (
    <Card>
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-raised">
          <KeyRound className="h-5 w-5 text-txt-mut" aria-hidden />
        </div>
        <div>
          <CardTitle>{t("API da PixelPage Chat")}</CardTitle>
          <CardDescription>
            {t("Envie mensagens e consulte conversas programaticamente.")}
          </CardDescription>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {/* Lista de chaves */}
        {keys.length > 0 ? (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
            {keys.map((key) => (
              <li
                key={key.id}
                className="flex items-center justify-between gap-3 bg-ink px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{key.label}</p>
                  <p className="text-[11px] text-txt-dim">
                    pxp_•••••••• · {t("criada")} {timeAgo(key.created_at)}
                    {key.last_used_at
                      ? ` · ${t("usada")} ${timeAgo(key.last_used_at)}`
                      : ` · ${t("nunca usada")}`}
                  </p>
                </div>
                {isOwner && (
                  <button
                    onClick={() => void handleRevoke(key.id)}
                    className="focus-ring shrink-0 rounded-md p-1.5 text-txt-dim transition-colors hover:bg-danger-soft hover:text-danger"
                    aria-label={`${t("Revogar chave")} ${key.label}`}
                    title={t("Revogar")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-line p-4 text-center text-xs text-txt-dim">
            {t("Nenhuma API key ainda. Gere uma para usar a API pública ou responder pelo n8n.")}
          </p>
        )}

        {/* Gerar nova */}
        {isOwner && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("Nome da chave (ex.: n8n produção)")}
              className="flex-1"
            />
            <Button onClick={() => void handleCreate()} loading={creating} variant="secondary">
              <Plus className="h-4 w-4" aria-hidden />
              {t("Gerar API key")}
            </Button>
          </div>
        )}

        {/* Documentação inline */}
        <details className="group rounded-lg border border-line">
          <summary className="focus-ring flex cursor-pointer select-none items-center gap-1.5 rounded-lg px-4 py-3 text-sm font-medium text-txt-mut transition-colors hover:text-txt">
            <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {t("Documentação: endpoints públicos")}
          </summary>
          <div className="space-y-3 border-t border-line p-4">
            <ul className="space-y-1 text-xs text-txt-mut">
              <li>
                <code className="text-txt">POST /api/v1/messages</code> — enviar
                mensagem (por <code>conversation_id</code>,{" "}
                <code>reply_token</code> ou <code>to</code>)
              </li>
              <li>
                <code className="text-txt">GET /api/v1/conversations</code> —
                listar conversas (<code>?status=open|resolved</code>)
              </li>
              <li>
                <code className="text-txt">
                  GET /api/v1/conversations/{"{id}"}/messages
                </code>{" "}
                — histórico
              </li>
            </ul>
            <CodeBlock code={docs} label="exemplos com curl" />
          </div>
        </details>
      </div>

      {/* Modal com a chave recém-gerada (única exibição) */}
      <Modal
        open={newKey !== null}
        onClose={() => setNewKey(null)}
        title={t("Sua nova API key")}
      >
        <p className="text-sm leading-relaxed text-txt-mut">
          {t("Copie e guarde em local seguro —")}{" "}
          <span className="font-semibold text-amber">
            {t("esta chave não será exibida novamente")}
          </span>
          .
        </p>
        <div className="mt-4">
          <CodeBlock code={newKey ?? ""} label="api key" />
        </div>
        <Button onClick={() => setNewKey(null)} className="mt-4 w-full">
          {t("Já copiei, fechar")}
        </Button>
      </Modal>
    </Card>
  );
}
