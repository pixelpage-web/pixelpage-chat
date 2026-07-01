import type { Config } from "tailwindcss";

/**
 * Design tokens da PixelPage Chat.
 * Identidade: fundo escuro profundo, superfícies elevadas neutras,
 * acento verde elétrico (#5DD62C) em CTAs/estados ativos.
 * Obs.: o token se chama "lime" (nome técnico interno) — os valores
 * foram atualizados para o verde elétrico da nova identidade visual.
 *
 * Tokens "panel" e "forest" são exclusivos do painel admin (/admin).
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
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
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
      },
      animation: {
        shimmer: "shimmer 1.4s linear infinite",
        "fade-up": "fade-up 0.25s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
