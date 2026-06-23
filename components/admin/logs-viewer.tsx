"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { QrCode, RefreshCw, ScrollText, Webhook } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { AuditLogRow } from "@/types/database";

interface FailedDelivery {
  id: string;
  event: string;
  status_code: number | null;
  error: string | null;
  created_at: string;
  has_payload: boolean;
  org: string;
  url: string;
}

interface QrDownItem {
  id: string;
  label: string;
  phone_display: string | null;
  org: string;
}

type Filter = "all" | "errors" | "ai" | "billing" | "webhooks";

const filters: { value: Filter; label: string }[] = [
  { value: "all", label: "Tudo" },
  { value: "errors", label: "Erros" },
  { value: "ai", label: "Bot IA" },
  { value: "billing", label: "Cobrança" },
  { value: "webhooks", label: "Webhooks" },
];

const errorActions = new Set([
  "ai.error",
  "ai.limit_reached",
  "message.send_failed",
  "webhook.failing",
  "billing.payment_overdue",
]);

function matches(log: AuditLogRow, filter: Filter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "errors":
      return errorActions.has(log.action);
    case "ai":
      return log.action.startsWith("ai.");
    case "billing":
      return log.action.startsWith("billing.");
    case "webhooks":
      return log.action.startsWith("webhook.");
  }
}

function toneFor(action: string): "danger" | "amber" | "lime" | "neutral" {
  if (errorActions.has(action)) return "danger";
  if (action.startsWith("billing.")) return "amber";
  if (action.startsWith("ai.")) return "lime";
  return "neutral";
}

export function LogsViewer({
  initialLogs,
  orgNames,
  failedDeliveries,
  qrDown,
}: {
  initialLogs: AuditLogRow[];
  orgNames: Record<string, string>;
  failedDeliveries: FailedDelivery[];
  qrDown: QrDownItem[];
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [resending, setResending] = useState<string | null>(null);

  async function resend(logId: string) {
    setResending(logId);
    try {
      const res = await fetch("/api/admin/resend-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ log_id: logId }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        status_code?: number | null;
        error?: string;
      };
      if (json.ok) toast.success(`Reenviado com sucesso (HTTP ${json.status_code}).`);
      else toast.error(json.error ?? "Reenvio falhou novamente.");
    } catch {
      toast.error("Erro de conexão.");
    } finally {
      setResending(null);
    }
  }

  const filtered = useMemo(
    () => initialLogs.filter((log) => matches(log, filter)),
    [initialLogs, filter]
  );

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <header>
        <h1 className="font-display text-lg font-semibold">Logs</h1>
        <p className="mt-0.5 text-sm text-txt-mut">
          Atividade recente, erros do bot e webhooks falhando.
        </p>
      </header>

      {/* Sessões QR desconectadas */}
      {qrDown.length > 0 && (
        <Card className="border-amber/25">
          <CardTitle className="flex items-center gap-2 text-amber">
            <QrCode className="h-4 w-4" aria-hidden />
            Sessões QR Code desconectadas ({qrDown.length})
          </CardTitle>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line">
            {qrDown.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 bg-ink px-3 py-2 text-xs"
              >
                <span className="min-w-0 truncate">
                  <strong>{c.org}</strong> · {c.label}
                  {c.phone_display && ` (${c.phone_display})`}
                </span>
                <span className="shrink-0 text-txt-dim">
                  cliente precisa reescanear o QR em Conexões
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Webhooks externos com falha (reenvio manual) */}
      {failedDeliveries.length > 0 && (
        <Card className="border-danger/25">
          <CardTitle className="flex items-center gap-2 text-danger">
            <Webhook className="h-4 w-4" aria-hidden />
            Disparos de webhook com falha ({failedDeliveries.length})
          </CardTitle>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line">
            {failedDeliveries.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 bg-ink px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="truncate">
                    <strong>{d.org}</strong> · {d.event} ·{" "}
                    <span className="text-danger">{d.error}</span>
                  </p>
                  <p className="truncate text-txt-dim">
                    {d.url} · {timeAgo(d.created_at)}
                  </p>
                </div>
                {d.has_payload && (
                  <Button
                    size="sm"
                    variant="outline"
                    loading={resending === d.id}
                    onClick={() => void resend(d.id)}
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                    Reenviar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex flex-wrap gap-1.5">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "focus-ring rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              filter === f.value
                ? "bg-lime-soft text-lime"
                : "text-txt-dim hover:bg-surface-raised hover:text-txt"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="Nenhum registro"
          description="Os eventos da plataforma aparecem aqui conforme acontecem."
        />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
          {filtered.map((log) => (
            <li key={log.id} className="bg-ink px-4 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Badge tone={toneFor(log.action)}>{log.action}</Badge>
                  {log.org_id && (
                    <span className="truncate text-xs text-txt-mut">
                      {orgNames[log.org_id] ?? log.org_id}
                    </span>
                  )}
                </div>
                <span className="shrink-0 text-[11px] text-txt-dim">
                  {timeAgo(log.created_at)}
                </span>
              </div>
              {log.metadata && Object.keys(log.metadata as object).length > 0 && (
                <pre className="mt-1.5 overflow-x-auto text-[10px] leading-relaxed text-txt-dim">
                  {JSON.stringify(log.metadata)}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
