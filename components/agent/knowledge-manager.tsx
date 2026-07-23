"use client";

import { useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  FileText,
  Globe,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import type { AgentKnowledgeRow, AgentKnowledgeListRow } from "@/types/database";

/**
 * "Ensine sua IA com seus conteúdos" — upload de PDF/TXT/DOCX e URL do site.
 * O conteúdo vira fonte de verdade no system prompt do bot.
 */

const statusMeta: Record<
  AgentKnowledgeListRow["status"],
  { label: string; icon: LucideIcon; tone: string }
> = {
  processing: { label: "Processando", icon: RefreshCw, tone: "text-amber" },
  ready: { label: "Pronto", icon: CheckCircle2, tone: "text-ok" },
  error: { label: "Erro", icon: XCircle, tone: "text-danger" },
};

function formatSize(bytes: number | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function KnowledgeManager({
  agentId,
  initialKnowledge,
}: {
  agentId: string;
  initialKnowledge: AgentKnowledgeListRow[];
}) {
  const t = useT();
  const [sources, setSources] = useState<AgentKnowledgeListRow[]>(initialKnowledge);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [url, setUrl] = useState("");
  const [urlStatus, setUrlStatus] = useState<
    { kind: "processing" | "success" | "error"; text: string } | null
  >(null);
  const [processingUrl, setProcessingUrl] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function uploadFile(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("Arquivo muito grande — o limite é 5MB por arquivo."));
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("agent_id", agentId);
      const res = await fetch("/api/agent/knowledge", { method: "POST", body: form });
      const json = (await res.json()) as {
        knowledge?: AgentKnowledgeRow;
        error?: string;
      };
      if (!res.ok || !json.knowledge) {
        toast.error(json.error ?? t("Não foi possível enviar o arquivo."));
        return;
      }
      const row = json.knowledge;
      setSources((prev) => [...prev.filter((s) => s.id !== row.id), row]);
      if (row.status === "ready") {
        toast.success(t("Pronto! A IA já aprendeu com este arquivo."));
      } else if (row.status === "error") {
        toast.error(row.error_message ?? t("Não consegui ler este arquivo."));
      }
    } catch {
      toast.error(t("Erro de conexão ao enviar o arquivo."));
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void uploadFile(file);
  }

  async function handleProcessUrl() {
    const value = url.trim();
    if (!value || processingUrl) return;
    setProcessingUrl(true);
    setUrlStatus({
      kind: "processing",
      text: t("Processando... lendo as páginas principais do site"),
    });
    try {
      const res = await fetch("/api/agent/knowledge/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: agentId, url: value }),
      });
      const json = (await res.json()) as {
        knowledge?: AgentKnowledgeRow;
        pages_read?: number;
        error?: string;
      };
      if (!res.ok || !json.knowledge) {
        setUrlStatus({
          kind: "error",
          text: json.error ?? t("Não consegui acessar o site."),
        });
        return;
      }
      const row = json.knowledge;
      setSources((prev) => [...prev.filter((s) => s.id !== row.id), row]);
      if (row.status === "ready") {
        const pages = json.pages_read ?? 1;
        setUrlStatus({
          kind: "success",
          text: `${t("Pronto!")} ${pages} ${pages === 1 ? t("página aprendida") : t("páginas aprendidas")}`,
        });
        setUrl("");
      } else {
        setUrlStatus({
          kind: "error",
          text: row.error_message ?? t("Não consegui acessar o site."),
        });
      }
    } catch {
      setUrlStatus({ kind: "error", text: t("Erro de conexão ao processar o site.") });
    } finally {
      setProcessingUrl(false);
    }
  }

  async function handleDelete(source: AgentKnowledgeListRow) {
    try {
      const res = await fetch(`/api/agent/knowledge?id=${source.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(json?.error ?? t("Não foi possível excluir."));
        return;
      }
      setSources((prev) => prev.filter((s) => s.id !== source.id));
      toast.success(t("Fonte removida — a IA não usa mais este conteúdo."));
    } catch {
      toast.error(t("Erro de conexão."));
    }
  }

  return (
    <Card>
      <CardTitle>{t("Ensine sua IA com seus conteúdos")}</CardTitle>
      <CardDescription>
        {t("Faça upload de arquivos ou cole o link do seu site. A IA vai aprender com esse conteúdo e usar nas respostas para seus clientes.")}
      </CardDescription>

      {/* Upload de arquivos */}
      <div className="mt-5">
        <Label>{t("Arquivos (PDF, TXT ou DOCX — máx 5MB, até 5 fontes)")}</Label>
        <p className="-mt-0.5 mb-1.5 text-[11px] text-txt-dim">
          {t("Suba seu cardápio, tabela de preços, FAQ, manual do produto ou qualquer documento do negócio.")}
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.txt,.docx"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadFile(file);
            e.target.value = "";
          }}
        />
        <div
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors",
            dragOver ? "border-txt-mut/60 bg-surface-raised" : "border-line bg-ink"
          )}
        >
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin text-txt-mut" aria-hidden />
          ) : (
            <Upload className="h-6 w-6 text-txt-dim" aria-hidden />
          )}
          <p className="text-xs text-txt-mut">
            {uploading
              ? t("Enviando e lendo o arquivo…")
              : t("Arraste um arquivo aqui ou")}
          </p>
          {!uploading && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => fileRef.current?.click()}
            >
              {t("Selecionar arquivo")}
            </Button>
          )}
        </div>
      </div>

      {/* URL do site */}
      <div className="mt-5">
        <Label>{t("URL do site")}</Label>
        <p className="-mt-0.5 mb-1.5 text-[11px] text-txt-dim">
          {t("Cole o endereço do seu site. Vamos ler as páginas principais e ensinar a IA com esse conteúdo.")}
        </p>
        <div className="flex gap-2">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleProcessUrl();
              }
            }}
            placeholder="https://suaempresa.com.br"
            className="flex-1"
          />
          <Button
            type="button"
            onClick={() => void handleProcessUrl()}
            loading={processingUrl}
            disabled={!url.trim()}
          >
            <Globe className="h-4 w-4" aria-hidden />
            {t("Processar site")}
          </Button>
        </div>
        {urlStatus && (
          <p className="mt-2 flex items-center gap-1.5 rounded-lg border border-line bg-ink px-3 py-2 text-xs text-txt-mut">
            {urlStatus.kind === "processing" && (
              <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin text-amber" aria-hidden />
            )}
            {urlStatus.kind === "success" && (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-ok" aria-hidden />
            )}
            {urlStatus.kind === "error" && (
              <XCircle className="h-3.5 w-3.5 shrink-0 text-danger" aria-hidden />
            )}
            {urlStatus.text}
          </p>
        )}
      </div>

      {/* Fontes cadastradas */}
      {sources.length > 0 && (
        <div className="mt-5 space-y-2">
          <Label>{t("Conteúdos aprendidos")}</Label>
          {sources.map((source) => {
            const status = statusMeta[source.status];
            const meta = (source.meta ?? {}) as { size_bytes?: number; pages_read?: number };
            return (
              <div
                key={source.id}
                className="flex items-center gap-3 rounded-lg border border-line bg-ink px-3 py-2.5"
              >
                {source.source_type === "file" ? (
                  <FileText className="h-4 w-4 shrink-0 text-txt-dim" aria-hidden />
                ) : (
                  <Globe className="h-4 w-4 shrink-0 text-txt-dim" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-txt">{source.source_name}</p>
                  <p className={cn("flex items-center gap-1", "text-[11px]", status.tone)}>
                    <status.icon className="h-3 w-3 shrink-0" aria-hidden />
                    {t(status.label)}
                    {source.source_type === "file" && meta.size_bytes
                      ? ` · ${formatSize(meta.size_bytes)}`
                      : ""}
                    {source.source_type === "url" && meta.pages_read
                      ? ` · ${meta.pages_read} ${meta.pages_read === 1 ? t("página") : t("páginas")}`
                      : ""}
                    {source.status === "error" && source.error_message
                      ? ` — ${source.error_message}`
                      : ""}
                  </p>
                </div>
                <button
                  onClick={() => void handleDelete(source)}
                  className="focus-ring shrink-0 rounded-md p-1.5 text-txt-dim hover:bg-surface-hover hover:text-danger"
                  aria-label={`${t("Excluir")} ${source.source_name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
