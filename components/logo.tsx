"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  compact?: boolean;
  /** logo customizada da org (white-label) — null/undefined = logo padrão da plataforma */
  orgLogoUrl?: string | null;
  /** nome exibido junto da logo customizada — null/undefined = "PixelPage Chat" */
  orgName?: string | null;
}

/**
 * Mark detalhado (grid 6x5 do brandboard) — sidebar (32px+), header, telas
 * de marketing. `fill="currentColor"` herda a cor do elemento pai via CSS
 * `color` (className `text-*`), então funciona em qualquer tema/contexto
 * sem precisar de variante hardcoded.
 */
export function MarkDetailed({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 99 82" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden>
      <rect x="17" y="0" width="14" height="14" rx="3" /><rect x="34" y="0" width="14" height="14" rx="3" /><rect x="51" y="0" width="14" height="14" rx="3" /><rect x="68" y="0" width="14" height="14" rx="3" />
      <rect x="0" y="17" width="14" height="14" rx="3" /><rect x="17" y="17" width="14" height="14" rx="3" /><rect x="34" y="17" width="14" height="14" rx="3" /><rect x="51" y="17" width="14" height="14" rx="3" /><rect x="68" y="17" width="14" height="14" rx="3" /><rect x="85" y="17" width="14" height="14" rx="3" />
      <rect x="0" y="34" width="14" height="14" rx="3" /><rect x="17" y="34" width="14" height="14" rx="3" /><rect x="34" y="34" width="14" height="14" rx="3" /><rect x="51" y="34" width="14" height="14" rx="3" /><rect x="68" y="34" width="14" height="14" rx="3" /><rect x="85" y="34" width="14" height="14" rx="3" />
      <rect x="0" y="51" width="14" height="14" rx="3" /><rect x="17" y="51" width="14" height="14" rx="3" /><rect x="34" y="51" width="14" height="14" rx="3" /><rect x="51" y="51" width="14" height="14" rx="3" /><rect x="68" y="51" width="14" height="14" rx="3" /><rect x="85" y="51" width="14" height="14" rx="3" />
      <rect x="17" y="68" width="14" height="14" rx="3" />
    </svg>
  );
}

/**
 * Mark simplificado (silhueta sólida, sem grid interno) — favicon e
 * qualquer uso abaixo de 24px, onde o grid detalhado deixa de ser legível.
 * Exportado pra reuso fora deste componente (ex.: gerar o favicon estático).
 */
export function MarkSimple({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 99 82" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden>
      <path d="M14 0h71a14 14 0 0 1 14 14v37a14 14 0 0 1-14 14H31v14a3 3 0 0 1-5 2l-15-16H14A14 14 0 0 1 0 51V14A14 14 0 0 1 14 0z" />
    </svg>
  );
}

/**
 * Marca exibida na sidebar. Duas identidades possíveis:
 * - Sem `orgLogoUrl`: marca da PixelPage Chat — mark detalhado (SVG inline,
 *   currentColor) + wordmark. Nunca quebra o build/render (não depende de
 *   arquivo externo).
 * - Com `orgLogoUrl` (white-label): logo + nome da própria org; se a imagem
 *   falhar, cai num quadrado com a inicial do nome da org.
 * `compact` = só o símbolo (sidebar colapsada / mobile) — ainda em 32px,
 * dentro da faixa do mark detalhado (ver MarkSimple pra <24px).
 */
export function Logo({ className, compact = false, orgLogoUrl, orgName }: LogoProps) {
  // Logo da org deu erro de carregamento → cai pro quadrado com inicial
  const [orgLogoFailed, setOrgLogoFailed] = useState(false);

  if (orgLogoUrl && !orgLogoFailed) {
    return (
      <div className={cn("flex select-none items-center gap-2.5", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={orgLogoUrl}
          alt={orgName ?? "Logo"}
          className="h-8 w-8 shrink-0 rounded-lg object-contain"
          onError={() => setOrgLogoFailed(true)}
        />
        {!compact && orgName && (
          <span className="font-display text-lg font-semibold tracking-tight text-txt">
            {orgName}
          </span>
        )}
      </div>
    );
  }

  if (orgLogoUrl && orgLogoFailed) {
    const initial = (orgName ?? "?").trim().charAt(0).toUpperCase() || "?";
    return (
      <div className={cn("flex select-none items-center gap-2.5", className)}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand font-display text-base font-bold text-ink">
          {initial}
        </div>
        {!compact && orgName && (
          <span className="font-display text-lg font-semibold tracking-tight text-txt">
            {orgName}
          </span>
        )}
      </div>
    );
  }

  /** Mark padrão da plataforma — grid detalhado, cor herdada via currentColor. */
  const mark = (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-ink">
      <MarkDetailed className="h-5 w-5" />
    </div>
  );

  return (
    <div className={cn("flex select-none items-center gap-2.5", className)}>
      {mark}
      {!compact && (
        <span className="font-display text-lg font-semibold tracking-tight text-txt">
          <span className="text-brand">PixelPage</span> Chat
        </span>
      )}
    </div>
  );
}
