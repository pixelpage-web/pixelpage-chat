import type { Config } from "tailwindcss";

/**
 * Design tokens da PixelPage Chat.
 *
 * IDENTIDADE OFICIAL (brandboard aprovado): verde natural — claro `#159A3D`,
 * escuro `#4FE04C` (token "brand") — substitui o verde-neon #00FF41 do passo
 * anterior do redesign (que por sua vez veio do verde elétrico #5DD62C,
 * token "lime", e antes disso um laranja #FF5D00 nunca adotado). Os tokens
 * antigos (ink/surface/line/lime/txt) continuam ativos e em uso na maioria
 * dos componentes — migração pros tokens "theme-*"/"brand" ainda em
 * andamento. Ver `app/globals.css` pros valores completos de :root/.dark.
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
        // Acento principal — identidade oficial (brandboard aprovado),
        // verde natural. Substituiu o verde elétrico #5DD62C (que por sua
        // vez tinha sido a base do neon #00FF41 abandonado no redesign
        // anterior). "lime" é o token usado na maioria do app (register,
        // login, botões) — sempre no tom escuro/brilhante, já que essa
        // camada não participa do toggle claro/escuro (ver comentário
        // no topo do arquivo).
        lime: {
          DEFAULT: "#4FE04C",
          bright: "#7CE879",
          dim: "#159A3D",
          soft: "rgba(79, 224, 76, 0.14)",
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

        // ── Identidade oficial (brandboard aprovado — verde natural) ───
        // Valores fixos da paleta dark de referência — usados em qualquer
        // lugar que precise do tom exato independente do tema ativo (ex:
        // IconBadge). Substituem o verde-neon #00FF41 do passo anterior.
        brand: "#4FE04C",
        bg: "#0B0F0C",
        surface2: "#1B231A",
        "border-dark": "#232D21",
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
        // Identidade oficial: Space Grotesk (títulos) + Inter (corpo) +
        // JetBrains Mono (uso restrito — só badges de status, timestamps e
        // valores técnicos; nunca título, corpo de texto ou botão). Ver
        // app/layout.tsx pras variáveis next/font.
        display: ["var(--font-space-grotesk)", "system-ui", "sans-serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
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
        "toast-in": {
          "0%": { opacity: "0", transform: "translateY(28px) scale(0.9)" },
          "55%": { opacity: "1", transform: "translateY(-3px) scale(1.015)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "toast-out": {
          "0%": { opacity: "1", transform: "translateY(0) scale(1)" },
          "100%": { opacity: "0", transform: "translateY(14px) scale(0.95)" },
        },
        "urgent-pulse": {
          "0%, 100%": {
            boxShadow:
              "0 0 0 1px rgba(239,68,68,0.35), 0 8px 30px rgba(0,0,0,0.55)",
          },
          "50%": {
            boxShadow:
              "0 0 0 1.5px rgba(239,68,68,0.9), 0 0 18px rgba(239,68,68,0.4), 0 8px 30px rgba(0,0,0,0.55)",
          },
        },
        "shrink-bar": {
          "0%": { transform: "scaleX(1)" },
          "100%": { transform: "scaleX(0)" },
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
        "toast-in": "toast-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
        "toast-out": "toast-out 0.2s ease-in forwards",
        "urgent-pulse": "urgent-pulse 2.4s ease-in-out infinite",
        // Duração fixa (8s) sincronizada com AUTO_DISMISS_MS em
        // components/system-notifications.tsx — mudou lá, muda aqui também.
        "shrink-bar": "shrink-bar 8s linear forwards",
        float: "float 6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
