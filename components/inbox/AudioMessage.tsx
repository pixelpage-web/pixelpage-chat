"use client";

import { useEffect, useState } from "react";
import { Mic } from "lucide-react";
import { useT } from "@/lib/i18n";

type Support = "checking" | "supported" | "unsupported";

/**
 * Notas de voz do WhatsApp vêm em Ogg/Opus — Chrome/Firefox/Edge tocam
 * nativamente, mas Safari e qualquer navegador em iOS (WebKit por baixo,
 * independente da marca) não decodificam o container Ogg. Sem isso, o
 * <audio> fica travado em "0:00 / 0:00" sem nunca carregar.
 *
 * A detecção só pode rodar no client (usa o construtor Audio, que não
 * existe no SSR) — por isso o estado começa em "checking" tanto no
 * servidor quanto no 1º render do client (renderiza null nos dois),
 * e só decide qual UI mostrar depois do useEffect, evitando hydration
 * mismatch.
 */
export function AudioMessage({ url }: { url: string }) {
  const t = useT();
  const [support, setSupport] = useState<Support>("checking");

  useEffect(() => {
    try {
      const canPlayOgg =
        typeof Audio !== "undefined" &&
        new Audio().canPlayType('audio/ogg; codecs="opus"') !== "";
      setSupport(canPlayOgg ? "supported" : "unsupported");
    } catch {
      setSupport("unsupported");
    }
  }, []);

  if (support === "checking") return null;

  if (support === "supported") {
    return <audio controls src={url} className="mb-1.5 w-56 max-w-full" />;
  }

  // Safari/iOS: sem player embutido quebrado — abre em nova aba, onde o
  // próprio Safari toca o áudio nativamente fora do <audio> do WhatsApp.
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mb-1.5 flex items-center gap-2.5 rounded-lg border border-line bg-ink/40 px-3 py-2.5 text-txt hover:border-lime/40"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lime/15 text-lime">
        <Mic className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium">{t("Nota de voz")}</span>
        <span className="block text-[11px] text-txt-mut underline">
          {t("Ouvir áudio")}
        </span>
      </span>
    </a>
  );
}
