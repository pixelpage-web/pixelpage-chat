"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { GoogleButton } from "../google-button";

export default function RegisterPage() {
  const router = useRouter();
  const t = useT();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error(t("A senha precisa ter pelo menos 8 caracteres."));
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/app/onboarding`,
        },
      });
      if (error) {
        toast.error(
          error.message.includes("already registered")
            ? t("Este email já tem uma conta. Faça login.")
            : t("Não foi possível criar a conta. Tente novamente.")
        );
        return;
      }
      if (data.session) {
        // Confirmação de email desativada no Supabase — entra direto
        router.replace("/app/onboarding");
        router.refresh();
      } else {
        // Confirmação de email ativada — orienta a checar a caixa de entrada
        setAwaitingConfirmation(true);
      }
    } catch {
      toast.error(t("Erro de conexão. Verifique sua internet e tente novamente."));
    } finally {
      setLoading(false);
    }
  }

  if (awaitingConfirmation) {
    return (
      <div className="rounded-card border border-line bg-surface p-6 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-lime-soft">
          <MailCheck className="h-6 w-6 text-lime" aria-hidden />
        </div>
        <h1 className="font-display text-lg font-semibold">{t("Confirme seu email")}</h1>
        <p className="mt-2 text-sm leading-relaxed text-txt-mut">
          {t("Enviamos um link de confirmação para")}{" "}
          <span className="font-medium text-txt">{email}</span>.{" "}
          {t("Clique no link para ativar sua conta e começar.")}
        </p>
        <p className="mt-6 text-sm text-txt-mut">
          {t("Já confirmou?")}{" "}
          <Link href="/login" className="font-medium text-lime hover:underline">
            {t("Fazer login")}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-line bg-surface p-6">
      <h1 className="font-display text-xl font-semibold">{t("Criar conta")}</h1>
      <p className="mt-1 text-sm text-txt-mut">
        {t("7 dias grátis. Sem cartão de crédito.")}
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="name">{t("Seu nome")}</Label>
          <Input
            id="name"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Maria Silva"
          />
        </div>
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
          <Label htmlFor="password" hint={t("mínimo 8 caracteres")}>
            {t("Senha")}
          </Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        <Button type="submit" className="w-full" loading={loading}>
          {t("Criar conta grátis")}
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-txt-dim">
        <div className="h-px flex-1 bg-line" />
        {t("ou")}
        <div className="h-px flex-1 bg-line" />
      </div>

      <GoogleButton next="/app/onboarding" />

      <p className="mt-6 text-center text-sm text-txt-mut">
        {t("Já tem conta?")}{" "}
        <Link href="/login" className="font-medium text-lime hover:underline">
          {t("Entrar")}
        </Link>
      </p>
    </div>
  );
}
