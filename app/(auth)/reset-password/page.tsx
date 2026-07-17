"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, KeyRound, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import {
  isValidPassword,
  passwordStrength,
  type PasswordStrength,
} from "@/lib/br-validators";

const strengthMeta: Record<PasswordStrength, { label: string; bars: number; color: string }> = {
  fraca: { label: "Senha fraca", bars: 1, color: "bg-danger" },
  media: { label: "Senha média", bars: 2, color: "bg-amber" },
  forte: { label: "Senha forte", bars: 3, color: "bg-txt" },
};

type LinkStatus = "checking" | "valid" | "invalid";

export default function ResetPasswordPage() {
  const t = useT();
  const router = useRouter();
  const [linkStatus, setLinkStatus] = useState<LinkStatus>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [touched, setTouched] = useState({ password: false, confirmPassword: false });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    // O link de recuperação do Supabase entrega a sessão via fragmento da URL
    // (#access_token=...&refresh_token=...&type=recovery) — o client de
    // @supabase/ssr (createBrowserClient) guarda sessão em cookies pra dar
    // suporte a SSR e NÃO faz a detecção automática de fragmento que o
    // supabase-js "puro" faz (detectSessionInUrl); por isso extraímos e
    // aplicamos a sessão manualmente com setSession().
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (accessToken && refreshToken && params.get("type") === "recovery") {
      supabase.auth
        .setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ error }) => {
          setLinkStatus(error ? "invalid" : "valid");
          // Remove o token da URL visível/histórico assim que aplicado
          window.history.replaceState(null, "", window.location.pathname);
        });
      return;
    }

    // Sem fragmento (ex.: usuário recarregou a página) — só aceita se já
    // houver uma sessão de recovery ativa nos cookies.
    supabase.auth.getSession().then(({ data }) => {
      setLinkStatus(data.session ? "valid" : "invalid");
    });
  }, []);

  const passwordValid = isValidPassword(password);
  const confirmValid = confirmPassword.length > 0 && confirmPassword === password;
  const strength = password.length > 0 ? passwordStrength(password) : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ password: true, confirmPassword: true });
    if (!passwordValid || !confirmValid) return;

    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast.error(t("Não foi possível redefinir a senha. Tente novamente."));
        return;
      }
      toast.success(t("Senha redefinida! Você já está conectado."));
      router.replace("/app");
      router.refresh();
    } catch {
      toast.error(t("Erro de conexão. Verifique sua internet e tente novamente."));
    } finally {
      setLoading(false);
    }
  }

  if (linkStatus === "checking") {
    return (
      <div className="animate-fade-up rounded-card border border-line bg-surface p-8 text-center">
        <p className="text-sm text-txt-mut">{t("Verificando link…")}</p>
      </div>
    );
  }

  if (linkStatus === "invalid") {
    return (
      <div className="animate-fade-up rounded-card border border-line bg-surface p-6 text-center sm:p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft">
          <XCircle className="h-6 w-6 text-danger" aria-hidden />
        </div>
        <h1 className="mt-4 font-display text-xl font-semibold text-txt">
          {t("Link inválido ou expirado")}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-txt-mut">
          {t("Este link de redefinição não é mais válido. Solicite um novo.")}
        </p>
        <Link
          href="/forgot-password"
          className="focus-ring mt-6 inline-flex items-center gap-1.5 rounded-lg bg-txt px-4 py-2 text-sm font-semibold text-ink hover:opacity-90"
        >
          {t("Solicitar novo link")}
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-fade-up rounded-card border border-line bg-surface p-6 sm:p-8">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-raised">
        <KeyRound className="h-5 w-5 text-txt-mut" aria-hidden />
      </div>
      <h1 className="mt-3 font-display text-2xl font-semibold text-txt">
        {t("Criar nova senha")}
      </h1>
      <p className="mt-1.5 text-sm text-txt-mut">
        {t("Escolha uma senha nova para sua conta.")}
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="password" hint={t("mínimo 8 caracteres, 1 número, 1 maiúscula")}>
            {t("Nova senha")}
          </Label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => setTouched((s) => ({ ...s, password: true }))}
            placeholder="••••••••"
            autoFocus
          />
          {touched.password && password.length > 0 && !passwordValid && (
            <p className="mt-1.5 text-xs text-danger">
              {t("A senha precisa ter 8+ caracteres, 1 número e 1 letra maiúscula.")}
            </p>
          )}
          {strength && (
            <div className="mt-2">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-1 flex-1 rounded-full",
                      i < strengthMeta[strength].bars ? strengthMeta[strength].color : "bg-line"
                    )}
                  />
                ))}
              </div>
              <p className="mt-1 text-xs text-txt-dim">{t(strengthMeta[strength].label)}</p>
            </div>
          )}
        </div>

        <div>
          <Label htmlFor="confirm-password">{t("Confirmar nova senha")}</Label>
          <PasswordInput
            id="confirm-password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onBlur={() => setTouched((s) => ({ ...s, confirmPassword: true }))}
            placeholder="••••••••"
          />
          {touched.confirmPassword && confirmPassword.length > 0 && !confirmValid && (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-danger">
              <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
              {t("As senhas não coincidem.")}
            </p>
          )}
        </div>

        <Button type="submit" className="w-full" loading={loading}>
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          {t("Redefinir senha")}
        </Button>
      </form>
    </div>
  );
}
