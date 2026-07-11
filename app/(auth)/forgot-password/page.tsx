"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { CaptchaWidget } from "@/components/captcha-widget";

export default function ForgotPasswordPage() {
  const t = useT();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const turnstileRef = useRef<TurnstileInstance>(undefined);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!captchaToken) {
      toast.error(t("Complete a verificação de segurança para continuar."));
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      // Nunca confirma nem nega se o e-mail existe — mesma tela de sucesso
      // nos dois casos, por segurança (evita enumeração de contas).
      // Vai direto pra /reset-password (não passa por /auth/callback): o
      // link de recuperação do Supabase entrega a sessão via fragmento
      // (#access_token=...), que nunca chega ao servidor — só o client-side
      // consegue ler, via detectSessionInUrl do próprio supabase-js.
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
        captchaToken,
      });
    } catch {
      // Segue para a tela de confirmação de qualquer forma — ver comentário acima
    } finally {
      setLoading(false);
      setSent(true);
      turnstileRef.current?.reset();
      setCaptchaToken("");
    }
  }

  if (sent) {
    return (
      <div className="animate-fade-up rounded-card border border-line bg-surface p-6 text-center sm:p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-lime-soft">
          <MailCheck className="h-6 w-6 text-lime" aria-hidden />
        </div>
        <h1 className="mt-4 font-display text-xl font-semibold text-txt">
          {t("Verifique seu e-mail")}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-txt-mut">
          {t("Se esse e-mail existir na nossa base, enviamos um link para redefinir sua senha. Confira também a caixa de spam.")}
        </p>
        <Link
          href="/login"
          className="focus-ring mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-lime hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          {t("Voltar para o login")}
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-fade-up rounded-card border border-line bg-surface p-6 sm:p-8">
      <h1 className="font-display text-2xl font-semibold text-txt">
        {t("Esqueci minha senha")}
      </h1>
      <p className="mt-1.5 text-sm text-txt-mut">
        {t("Informe seu e-mail e enviamos um link para você criar uma nova senha.")}
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@empresa.com.br"
            autoFocus
          />
        </div>
        <CaptchaWidget
          ref={turnstileRef}
          onVerify={setCaptchaToken}
          onExpire={() => setCaptchaToken("")}
        />
        <Button type="submit" className="w-full" loading={loading}>
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          {t("Enviar link de redefinição")}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-txt-mut">
        <Link
          href="/login"
          className="focus-ring inline-flex items-center gap-1.5 font-medium text-lime hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          {t("Voltar para o login")}
        </Link>
      </p>
    </div>
  );
}
