"use client";

import { Bot } from "lucide-react";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";
import { Ticker } from "@/components/ui/Ticker";
import { useT } from "@/lib/i18n";

const bullets = [
  "Bot com IA treinado com o jeito da sua empresa",
  "Número verificado — API oficial da Meta",
  "Inbox unificado para toda a equipe responder junto",
];

// Pills flutuantes ao redor do texto do hero, só em /register (item E).
// Posições/tempos variados pra não ficarem sincronizadas.
const floatingTags: {
  label: string;
  style: React.CSSProperties;
}[] = [
  { label: "Atendimento 24h", style: { top: "4%", right: "4%", animationDuration: "5s", animationDelay: "0s" } },
  { label: "Bot com IA", style: { top: "16%", left: "0%", animationDuration: "6s", animationDelay: "0.8s" } },
  { label: "Multi-atendente", style: { top: "38%", right: "0%", animationDuration: "4.5s", animationDelay: "1.6s" } },
  { label: "WhatsApp Oficial", style: { top: "54%", left: "2%", animationDuration: "5.5s", animationDelay: "0.4s" } },
  { label: "Setup em minutos", style: { top: "70%", right: "6%", animationDuration: "6.5s", animationDelay: "2.2s" } },
  { label: "Sem cartão", style: { top: "80%", left: "8%", animationDuration: "5s", animationDelay: "1.2s" } },
];

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const t = useT();
  const pathname = usePathname();
  const isRegister = pathname === "/register";

  return (
    <div className="flex min-h-dvh flex-col bg-ink lg:flex-row">
      {/* Painel de marca — faixa compacta no mobile, painel completo a partir de lg */}
      <div className="relative isolate overflow-hidden bg-ink-deep px-6 py-6 lg:flex lg:w-[46%] lg:min-w-[420px] lg:flex-col lg:justify-between lg:px-14 lg:py-14 lg:[clip-path:polygon(0_0,100%_0,92%_100%,0_100%)]">
        {/* Grade de pontos — textura sutil */}
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(rgba(93,214,44,0.16) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
          aria-hidden
        />
        {/* Brilhos radiais — âncoras nos cantos, não no centro */}
        <div
          className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-lime/10 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -top-24 -right-16 hidden h-72 w-72 rounded-full bg-lime/5 blur-3xl lg:block"
          aria-hidden
        />

        {/* Topo: logo */}
        <div className="relative z-10 flex items-center justify-between lg:block">
          <Logo />
        </div>

        {/* Pills flutuantes (item E) — só em /register, mesma visibilidade do
            texto do hero que elas decoram (hidden até lg) */}
        {isRegister && (
          <div className="pointer-events-none absolute inset-0 z-0 hidden lg:block" aria-hidden>
            {floatingTags.map((tag) => (
              <span key={tag.label} className="floating-tag" style={tag.style}>
                {t(tag.label)}
              </span>
            ))}
          </div>
        )}

        {/* Conteúdo completo — somente lg+ */}
        <div className="relative z-10 mt-10 hidden flex-1 flex-col justify-center lg:flex">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-lime/70">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-lime align-middle" />
            {t("online · resposta em segundos")}
          </p>
          <h2 className="mt-4 font-display text-3xl font-bold leading-tight text-txt">
            {t("Seu WhatsApp,")}
            <br />
            {t("automatizado com IA.")}
          </h2>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-txt-mut">
            {t(
              "Inbox, bot inteligente e automações num só lugar para sua empresa vender e atender mais rápido."
            )}
          </p>

          {/* Mock de conversa — bolhas flutuantes */}
          <div className="relative mt-10 h-48" aria-hidden>
            <div
              className="absolute left-0 top-0 w-[70%] max-w-[230px] -rotate-2 animate-float rounded-2xl rounded-bl-sm border border-line bg-surface p-3 shadow-pop"
              style={{ animationDelay: "0s" }}
            >
              <p className="text-xs leading-relaxed text-txt-mut">
                {t("Olá! Vocês entregam hoje?")}
              </p>
            </div>
            <div
              className="absolute right-0 top-16 w-[75%] max-w-[240px] rotate-1 animate-float rounded-2xl rounded-br-sm border border-lime/30 bg-lime-soft p-3 shadow-pop"
              style={{ animationDelay: "1.2s" }}
            >
              <div className="mb-1 flex items-center gap-1.5 text-lime">
                <Bot className="h-3 w-3" aria-hidden />
                <span className="font-mono text-[10px] uppercase tracking-wide">
                  IA
                </span>
              </div>
              <p className="text-xs leading-relaxed text-txt">
                {t("Sim! Entrega em até 40 min 🚀")}
              </p>
            </div>
            <div className="absolute left-4 top-[7.5rem] flex items-center gap-1 rounded-2xl rounded-bl-sm border border-line bg-surface px-3 py-2.5">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-txt-dim" />
              <span
                className="h-1.5 w-1.5 animate-bounce rounded-full bg-txt-dim"
                style={{ animationDelay: "0.15s" }}
              />
              <span
                className="h-1.5 w-1.5 animate-bounce rounded-full bg-txt-dim"
                style={{ animationDelay: "0.3s" }}
              />
            </div>
          </div>

          <ul className="mt-8 space-y-3">
            {bullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-2.5 text-sm text-txt-mut">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-[2px] bg-lime" aria-hidden />
                {t(bullet)}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 mt-8 hidden text-xs text-txt-dim lg:block">
          © 2026 PixelPage Chat. Todos os direitos reservados.
        </p>
      </div>

      {/* Ticker (item B) — só em /register, entre o painel de marca e o formulário */}
      {isRegister && <Ticker />}

      {/* Painel direito — formulário */}
      <div className="relative flex flex-1 flex-col">
        <div className="flex flex-1 items-center justify-center overflow-y-auto px-4 py-8 lg:py-10">
          <div className="w-full max-w-sm">
            {children}
            <p className="mt-8 text-center text-xs text-txt-dim lg:hidden">
              © 2026 PixelPage Chat. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
