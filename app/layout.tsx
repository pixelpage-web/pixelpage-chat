import type { Metadata } from "next";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

// Identidade oficial (redesign): Space Grotesk pra títulos, Inter pro corpo,
// JetBrains Mono só pra badges/timestamps/valores técnicos (nunca título,
// corpo ou botão — ver uso restrito em tailwind.config.ts). Substituem a
// Onest, que era a única fonte do sistema anterior.
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
  weight: ["500", "600", "700"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
  weight: ["400", "500"],
});

// Aplica a classe `dark` no <html> antes do 1º paint, lendo a preferência
// salva (ou o SO como fallback) — sem isso haveria um flash do tema errado
// entre o HTML estático do servidor e o useEffect do useTheme.
const themeInitScript = `(function(){try{var t=localStorage.getItem('theme');var isDark=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(isDark)document.documentElement.classList.add('dark');}catch(e){}})();`;

export const metadata: Metadata = {
  title: {
    default: "PixelPage Chat",
    template: "%s · PixelPage Chat",
  },
  description:
    "Plataforma de WhatsApp Business com Bot IA — inbox, automação e API pública.",
  // Favicon: sem campo `icons` explícito — app/icon.svg (convenção nativa do
  // Next.js App Router) é detectado automaticamente, sem precisar apontar
  // pra cá. Antes apontava pro /logo.svg antigo (mark detalhado, ilegível
  // em favicon) com um /logo.png de fallback que nem existia como arquivo.
  // Impede a sugestão automática de tradução do Chrome — a interface é só em
  // português por design, não faz sentido o navegador oferecer traduzir.
  other: {
    google: "notranslate",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="pt-BR"
      className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="font-sans">
        {children}
        <Toaster
          theme="dark"
          position="top-right"
          toastOptions={{
            style: {
              background: "#1A1A1A",
              border: "1px solid #2E2E2E",
              color: "#F8F8F8",
            },
          }}
        />
      </body>
    </html>
  );
}
