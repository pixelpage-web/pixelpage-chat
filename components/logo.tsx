"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Marca da PixelPage Chat.
 * Tenta carregar /public/logo.svg → /public/logo.png → fallback final em
 * texto estilizado (nunca quebra o build/render se os arquivos não existirem).
 * `compact` = só o símbolo (sidebar colapsada / mobile).
 */
export function Logo({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  // Cadeia de fallback: svg → png → texto
  const [source, setSource] = useState<"svg" | "png" | "text">("svg");

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
