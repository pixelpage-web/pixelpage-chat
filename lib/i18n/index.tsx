"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { en } from "./en";

/**
 * Sistema de idiomas da PixelPage Chat.
 * Português é a língua-fonte (escrita direto nos componentes);
 * o dicionário `en` mapeia cada frase PT → EN.
 * Frase sem tradução cai no PT (nunca quebra a interface).
 */

export type Lang = "pt" | "en";

export const LANG_COOKIE = "zari_lang";

interface LangContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

const LangContext = createContext<LangContextValue>({
  lang: "pt",
  setLang: () => undefined,
});

export function LanguageProvider({
  initialLang,
  children,
}: {
  initialLang: Lang;
  children: React.ReactNode;
}) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    // Cookie permite que os Server Components rendam no idioma certo
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = next === "pt" ? "pt-BR" : "en";
  }, []);

  return (
    <LangContext.Provider value={{ lang, setLang }}>
      {children}
    </LangContext.Provider>
  );
}

/** Idioma atual + setter (para o seletor de idioma). */
export function useLang(): LangContextValue {
  return useContext(LangContext);
}

/** Tradutor: useT()("Entrar") → "Sign in" quando o idioma é EN. */
export function useT(): (text: string) => string {
  const { lang } = useContext(LangContext);
  return useCallback(
    (text: string) => (lang === "en" ? (en[text] ?? text) : text),
    [lang]
  );
}

/** Tradução fora de componentes React (recebe o idioma explicitamente). */
export function translate(lang: Lang, text: string): string {
  return lang === "en" ? (en[text] ?? text) : text;
}
