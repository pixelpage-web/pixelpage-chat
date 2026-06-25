"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { RefreshCw, ScrollText, Sparkles, Workflow, Wrench } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export interface AdminWebhookRow {
  id: string;
  orgName: string;
  url: string;
  usePlatformWorkflow: boolean;
  active: boolean;
  lastStatus: number | null;
  failuresCount: number;
  lastLogId: string | null;
  lastLogAt: string | null;
}

function statusOf(w: AdminWebhookRow): { tone: "ok" | "amber" | "danger" | "neutral"; label: string } {
  if (!w.active) return { tone: "neutral", label: "Pausado" };
  if (w.failuresCount >= 3 || (w.lastStatus != null && w.lastStatus >= 500))
    return { tone: "danger", label: "Offline" };
  if (w.failuresCount > 0) return { tone: "amber", label: "Com falhas" };
  if (w.lastStatus != null && w.lastStatus < 400) return { tone: "ok", label: "Ativo" };
  return { tone: "neutral", label: "Aguardando" };
}

export function N8nManager({ initialWebhooks }: { initialWebhooks: AdminWebhookRow[] }) {
  const [webhooks] = useState(initialWebhooks);
  const [resending, setResending] = useState<string | null>(null);

  async function resendLast(w: AdminWebhookRow) {
    if (!w.lastLogId) {
      toast.error("Nenhum disparo com payload salvo para reenviar.");
      return;
    }
    setResending(w.id);
    try {
      const res = await fetch("/api/admin/resend-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ log_id: w.lastLogId }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; status_code?: number; error?: string }
        | null;
      if (json?.ok) toast.success(`Reenviado (HTTP ${json.status_code}).`);
      else toast.error(json?.error ?? "Falha ao reenviar.");
    } catch {
      toast.error("Erro de conexão.");
    } finally {
      setResending(null);
    }
  }

  const platformCount = webhooks.filter((w) => w.usePlatformWorkflow).length;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <header>
        <h1 className="font-display text-lg font-semibold">n8n / Workflows</h1>
        <p className="mt-0.5 text-sm text-txt-mut">
          Todas as organizações usando webhook externo —{" "}
          <span className="font-medium text-lime">{webhooks.length}</span> no total,{" "}
          {platformCount} no workflow da plataforma.
        </p>
      </header>

      {webhooks.length === 0 ? (
        <EmptyState
          icon={Workflow}
          title="Nenhuma organização com webhook externo"
          description="Quando um cliente configurar o modo Webhook (n8n próprio ou workflow da plataforma), ele aparece aqui."
        />
      ) : (
        <ul className="space-y-3">
          {webhooks.map((w) => {
            const st = statusOf(w);
            return (
              <li key={w.id} className="rounded-card border border-line bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={st.tone}>{st.label}</Badge>
                      {w.usePlatformWorkflow ? (
                        <Badge tone="lime">
                          <Sparkles className="h-3 w-3" aria-hidden /> Workflow plataforma
                        </Badge>
                      ) : (
                        <Badge tone="neutral">
                          <Wrench className="h-3 w-3" aria-hidden /> n8n próprio
                        </Badge>
                      )}
                      <span className="font-semibold text-txt">{w.orgName}</span>
                    </div>
                    <p className="mt-1 break-all font-mono text-xs text-txt-mut">{w.url}</p>
                    <p className="mt-0.5 text-xs text-txt-dim">
                      {w.lastLogAt ? `última chamada ${timeAgo(w.lastLogAt)}` : "sem chamadas"}
                      {w.lastStatus != null && ` · HTTP ${w.lastStatus}`}
                      {w.failuresCount > 0 && ` · ${w.failuresCount} falha(s)`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={resending === w.id}
                      onClick={() => void resendLast(w)}
                      disabled={!w.lastLogId}
                      title={w.lastLogId ? "Reenviar último evento" : "Sem disparo para reenviar"}
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                      Reenviar
                    </Button>
                    <Link
                      href="/admin/logs"
                      className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-medium text-txt transition-colors hover:border-lime/50 hover:text-lime"
                    >
                      <ScrollText className="h-3.5 w-3.5" aria-hidden />
                      Ver logs
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
