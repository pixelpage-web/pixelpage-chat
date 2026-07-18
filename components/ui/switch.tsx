"use client";

import { cn } from "@/lib/utils";

/** Toggle switch — estado ativo em contraste neutro invertido (sem verde).
    variant="forest" é a exceção: acento verde do painel admin (/admin), que
    usa tokens próprios (ver tailwind.config.ts) e já tem esse padrão de
    destaque em outros lugares (admin-shell.tsx). */
export function Switch({
  checked,
  onChange,
  disabled,
  label,
  variant = "neutral",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  variant?: "neutral" | "forest";
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "focus-ring relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        checked
          ? variant === "forest"
            ? "border-forest bg-forest"
            : "border-txt/40 bg-txt"
          : "border-line-strong bg-surface-raised"
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full transition-transform",
          checked ? "translate-x-6" : "translate-x-1",
          checked
            ? variant === "forest"
              ? "bg-white"
              : "bg-ink"
            : "bg-txt-dim"
        )}
      />
    </button>
  );
}
