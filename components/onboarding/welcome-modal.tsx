"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, FlaskConical, Smartphone } from "lucide-react";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

const STEPS = [
  { icon: Smartphone, label: "Conectar seu WhatsApp" },
  { icon: Bot, label: "Configurar o seu bot" },
  { icon: FlaskConical, label: "Testar no simulador" },
];

/**
 * Modal de boas-vindas — aparece uma única vez, na primeira entrada
 * autenticada após o cadastro. Chave de localStorage por user_id (não por
 * navegador): se o mesmo usuário logar num navegador diferente, não vê de
 * novo; se navegadores diferentes logarem no MESMO computador com contas
 * diferentes, cada um vê a sua vez.
 */
export function WelcomeModal({ userId, orgName }: { userId: string; orgName: string }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const storageKey = `ppc_welcome_seen_${userId}`;

  useEffect(() => {
    if (window.localStorage.getItem(storageKey) !== "1") {
      setOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close() {
    window.localStorage.setItem(storageKey, "1");
    setOpen(false);
  }

  function connectNow() {
    window.localStorage.setItem(storageKey, "1");
    setOpen(false);
    router.push("/app/connections");
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (panelRef.current && !panelRef.current.contains(e.target as Node)) close();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={t("Bem-vindo")}
    >
      <div
        ref={panelRef}
        className="animate-fade-scale w-full max-w-md rounded-card border border-line bg-surface p-6 shadow-pop"
      >
        <h2 className="font-display text-xl font-semibold text-txt">
          {t("Bem-vindo(a)")}, {orgName}!
        </h2>
        <p className="mt-1.5 text-sm text-txt-mut">
          {t("Sua conta está pronta. Aqui vai por onde começar:")}
        </p>

        <ul className="mt-5 space-y-3">
          {STEPS.map((step) => (
            <li key={step.label} className="flex items-center gap-3 text-sm text-txt">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lime-soft text-lime">
                <step.icon className="h-4 w-4" aria-hidden />
              </span>
              {t(step.label)}
            </li>
          ))}
        </ul>

        <Button onClick={connectNow} className="mt-6 w-full">
          {t("Conectar WhatsApp agora")}
        </Button>
        <button
          onClick={close}
          className="focus-ring mt-3 block w-full text-center text-xs text-txt-dim underline hover:text-txt-mut"
        >
          {t("Explorar sozinho")}
        </button>
      </div>
    </div>
  );
}
