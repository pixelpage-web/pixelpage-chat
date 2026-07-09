import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Exo_2 } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const exo2 = Exo_2({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["500", "600", "700", "800"],
});

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
    <html lang="pt-BR" className={`${plusJakarta.variable} ${exo2.variable}`}>
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
