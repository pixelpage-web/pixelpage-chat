"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Smartphone,
  Star,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
// Button not used (link-buttons use styled <Link> directly)

// ─── tipos ────────────────────────────────────────────────────────────────────

type ModalState = "activating" | "success" | "timeout";

interface ActivationModalProps {
  /** Subscription já estava ativa quando a página carregou (webhook processado rápido). */
  initiallyActive: boolean;
  /** Nome do plano já ativo (quando initiallyActive = true). */
  initialPlanName: string;
  onClose: () => void;
}

// ─── step items ───────────────────────────────────────────────────────────────

const STEPS = [
  "Pagamento confirmado",
  "Conta atualizada",
  "Recursos liberados",
];

const STEP_DELAY_MS = 800;
const POLL_INTERVAL_MS = 2000;
const TIMEOUT_MS = 30_000;

// ─── sub-componentes ──────────────────────────────────────────────────────────

function StepItem({ text, visible }: { text: string; visible: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 transition-all duration-500",
        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      )}
    >
      <CheckCircle2 className="h-4 w-4 shrink-0 text-txt-mut" aria-hidden />
      <span className="text-sm text-txt">{text}</span>
    </div>
  );
}

function SuccessStarter({ planName, onClose }: { planName: string; onClose: () => void }) {
  return (
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-raised">
        <Smartphone className="h-8 w-8 text-txt-mut" aria-hidden />
      </div>
      <h2 className="font-display text-xl font-semibold">
        Bem-vindo ao {planName}!
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-txt-mut">
        Seu plano está ativo. Conecte seu WhatsApp e comece a atender seus
        clientes com muito mais eficiência.
      </p>
      <div className="mt-6 space-y-3">
        <Link
          href="/app/connections"
          onClick={onClose}
          className="focus-ring inline-flex w-full items-center justify-center rounded-lg bg-txt px-4 py-2.5 text-sm font-semibold text-ink transition-opacity hover:opacity-90"
        >
          Conectar meu WhatsApp
        </Link>
        <button
          onClick={onClose}
          className="w-full text-xs text-txt-dim hover:text-txt"
        >
          Ir para o painel
        </button>
      </div>
    </div>
  );
}

function SuccessPro({ planName, onClose }: { planName: string; onClose: () => void }) {
  return (
    <div className="text-center">
      {/* Badge animado */}
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-raised">
        <span className="relative flex items-center justify-center">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-txt-mut/30" />
          <ShieldCheck className="relative h-8 w-8 text-txt-mut" aria-hidden />
        </span>
      </div>

      <div className="mx-auto mb-4 inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface-raised px-3 py-1">
        <Star className="h-3.5 w-3.5 text-txt-mut" aria-hidden />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-txt">
          Parceiro Oficial Meta
        </span>
      </div>

      <h2 className="font-display text-xl font-semibold">
        Bem-vindo ao {planName}!
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-txt-mut">
        Você agora tem acesso à{" "}
        <span className="font-medium text-txt">API Oficial da Meta</span>.
        Número verificado. Sem risco de ban. Envie templates aprovados com
        segurança total.
      </p>

      <div className="mt-6 space-y-3">
        <Link
          href="/app/connections/api-oficial"
          onClick={onClose}
          className="focus-ring inline-flex w-full items-center justify-center rounded-lg bg-txt px-4 py-2.5 text-sm font-semibold text-ink transition-opacity hover:opacity-90"
        >
          Ativar API Oficial
        </Link>
        <button
          onClick={onClose}
          className="w-full text-xs text-txt-dim hover:text-txt"
        >
          Ir para o painel
        </button>
      </div>
    </div>
  );
}

function TimeoutState({ onClose }: { onClose: () => void }) {
  return (
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber/10">
        <CheckCircle2 className="h-7 w-7 text-amber" aria-hidden />
      </div>
      <h2 className="font-display text-lg font-semibold">
        Pagamento recebido!
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-txt-mut">
        Seu plano será ativado em instantes. Se não atualizar automaticamente,
        recarregue a página.
      </p>
      <button
        onClick={onClose}
        className="mt-6 w-full rounded-lg border border-line py-2.5 text-sm font-medium text-txt transition-colors hover:border-line-strong"
      >
        Fechar
      </button>
    </div>
  );
}

// ─── componente principal ─────────────────────────────────────────────────────

export function ActivationModal({
  initiallyActive,
  initialPlanName,
  onClose,
}: ActivationModalProps) {
  const [state, setState] = useState<ModalState>(
    initiallyActive ? "success" : "activating"
  );
  const [visibleSteps, setVisibleSteps] = useState(0);
  const [planName, setPlanName] = useState(initialPlanName);

  // Refs para coordenar steps vs. confirmação do poll
  const allStepsShown = useRef(initiallyActive);
  const pollConfirmed = useRef(initiallyActive);
  const confirmedPlanName = useRef(initialPlanName);

  function tryTransitionToSuccess() {
    if (allStepsShown.current && pollConfirmed.current) {
      setPlanName(confirmedPlanName.current);
      setState("success");
    }
  }

  useEffect(() => {
    if (state !== "activating") return;

    // Exibe steps com delay sequencial
    const t1 = setTimeout(() => setVisibleSteps(1), STEP_DELAY_MS);
    const t2 = setTimeout(() => setVisibleSteps(2), STEP_DELAY_MS * 2);
    const t3 = setTimeout(() => {
      setVisibleSteps(3);
      allStepsShown.current = true;
      tryTransitionToSuccess();
    }, STEP_DELAY_MS * 3);

    // Timeout global
    const timeout = setTimeout(() => {
      if (state === "activating") setState("timeout");
    }, TIMEOUT_MS);

    // Polling a cada 2s
    const poll = setInterval(async () => {
      try {
        const res = await fetch("/api/billing/status");
        if (!res.ok) return;
        const data = (await res.json()) as { status?: string; planName?: string };
        if (data.status === "active") {
          clearInterval(poll);
          clearTimeout(timeout);
          confirmedPlanName.current = data.planName ?? "";
          pollConfirmed.current = true;
          tryTransitionToSuccess();
        }
      } catch {
        // continua tentando
      }
    }, POLL_INTERVAL_MS);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(timeout);
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // roda apenas uma vez na montagem

  const isPro =
    planName.toLowerCase().includes("pro") ||
    planName === "Pro";

  return (
    // Overlay — não fecha com ESC ou clique externo durante "activating"
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={state !== "activating" ? undefined : (e) => e.stopPropagation()}
    >
      <div
        className={cn(
          "relative w-full max-w-sm rounded-2xl border bg-surface p-7 shadow-2xl",
          isPro && state === "success"
            ? "border-line-strong bg-gradient-to-b from-surface-hover to-surface"
            : "border-line"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Botão fechar — só disponível fora do estado "activating" */}
        {state !== "activating" && (
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-md p-1 text-txt-dim transition-colors hover:text-txt"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {state === "activating" && (
          <div>
            <div className="flex justify-center">
              <Loader2 className="h-10 w-10 animate-spin text-txt-mut" aria-hidden />
            </div>
            <h2 className="mt-5 text-center font-display text-lg font-semibold">
              Ativando seu plano...
            </h2>
            <p className="mt-1 text-center text-sm text-txt-dim">
              Aguarde enquanto processamos tudo para você.
            </p>
            <div className="mt-7 space-y-3.5">
              {STEPS.map((text, i) => (
                <StepItem key={text} text={text} visible={visibleSteps > i} />
              ))}
            </div>
          </div>
        )}

        {state === "success" && isPro && (
          <SuccessPro planName={planName || "Pro"} onClose={onClose} />
        )}

        {state === "success" && !isPro && (
          <SuccessStarter planName={planName || "Starter"} onClose={onClose} />
        )}

        {state === "timeout" && <TimeoutState onClose={onClose} />}
      </div>
    </div>
  );
}
