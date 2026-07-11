"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Ativar tema claro" : "Ativar tema escuro"}
      title={isDark ? "Tema claro" : "Tema escuro"}
      className={cn(
        "focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-theme-text-muted transition-colors hover:bg-theme-text/5 hover:text-theme-text",
        className
      )}
    >
      {/* server sempre assume "dark" (ver readTheme em useTheme.ts) — o
          client pode corrigir pra "light" no 1º render; mismatch esperado
          e inofensivo aqui, por isso suppressHydrationWarning. */}
      <span suppressHydrationWarning>
        {isDark ? (
          <Moon className="h-4 w-4" aria-hidden />
        ) : (
          <Sun className="h-4 w-4" aria-hidden />
        )}
      </span>
    </button>
  );
}
