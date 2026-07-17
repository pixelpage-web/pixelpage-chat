"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Bot, Play, RotateCcw, Send, User, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { FlowDefinition, FlowRuntimeState } from "@/lib/flow-types";
import type { Json } from "@/types/database";

/**
 * Simulador do fluxo no editor — mesmo visual do simulador do Agente IA,
 * mas executando o fluxo do canvas (via /api/flows/simulate).
 */

interface SimEntry {
  kind: "user" | "bot" | "event";
  text: string;
}

export function FlowSimulator({
  flowName,
  getDefinition,
  onClose,
}: {
  flowName: string;
  /** Lê o estado ATUAL do canvas (inclusive edições não salvas) */
  getDefinition: () => FlowDefinition;
  onClose: () => void;
}) {
  const t = useT();
  const [entries, setEntries] = useState<SimEntry[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [started, setStarted] = useState(false);
  const [ended, setEnded] = useState(false);
  const nodeRef = useRef<string | null>(null);
  const stateRef = useRef<FlowRuntimeState | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries, thinking]);

  async function callSimulate(message: string | null) {
    setThinking(true);
    try {
      const res = await fetch("/api/flows/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canvas: getDefinition() as unknown as Json,
          node_id: nodeRef.current,
          state: stateRef.current as unknown as Json,
          message,
        }),
      });
      const json = (await res.json()) as {
        events?: { kind: "bot" | "event"; text: string }[];
        node_id?: string | null;
        state?: FlowRuntimeState;
        ended?: boolean;
        error?: string;
      };
      if (!res.ok) {
        toast.error(json.error ?? t("Não foi possível executar o fluxo."));
        return;
      }
      nodeRef.current = json.node_id ?? null;
      stateRef.current = json.state ?? null;
      setEnded(json.ended === true);
      setEntries((prev) => [...prev, ...(json.events ?? [])]);
    } catch {
      toast.error(t("Erro de conexão com o simulador."));
    } finally {
      setThinking(false);
    }
  }

  function handleStart() {
    setEntries([]);
    setEnded(false);
    nodeRef.current = null;
    stateRef.current = null;
    setStarted(true);
    void callSimulate(null);
  }

  async function handleSend() {
    const content = draft.trim();
    if (!content || thinking || !started) return;
    setDraft("");
    setEntries((prev) => [...prev, { kind: "user", text: content }]);
    await callSimulate(content);
  }

  return (
    <div className="flex h-full w-full flex-col bg-ink">
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-raised">
            <Bot className="h-4 w-4 text-txt-mut" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{flowName}</p>
            <p className="text-[11px] text-txt-dim">
              {t("Teste do fluxo · nada é salvo no inbox")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {started && (
            <button
              onClick={handleStart}
              title={t("Reiniciar teste")}
              aria-label={t("Reiniciar teste")}
              className="focus-ring rounded-md p-1.5 text-txt-dim transition-colors hover:bg-surface-hover hover:text-txt"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={onClose}
            title={t("Fechar simulador")}
            aria-label={t("Fechar simulador")}
            className="focus-ring rounded-md p-1.5 text-txt-dim transition-colors hover:bg-surface-hover hover:text-txt"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {!started && (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <p className="max-w-[240px] text-center text-xs leading-relaxed text-txt-dim">
              {t("Clique em iniciar para simular o que o cliente vê quando manda a primeira mensagem.")}
            </p>
            <button
              onClick={handleStart}
              className="focus-ring flex items-center gap-2 rounded-lg bg-txt px-4 py-2 text-sm font-semibold text-ink hover:bg-txt/90"
            >
              <Play className="h-4 w-4" aria-hidden />
              {t("Iniciar teste")}
            </button>
          </div>
        )}

        {entries.map((entry, i) =>
          entry.kind === "event" ? (
            <div key={i} className="flex justify-center">
              <span className="max-w-[90%] rounded-full border border-line bg-surface px-3 py-1 text-center text-[10px] text-txt-dim">
                {entry.text}
              </span>
            </div>
          ) : (
            <div
              key={i}
              className={cn("flex", entry.kind === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2",
                  entry.kind === "user"
                    ? "rounded-br-sm bg-surface-raised ring-1 ring-inset ring-line-strong"
                    : "rounded-bl-sm bg-surface-raised"
                )}
              >
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                  {entry.text}
                </p>
                <div className="mt-1 flex items-center gap-1 text-[10px] text-txt-dim">
                  {entry.kind === "user" ? (
                    <>
                      <User className="h-3 w-3" aria-hidden /> {t("cliente (você)")}
                    </>
                  ) : (
                    <>
                      <Bot className="h-3 w-3 text-txt-mut" aria-hidden /> {t("fluxo")}
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        )}

        {thinking && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-surface-raised px-4 py-3">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-txt-dim [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-txt-dim [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-txt-dim [animation-delay:300ms]" />
            </div>
          </div>
        )}

        {ended && started && (
          <div className="flex justify-center">
            <span className="rounded-full border border-ok/30 bg-ok-soft px-3 py-1 text-[10px] text-ok">
              {t("Fluxo encerrado. Reinicie para testar de novo.")}
            </span>
          </div>
        )}
      </div>

      <footer className="border-t border-line bg-surface p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            rows={1}
            disabled={!started || ended}
            placeholder={
              started ? t("Mensagem do cliente…") : t("Inicie o teste primeiro")
            }
            className="focus-ring max-h-28 min-h-[40px] flex-1 resize-none rounded-lg border border-line bg-ink px-3 py-2 text-sm placeholder:text-txt-dim disabled:opacity-50"
          />
          <button
            onClick={() => void handleSend()}
            disabled={!draft.trim() || thinking || !started || ended}
            className="focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-txt text-ink transition-colors hover:bg-txt/90 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={t("Enviar mensagem de teste")}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </footer>
    </div>
  );
}
