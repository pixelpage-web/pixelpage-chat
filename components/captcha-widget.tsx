"use client";

import { forwardRef } from "react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";

// Sempre passa no client — usada só como fallback em dev quando a site key
// real não está configurada em .env.local, pra não travar quem acabou de
// clonar o projeto. Se a site key real estiver setada, ela tem prioridade
// mesmo em dev: a sandbox key só é validada pelo secret de teste da própria
// Cloudflare, então contra o secret real (configurado no Supabase) ela
// sempre falha no servidor — não dá pra completar login/cadastro de verdade
// com ela, só testar o bloqueio no client.
const SANDBOX_SITE_KEY = "1x00000000000000000000AA";

const siteKey =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ||
  (process.env.NODE_ENV !== "production" ? SANDBOX_SITE_KEY : undefined);

interface CaptchaWidgetProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  className?: string;
}

/** Dispara o desafio num momento ocioso, fora do caminho crítico do 1º paint. */
function deferExecute(ref: React.ForwardedRef<TurnstileInstance | undefined>) {
  const run = () => {
    if (ref && typeof ref === "object" && ref.current) {
      ref.current.execute();
    }
  };
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    window.requestIdleCallback(run, { timeout: 2000 });
  } else {
    setTimeout(run, 0);
  }
}

/**
 * Widget Cloudflare Turnstile — usado em /register, /login e /forgot-password.
 * `execution: "execute"` adia o fetch pesado do desafio (na prática, ~430 KB
 * de rede) pra depois do 1º paint da tela em vez de disparar assim que o
 * script carrega — o widget continua aparecendo, só a checagem em si começa
 * um instante depois, sem competir com o carregamento do conteúdo principal.
 */
export const CaptchaWidget = forwardRef<TurnstileInstance | undefined, CaptchaWidgetProps>(
  function CaptchaWidget({ onVerify, onExpire, className }, ref) {
    if (!siteKey) return null;

    return (
      <Turnstile
        ref={ref}
        siteKey={siteKey}
        className={className}
        options={{ theme: "dark", size: "flexible", execution: "execute" }}
        onWidgetLoad={() => deferExecute(ref)}
        onSuccess={onVerify}
        onExpire={() => onExpire?.()}
        onError={() => onExpire?.()}
      />
    );
  }
);
