"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

/** Bloco de código com botão de copiar (documentação inline). */
export function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-ink">
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wide text-txt-dim">
          {label ?? "exemplo"}
        </span>
        <button
          onClick={() => void handleCopy()}
          className="focus-ring flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-txt-dim hover:text-txt"
          aria-label="Copiar código"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-ok" /> copiado
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" /> copiar
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-[11px] leading-relaxed text-txt-mut">
        <code>{code}</code>
      </pre>
    </div>
  );
}
