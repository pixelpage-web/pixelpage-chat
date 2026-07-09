"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Bot, RotateCcw, Send, User, Zap } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { AgentRow } from "@/types/database";
import type { ChatTurn } from "@/lib/claude";

interface SimMessage extends ChatTurn {
  handoff?: boolean;
}

/**
 * Simulador de chat: testa o bot com a Claude API real, sem WhatsApp.
 * O histórico é mantido apenas em memória (nada é salvo no inbox).
 */
export function Simulator({
  agent,
  orgName,
}: {
  agent: AgentRow;
  orgName: string;
}) {
  const t = useT();
  const [messages, setMessages] = useState<SimMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking]);

  async function handleSend() {
    const content = draft.trim();
    if (!content || thinking) return;
    setDraft("");

    const history = messages.map(({ role, content: c }) => ({ role, content: c }));
    setMessages((prev) => [...prev, { role: "user", content }]);
    setThinking(true);

    try {
      const res = await fetch("/api/agent/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: agent.id, history, message: content }),
      });
      const json = (await res.json()) as {
        reply?: string;
        handoff?: boolean;
        error?: string;
      };
      if (!res.ok || !json.reply) {
        toast.error(json.error ?? t("Não foi possível obter resposta do bot."));
        return;
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: json.reply ?? "", handoff: json.handoff },
      ]);
    } catch {
      toast.error(t("Erro de conexão com o simulador. Tente novamente."));
    } finally {
      setThinking(false);
    }
  }

  const welcome = agent.welcome_message.trim();

  return (
    <div className="flex h-full w-full flex-col bg-ink">
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-lime-soft">
            <Bot className="h-4 w-4 text-lime" aria-hidden />
          </div>
          <div>
            <p className="text-sm font-semibold">{agent.name || t("Assistente")}</p>
            <p className="text-[11px] text-txt-dim">
              {t("Simulador · Claude API real · não consome seu saldo")}
            </p>
          </div>
        </div>
        <button
          onClick={() => setMessages([])}
          title={t("Reiniciar conversa")}
          aria-label={t("Reiniciar conversa")}
          className="focus-ring rounded-md p-1.5 text-txt-dim transition-colors hover:bg-surface-hover hover:text-txt"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {welcome && messages.length === 0 && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-surface-raised px-3.5 py-2">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{welcome}</p>
              <p className="mt-1 text-[10px] text-txt-dim">{t("mensagem de boas-vindas")}</p>
            </div>
          </div>
        )}

        {messages.length === 0 && !welcome && (
          <div className="flex h-full items-center justify-center">
            <p className="max-w-[220px] text-center text-xs leading-relaxed text-txt-dim">
              {t("Escreva como se você fosse um cliente no WhatsApp e veja como o bot responde.")}
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-3.5 py-2",
                msg.role === "user"
                  ? "rounded-br-sm bg-lime/15 ring-1 ring-inset ring-lime/20"
                  : "rounded-bl-sm bg-surface-raised"
              )}
            >
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                {msg.content}
              </p>
              <div className="mt-1 flex items-center gap-1 text-[10px] text-txt-dim">
                {msg.role === "user" ? (
                  <>
                    <User className="h-3 w-3" aria-hidden /> {t("cliente (você)")}
                  </>
                ) : (
                  <>
                    <Bot className="h-3 w-3 text-lime" aria-hidden /> {agent.name || "bot"}
                  </>
                )}
              </div>
              {msg.handoff && (
                <p className="mt-1.5 flex items-center gap-1 rounded-md bg-amber-soft px-2 py-1 text-[10px] text-amber">
                  <Zap className="h-3 w-3 shrink-0" aria-hidden />
                  {t("Palavra-chave de handoff detectada — no WhatsApp real, o bot pausaria e sua equipe assumiria.")}
                </p>
              )}
            </div>
          </div>
        ))}

        {thinking && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-surface-raised px-4 py-3">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-txt-dim [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-txt-dim [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-txt-dim [animation-delay:300ms]" />
            </div>
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
            placeholder={t("Mensagem do cliente…")}
            className="focus-ring max-h-28 min-h-[40px] flex-1 resize-none rounded-lg border border-line bg-ink px-3 py-2 text-sm placeholder:text-txt-dim"
          />
          <button
            onClick={() => void handleSend()}
            disabled={!draft.trim() || thinking}
            className="focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-lime text-white transition-colors hover:bg-lime-bright disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={t("Enviar mensagem de teste")}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </footer>
    </div>
  );
}
