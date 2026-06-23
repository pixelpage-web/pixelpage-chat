import { Logo } from "@/components/logo";
import { LanguageSwitcher } from "@/components/language-switcher";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      {/* Brilho sutil de fundo — identidade, sem gradiente genérico */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_at_top,rgba(255,92,0,0.07),transparent_60%)]"
        aria-hidden
      />
      <div className="fixed right-4 top-4">
        <LanguageSwitcher />
      </div>
      <Logo className="mb-8" />
      <div className="w-full max-w-sm">{children}</div>
      <p className="mt-8 text-center text-xs text-txt-dim">
        PixelPage Chat — Tech Provider oficial Meta
      </p>
    </div>
  );
}
