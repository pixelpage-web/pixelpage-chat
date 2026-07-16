import type { Metadata } from "next";
import { Onest } from "next/font/google";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

// Onest é a única fonte do projeto — display e sans apontam pra mesma
// variável (ver tailwind.config.ts). 600 incluído além dos pesos pedidos
// (400/500/700/900) porque font-semibold já é usado em componentes
// existentes (botões, títulos de card) — sem isso o browser sintetizaria
// o peso em vez de usar o Onest de verdade.
const onest = Onest({
  subsets: ["latin"],
  variable: "--font-onest",
  display: "swap",
  weight: ["400", "500", "600", "700", "900"],
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
  // Favicon: usa o logo.svg de /public (com fallback para .png se existir)
  icons: {
    icon: [
      { url: "/logo.svg", type: "image/svg+xml" },
      { url: "/logo.png", type: "image/png" },
    ],
  },
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
    <html lang="pt-BR" className={onest.variable}>
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
        <Analytics />
      </body>
    </html>
  );
}
