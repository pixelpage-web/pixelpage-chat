"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { getTipIcon } from "@/lib/tip-icons";
import type { ClientTipRow } from "@/types/database";

/**
 * Toasts de dica do admin para os clientes (ex.: "Você sabia que pode treinar
 * seu bot com o cardápio do seu negócio?"), empilhados no canto inferior
 * direito — mesmo padrão de components/system-notifications.tsx. Dispensadas
 * ficam em sessionStorage (não localStorage): reaparecem a cada F5/reabertura.
 */
const DISMISS_KEY = "ppc_tips_dismissed";

export function ClientTips({ tips }: { tips: ClientTipRow[] }) {
  const t = useT();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(DISMISS_KEY);
      setDismissed(new Set(raw ? (JSON.parse(raw) as string[]) : []));
    } catch {
      /* ignora */
    }
    setReady(true);
  }, []);

  function dismiss(id: string) {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...next]));
    } catch {
      /* ignora */
    }
  }

  if (!ready) return null;
  const visible = tips.filter((tip) => !dismissed.has(tip.id));
  if (visible.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[65] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-4 sm:w-full sm:max-w-sm sm:items-end">
      {visible.map((tip) => {
        const Icon = getTipIcon(tip.emoji);
        return (
          <div
            key={tip.id}
            className="animate-toast-in pointer-events-auto flex w-full items-start gap-2.5 rounded-card border border-lime/20 bg-lime-soft p-3.5 shadow-pop backdrop-blur-sm"
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-lime" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-txt">{tip.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-txt-mut">{tip.body}</p>
              {tip.cta_label && tip.cta_href && (
                <Link
                  href={tip.cta_href}
                  className="focus-ring mt-1 inline-flex items-center gap-1 rounded text-xs font-medium text-lime transition-colors hover:text-lime-bright"
                >
                  {tip.cta_label}
                  <ArrowRight className="h-3 w-3" aria-hidden />
                </Link>
              )}
            </div>
            <button
              onClick={() => dismiss(tip.id)}
              className="focus-ring shrink-0 rounded p-0.5 text-txt-dim transition-colors hover:text-txt"
              aria-label={t("Dispensar dica")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
