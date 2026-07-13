import type { Config } from "tailwindcss";

/**
 * Design tokens da PixelPage Chat.
 *
 * MIGRAÇÃO EM ANDAMENTO (redesign, passo 2/N): a identidade está
 * mudando de verde elétrico (#5DD62C, token "lime") para verde-neon
 * (#00FF41, token "brand" — passo anterior era laranja #FF5D00, abandonado
 * antes de qualquer adoção ampla). Os tokens antigos (ink/surface/line/
 * lime/txt) continuam ativos e em uso na maioria dos componentes — eles só
 * serão migrados/removidos nos próximos passos. Os tokens novos ("brand",
 * "bg"/"surface2"/"border-dark", "theme-*") já existem e hoje só a sidebar
 * (components/app-shell.tsx) os usa de fato.
 *
 * Tokens "panel" e "forest" são exclusivos do painel admin (/admin) —
 * fora do escopo deste redesign por ora.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Fundo profundo
        ink: {
          DEFAULT: "#0F0F0F",
          deep: "#080808",
        },
        // Superfícies (cards, sidebars, inputs)
        surface: {
          DEFAULT: "#141414",
          raised: "#1A1A1A",
          hover: "#202020",
        },
        // Bordas e divisores
        line: {
          DEFAULT: "#242424",
          strong: "#2E2E2E",
        },
        // Acento principal — verde elétrico PixelPage (#5DD62C)
        lime: {
          DEFAULT: "#5DD62C",
          bright: "#79E84D",
          dim: "#337418",
          soft: "rgba(93, 214, 44, 0.14)",
        },
        // Alertas
        amber: {
          DEFAULT: "#F0B429",
          soft: "rgba(240, 180, 41, 0.12)",
        },
        danger: {
          DEFAULT: "#EF4444",
          soft: "rgba(239, 68, 68, 0.12)",
        },
        // Acento secundário — azul para informações
        info: {
          DEFAULT: "#3B82F6",
          soft: "rgba(59, 130, 246, 0.12)",
        },
        ok: {
          DEFAULT: "#3DD68C",
          soft: "rgba(61, 214, 140, 0.12)",
        },
        // Texto
        txt: {
          DEFAULT: "#F8F8F8",
          mut: "#8A9BB0",
          dim: "#56677D",
        },

        // ── Painel Admin (/admin) ─────────────────────────────────────
        // Paleta exclusiva: preto profundo + verde elétrico
        panel: {
          DEFAULT: "#0F0F0F",
          surface: "#131313",
          card: "#1A1A1A",
          border: "#242424",
        },
        forest: {
          DEFAULT: "#5DD62C",
          dim: "#337418",
          soft: "rgba(93, 214, 44, 0.10)",
          glow: "rgba(93, 214, 44, 0.22)",
        },

        // ── Nova identidade (redesign, passo 2 — verde-neon) ───────────
        // Valores fixos da paleta dark de referência — usados em qualquer
        // lugar que precise do tom exato independente do tema ativo (ex:
        // IconBadge).
        brand: "#00FF41",
        bg: "#0A0A0A",
        surface2: "#1A1A1A",
        "border-dark": "#1A1A1A",
        // Tokens que respondem ao toggle claro/escuro (var(--x) definida em
        // globals.css) — usar estes (não os fixos acima) em qualquer
        // componente que precise se adaptar ao tema.
        "theme-bg": "var(--bg)",
        "theme-surface": "var(--surface)",
        "theme-surface-2": "var(--surface-2)",
        "theme-text": "var(--text)",
        "theme-text-muted": "var(--text-muted)",
        "theme-text-subtle": "var(--text-subtle)",
        "theme-border": "var(--border)",
        "theme-border-muted": "var(--border-muted)",
      },
      fontFamily: {
        // Onest é a única fonte do projeto — display e sans apontam pra
        // mesma variável (ver app/layout.tsx). Mantidos os dois nomes de
        // classe (font-display/font-sans) só pra não exigir troca de
        // className em nenhum componente existente.
        display: ["var(--font-onest)", "system-ui", "sans-serif"],
        sans: ["var(--font-onest)", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        card: "0.75rem",
      },
      boxShadow: {
        pop: "0 8px 30px rgba(0, 0, 0, 0.55)",
        glow: "0 0 0 1px rgba(93, 214, 44, 0.35), 0 0 24px rgba(93, 214, 44, 0.08)",
        "forest-glow": "0 0 0 1px rgba(93, 214, 44, 0.30), 0 0 20px rgba(93, 214, 44, 0.08)",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-scale": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
      },
      animation: {
        shimmer: "shimmer 1.4s linear infinite",
        "fade-up": "fade-up 0.25s ease-out",
        "fade-scale": "fade-scale 0.2s ease-out",
        float: "float 6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
