"use client";

import { Languages } from "lucide-react";
import { useLang, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const options: { value: Lang; label: string }[] = [
  { value: "pt", label: "PT" },
  { value: "en", label: "EN" },
];

/** Seletor de idioma PT/EN — atualiza a interface na hora. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { lang, setLang } = useLang();

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border border-line bg-surface p-0.5",
        className
      )}
      role="group"
      aria-label="Idioma / Language"
    >
      <Languages className="ml-1.5 h-3.5 w-3.5 text-txt-dim" aria-hidden />
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setLang(opt.value)}
          className={cn(
            "focus-ring rounded-md px-2 py-1 text-xs font-semibold transition-colors",
            lang === opt.value
              ? "bg-lime text-white"
              : "text-txt-dim hover:text-txt"
          )}
          aria-pressed={lang === opt.value}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
