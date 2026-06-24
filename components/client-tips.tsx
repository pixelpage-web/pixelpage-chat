"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { ClientTipRow } from "@/types/database";

/**
 * Cards de dica do admin para os clientes (ex.: “💡 Você sabia que pode treinar
 * seu bot com o cardápio do seu negócio?”). Aparecem no topo do painel e podem
 * ser dispensados individualmente (estado guardado por navegador).
 */
const DISMISS_KEY = "ppc_tips_dismissed";

export function ClientTips({ tips }: { tips: ClientTipRow[] }) {
  const t = useT();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DISMISS_KEY);
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
      window.localStorage.setItem(DISMISS_KEY, JSON.stringify([...next]));
    } catch {
      /* ignora */
    }
  }

  if (!ready) return null;
  const visible = tips.filter((tip) => !dismissed.has(tip.id));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2 border-b border-line bg-surface px-4 py-2.5">
      {visible.map((tip) => (
        <div
          key={tip.id}
          className="flex items-start gap-2.5 rounded-lg border border-lime/20 bg-lime-soft px-3 py-2"
        >
          <span className="text-base leading-none" aria-hidden>
            {tip.emoji}
          </span>
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
      ))}
    </div>
  );
}
