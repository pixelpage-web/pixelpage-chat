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
 * Marca exibida na sidebar. Duas identidades possíveis:
 * - Sem `orgLogoUrl`: marca da PixelPage Chat — tenta /logo.svg → /logo.png →
 *   fallback em texto (nunca quebra o build/render se os arquivos não existirem).
 * - Com `orgLogoUrl` (white-label): logo + nome da própria org; se a imagem
 *   falhar, cai num quadrado com a inicial do nome da org.
 * `compact` = só o símbolo (sidebar colapsada / mobile).
 */
export function Logo({ className, compact = false, orgLogoUrl, orgName }: LogoProps) {
  // Cadeia de fallback da marca padrão: svg → png → texto
  const [source, setSource] = useState<"svg" | "png" | "text">("svg");
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
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand font-display text-base font-bold text-black">
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

  /** Símbolo em texto (fallback final e também o "P" do modo compacto). */
  const mark = (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand font-display text-base font-bold text-black">
      P
    </div>
  );

  if (source === "text") {
    return (
      <div className={cn("flex select-none items-center gap-2.5", className)}>
        {mark}
        {!compact && (
          <span className="font-display text-lg font-semibold tracking-tight text-txt">
            PixelPage<span className="text-brand"> Chat</span>
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex select-none items-center gap-2.5", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={source === "svg" ? "/logo.svg" : "/logo.png"}
        alt="PixelPage Chat"
        className="h-8 w-8 shrink-0 rounded-lg object-contain"
        onError={() => setSource(source === "svg" ? "png" : "text")}
      />
      {!compact && (
        <span className="font-display text-lg font-semibold tracking-tight text-txt">
          PixelPage<span className="text-brand"> Chat</span>
        </span>
      )}
    </div>
  );
}
