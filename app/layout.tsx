import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { Toaster } from "sonner";
import { LanguageProvider } from "@/lib/i18n";
import { getLang } from "@/lib/i18n/server";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
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
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const lang = await getLang();
  return (
    <html
      lang={lang === "pt" ? "pt-BR" : "en"}
      className={`${inter.variable} ${spaceGrotesk.variable}`}
    >
      <body className="font-sans">
        <LanguageProvider initialLang={lang}>{children}</LanguageProvider>
        <Toaster
          theme="dark"
          position="top-right"
          toastOptions={{
            style: {
              background: "#1A1E25",
              border: "1px solid #252B34",
              color: "#E8EAED",
            },
          }}
        />
      </body>
    </html>
  );
}
