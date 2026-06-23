import type { Config } from "tailwindcss";

/**
 * Design tokens da PixelPage Chat.
 * Identidade: fundo escuro profundo, superfícies elevadas discretas,
 * acento laranja (#FF5C00) em CTAs/estados ativos, âmbar para alertas.
 * Obs.: o token segue se chamando "lime" (nome técnico interno) — só os
 * VALORES mudaram para o laranja da marca; isso evita tocar centenas de
 * classes text-lime/bg-lime espalhadas pela UI.
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
          DEFAULT: "#0B0D10",
          deep: "#07090B",
        },
        // Superfícies (cards, sidebars, inputs)
        surface: {
          DEFAULT: "#13161B",
          raised: "#191D24",
          hover: "#1F242C",
        },
        // Bordas e divisores
        line: {
          DEFAULT: "#1E2228",
          strong: "#2A3038",
        },
        // Acento principal — laranja PixelPage (#FF5C00)
        lime: {
          DEFAULT: "#FF5C00",
          bright: "#FF7A33",
          dim: "#CC4A00",
          soft: "rgba(255, 92, 0, 0.14)",
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
          DEFAULT: "#F1F5F9",
          mut: "#94A3B8",
          dim: "#64748B",
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
        pop: "0 8px 30px rgba(0, 0, 0, 0.45)",
        glow: "0 0 0 1px rgba(255, 92, 0, 0.35), 0 0 24px rgba(255, 92, 0, 0.08)",
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
