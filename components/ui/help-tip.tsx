"use client";

import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Tooltip "?" para campos técnicos — explica o termo em português simples.
 * Aparece no hover e no foco (acessível por teclado).
 */
export function HelpTip({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn("group relative inline-flex align-middle", className)}>
      <button
        type="button"
        tabIndex={0}
        aria-label={text}
        className="focus-ring rounded-full text-txt-dim hover:text-txt"
        onClick={(e) => e.preventDefault()}
      >
        <HelpCircle className="h-3.5 w-3.5" aria-hidden />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 w-60 -translate-x-1/2 rounded-lg border border-line bg-surface-raised px-3 py-2 text-left text-[11px] font-normal normal-case leading-relaxed tracking-normal text-txt-mut opacity-0 shadow-pop transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}
