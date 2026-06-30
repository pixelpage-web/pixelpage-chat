"use client";

import { useEffect, useState } from "react";
import { Keyboard, X } from "lucide-react";
import { useT } from "@/lib/i18n";

interface Shortcut {
  keys: string[];
  description: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: ["Cmd", "K"], description: "Busca global" },
  { keys: ["/"], description: "Respostas prontas (no campo de texto)" },
  { keys: ["@"], description: "Mencionar agente (em nota interna)" },
  { keys: ["Enter"], description: "Enviar mensagem" },
  { keys: ["Ctrl", "Enter"], description: "Salvar nota interna" },
  { keys: ["Shift", "Enter"], description: "Quebra de linha" },
  { keys: ["Esc"], description: "Fechar dropdown / busca" },
  { keys: ["?"], description: "Mostrar atalhos de teclado" },
];

export function KeyboardShortcutsButton() {
  const t = useT();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "?") setOpen(true);
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!open) return (
    <button
      onClick={() => setOpen(true)}
      className="focus-ring flex h-7 w-7 items-center justify-center rounded-md text-txt-dim transition-colors hover:bg-surface-hover hover:text-txt"
      title={t("Atalhos de teclado (?)")}
      aria-label={t("Atalhos de teclado")}
    >
      <Keyboard className="h-4 w-4" />
    </button>
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="focus-ring flex h-7 w-7 items-center justify-center rounded-md text-txt-dim transition-colors hover:bg-surface-hover hover:text-txt"
        title={t("Atalhos de teclado (?)")}
        aria-label={t("Atalhos de teclado")}
      >
        <Keyboard className="h-4 w-4" />
      </button>

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setOpen(false)}>
        <div
          className="w-full max-w-md overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div className="flex items-center gap-2">
              <Keyboard className="h-4 w-4 text-txt-dim" />
              <p className="font-semibold">{t("Atalhos de teclado")}</p>
            </div>
            <button onClick={() => setOpen(false)} className="focus-ring rounded-md p-1 text-txt-dim hover:text-txt">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto p-2">
            {SHORTCUTS.map((s, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg px-4 py-3 transition-colors hover:bg-surface-raised">
                <p className="text-sm text-txt-mut">{t(s.description)}</p>
                <div className="flex items-center gap-1">
                  {s.keys.map((k, j) => (
                    <span key={j}>
                      <kbd className="rounded border border-line bg-ink px-2 py-0.5 font-mono text-xs">{k}</kbd>
                      {j < s.keys.length - 1 && <span className="mx-0.5 text-txt-dim text-xs">+</span>}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-line px-5 py-3">
            <p className="text-xs text-txt-dim">{t("Pressione")} <kbd className="rounded border border-line bg-ink px-1 py-0.5 font-mono text-[10px]">?</kbd> {t("a qualquer momento para ver esta lista.")}</p>
          </div>
        </div>
      </div>
    </>
  );
}
