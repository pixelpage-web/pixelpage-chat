"use client";

import { Logo } from "@/components/logo";
import { ChatMockup } from "@/components/ui/ChatMockup";
import { useT } from "@/lib/i18n";

const bullets = [
  "Bot com IA treinado com o jeito da sua empresa",
  "Número verificado — API oficial da Meta",
  "Inbox unificado para toda a equipe responder junto",
];

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const t = useT();

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

        {/* Conteúdo completo — somente lg+. Hierarquia reforçada (item 1d):
            sem as pills flutuantes que antes preenchiam o espaço ao redor
            do texto, o título cresce (text-4xl -> lg:text-5xl) e os
            espaçamentos entre blocos aumentam um pouco, pra não sobrar
            vazio nas bordas. */}
        <div className="relative z-10 mt-10 hidden flex-1 flex-col justify-center lg:flex">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-lime/70">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-lime align-middle" />
            {t("online · resposta em segundos")}
          </p>
          <h2 className="mt-5 font-display text-4xl font-bold leading-tight text-txt lg:text-5xl">
            {t("Seu WhatsApp,")}
            <br />
            {t("automatizado com IA.")}
          </h2>
          <p className="mt-4 max-w-md text-base leading-relaxed text-txt-mut">
            {t(
              "Inbox, bot inteligente e automações num só lugar para sua empresa vender e atender mais rápido."
            )}
          </p>

          {/* Mockup de conversa animado — único elemento com animação
              elaborada da página (item 1c) */}
          <ChatMockup />

          <ul className="mt-10 space-y-3.5">
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

      {/* Painel direito — formulário */}
      <div className="relative flex min-w-0 flex-1 flex-col">
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
