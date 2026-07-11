"use client";

import { Suspense, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { CaptchaWidget } from "@/components/captcha-widget";
import { GoogleButton } from "../google-button";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useT();
  const next = searchParams.get("next") ?? "/app";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
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
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, captchaToken }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(
          json.error
            ? t(json.error)
            : t("Não foi possível entrar. Tente novamente.")
        );
        turnstileRef.current?.reset();
        setCaptchaToken("");
        return;
      }
      router.replace(next);
      router.refresh();
    } catch {
      toast.error(t("Erro de conexão. Verifique sua internet e tente novamente."));
      turnstileRef.current?.reset();
      setCaptchaToken("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="animate-fade-up rounded-card border border-line bg-surface p-6 sm:p-8">
      <h1 className="font-display text-2xl font-semibold text-txt">{t("Entrar")}</h1>
      <p className="mt-1.5 text-sm text-txt-mut">
        {t("Acesse o painel da sua empresa.")}
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
          />
        </div>
        <div>
          <Label htmlFor="password">{t("Senha")}</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
          <Link
            href="/forgot-password"
            className="focus-ring mt-1.5 inline-block text-xs font-medium text-txt-mut hover:text-lime hover:underline"
          >
            {t("Esqueci minha senha")}
          </Link>
        </div>
        <CaptchaWidget
          ref={turnstileRef}
          onVerify={setCaptchaToken}
          onExpire={() => setCaptchaToken("")}
        />
        <Button type="submit" className="w-full" loading={loading}>
          {t("Entrar")}
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-txt-dim">
        <div className="h-px flex-1 bg-line" />
        {t("ou")}
        <div className="h-px flex-1 bg-line" />
      </div>

      <GoogleButton next={next} />

      <p className="mt-6 text-center text-sm text-txt-mut">
        {t("Não tem conta?")}{" "}
        <Link href="/register" className="font-medium text-lime hover:underline">
          {t("Criar conta grátis")}
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
