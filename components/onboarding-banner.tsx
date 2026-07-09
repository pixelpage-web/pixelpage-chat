"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Banner de boas-vindas + checklist de progresso (contas novas).
 * Aparece no topo do inbox até o cliente concluir os passos ou dispensar.
 * O estado de "dispensado" fica no localStorage (por navegador).
 */

const DISMISS_KEY = "ppc_welcome_dismissed";

export interface OnboardingSteps {
  connected: boolean;
  configured: boolean;
  tested: boolean;
  teamInvited: boolean;
  published: boolean;
}

export function OnboardingBanner({ steps }: { steps: OnboardingSteps }) {
  const t = useT();
  const [dismissed, setDismissed] = useState(true); // evita flash antes de ler o storage

  useEffect(() => {
    setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  const items: { done: boolean; label: string; href: string }[] = [
    { done: steps.connected, label: "Conectar WhatsApp", href: "/app/connections" },
    { done: steps.configured, label: "Configurar agente/fluxo", href: "/app/flows" },
    { done: steps.tested, label: "Testar", href: "/app/agent" },
    { done: steps.teamInvited, label: "Convidar equipe", href: "/app/settings" },
    { done: steps.published, label: "Publicar", href: "/app/flows" },
  ];

  const allDone = items.every((i) => i.done);
  if (dismissed || allDone) return null;

  function dismiss() {
    window.localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  return (
    <div className="border-b border-line bg-surface px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {t("Bem-vindo à PixelPage Chat!")}
          </p>
          <p className="mt-0.5 text-xs text-txt-mut">
            {t("Ordem recomendada: 1) Conectar WhatsApp → 2) Configurar bot/fluxo → 3) Testar no simulador → 4) Publicar.")}
          </p>
          {/* Checklist de progresso */}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
            {items.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  "focus-ring flex items-center gap-1.5 rounded text-xs transition-colors",
                  item.done ? "text-ok" : "text-txt-mut hover:text-lime"
                )}
              >
                {item.done ? (
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <Circle className="h-3.5 w-3.5" aria-hidden />
                )}
                <span className={cn(item.done && "line-through opacity-70")}>
                  {t(item.label)}
                </span>
              </Link>
            ))}
          </div>
        </div>
        <button
          onClick={dismiss}
          className="focus-ring shrink-0 rounded-md p-1 text-txt-dim hover:bg-surface-hover hover:text-txt"
          aria-label={t("Dispensar boas-vindas")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
