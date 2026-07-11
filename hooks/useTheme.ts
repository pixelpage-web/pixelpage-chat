"use client";

import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "theme";

/**
 * Lê o tema atual direto do DOM (classe `dark` já aplicada pelo script
 * inline anti-flash em app/layout.tsx, que roda antes do 1º paint). No
 * render do servidor cai no default "dark" — o app inteiro ainda é
 * dark-only fora da sidebar, então esse é o palpite mais correto até o
 * useEffect corrigir no client.
 */
function readTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** Tema claro/escuro — persiste em localStorage, aplica a classe `dark` no <html>. */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  return { theme, setTheme, toggleTheme };
}
