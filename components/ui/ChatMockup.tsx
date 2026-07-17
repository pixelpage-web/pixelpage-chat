"use client";

import { useEffect, useState } from "react";
import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

type Phase = "bubble1" | "typing" | "bubble2" | "hold" | "out";

/** Um ciclo completo de ~8s: mensagem do cliente -> "digitando" -> resposta da IA -> pausa -> reset. */
const SCHEDULE: [Phase, number][] = [
  ["bubble1", 0],
  ["typing", 1200],
  ["bubble2", 2400],
  ["hold", 2750],
  ["out", 7000],
];
const CYCLE_MS = 8000;

/**
 * Único elemento animado de forma elaborada da página — mockup de conversa
 * no hero de /login e /register. Sequência encenada (não simultânea), com
 * indicador de "digitando" antes da resposta da IA. Respeita
 * prefers-reduced-motion: nesse caso mostra o estado final estático, sem
 * ciclo nem transições.
 */
export function ChatMockup() {
  const t = useT();
  const [phase, setPhase] = useState<Phase>("bubble1");
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    let ids: ReturnType<typeof setTimeout>[] = [];
    function runCycle() {
      ids = SCHEDULE.map(([p, delay]) => setTimeout(() => setPhase(p), delay));
      ids.push(setTimeout(runCycle, CYCLE_MS));
    }
    runCycle();
    return () => ids.forEach(clearTimeout);
  }, [reducedMotion]);

  const bubble1On = reducedMotion || phase !== "out";
  const typingOn = !reducedMotion && phase === "typing";
  const bubble2On = reducedMotion || phase === "bubble2" || phase === "hold";
  const transition = reducedMotion ? "" : "transition-all duration-300 ease-out";

  return (
    <div className="relative mt-10 h-48" aria-hidden>
      {/* Mensagem do cliente */}
      <div
        className={cn(
          "absolute left-0 top-0 w-[70%] max-w-[230px] -rotate-2 rounded-2xl rounded-bl-sm border border-line bg-surface p-3 shadow-pop",
          transition,
          bubble1On ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
        )}
      >
        <p className="text-xs leading-relaxed text-txt-mut">
          {t("Olá! Vocês entregam hoje?")}
        </p>
      </div>

      {/* Indicador de "digitando" — mesma posição da resposta, some quando ela aparece */}
      <div
        className={cn(
          "absolute right-0 top-16 flex items-center gap-1 rounded-2xl rounded-br-sm border border-line-strong bg-surface-raised px-3 py-2.5",
          transition,
          typingOn ? "opacity-100 translate-y-0" : "pointer-events-none opacity-0 translate-y-3"
        )}
      >
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-txt-mut" />
        <span
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-txt-mut"
          style={{ animationDelay: "0.15s" }}
        />
        <span
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-txt-mut"
          style={{ animationDelay: "0.3s" }}
        />
      </div>

      {/* Resposta da IA — neutra (verde reservado só ao logo/wordmark) */}
      <div
        className={cn(
          "absolute right-0 top-16 w-[75%] max-w-[240px] rotate-1 rounded-2xl rounded-br-sm border border-line-strong bg-surface-raised p-3 shadow-pop",
          transition,
          bubble2On ? "opacity-100 translate-y-0" : "pointer-events-none opacity-0 translate-y-3"
        )}
      >
        <div className="mb-1 flex items-center gap-1.5 text-txt-mut">
          <Bot className="h-3 w-3" aria-hidden />
          <span className="font-mono text-[10px] uppercase tracking-wide">IA</span>
        </div>
        <p className="text-xs leading-relaxed text-txt">
          {t("Sim! Entrega em até 40 min 🚀")}
        </p>
      </div>
    </div>
  );
}
