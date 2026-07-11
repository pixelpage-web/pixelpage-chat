"use client";

import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { CaptchaWidget } from "@/components/captcha-widget";
import { GoogleButton } from "../google-button";
import {
  isValidCPF,
  formatCPF,
  isValidPhoneBR,
  formatPhoneBR,
  isValidPassword,
  passwordStrength,
  type PasswordStrength,
} from "@/lib/br-validators";

type Step = 0 | 1;
type FieldStatus = "idle" | "valid" | "invalid" | "pending";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const wizardSteps = ["Seus dados", "Confirmar e-mail"];

const strengthMeta: Record<PasswordStrength, { label: string; bars: number; color: string }> = {
  fraca: { label: "Senha fraca", bars: 1, color: "bg-danger" },
  media: { label: "Senha média", bars: 2, color: "bg-amber" },
  forte: { label: "Senha forte", bars: 3, color: "bg-lime" },
};

/** Input com ícone de status (check/erro/carregando) — wrapper local, não altera o <Input> compartilhado. */
function IconInput({
  status,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { status: FieldStatus }) {
  return (
    <div className="relative">
      <Input {...props} className={cn("pr-9", className)} />
      {status !== "idle" && (
        <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
          {status === "valid" && <CheckCircle2 className="h-4 w-4 text-ok" aria-hidden />}
          {status === "invalid" && <XCircle className="h-4 w-4 text-danger" aria-hidden />}
          {status === "pending" && (
            <Loader2 className="h-4 w-4 animate-spin text-txt-dim" aria-hidden />
          )}
        </div>
      )}
    </div>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-xs text-danger">{children}</p>;
}

interface RegisterCheckResult {
  ok: boolean;
  message?: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const t = useT();
  const [step, setStep] = useState<Step>(0);
  const [loading, setLoading] = useState(false);

  // ---- Campos (etapa 1 — dados básicos) --------------------------------
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [establishmentName, setEstablishmentName] = useState("");
  const [referralCode, setReferralCode] = useState("");

  const [touched, setTouched] = useState({
    name: false,
    email: false,
    password: false,
    confirmPassword: false,
    phone: false,
    cpf: false,
    establishmentName: false,
  });

  const [cpfCheck, setCpfCheck] = useState<{
    status: "idle" | "checking" | "available" | "unavailable";
    message?: string;
  }>({ status: "idle" });
  const cpfTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [captchaToken, setCaptchaToken] = useState("");
  const turnstileRef = useRef<TurnstileInstance>(undefined);

  useEffect(() => {
    return () => {
      if (cpfTimeoutRef.current) clearTimeout(cpfTimeoutRef.current);
    };
  }, []);

  const nameValid = name.trim().length >= 3;
  const establishmentNameValid = establishmentName.trim().length > 0;
  const emailValid = EMAIL_RE.test(email);
  const phoneValid = isValidPhoneBR(phone);
  const cpfFormatValid = isValidCPF(cpf);
  const passwordValid = isValidPassword(password);
  const confirmValid = confirmPassword.length > 0 && confirmPassword === password;
  const strength = password.length > 0 ? passwordStrength(password) : null;

  function statusOf(isTouched: boolean, value: string, valid: boolean): FieldStatus {
    if (!isTouched || value.trim().length === 0) return "idle";
    return valid ? "valid" : "invalid";
  }

  const cpfStatus: FieldStatus =
    cpfCheck.status === "checking"
      ? "pending"
      : cpfCheck.status === "unavailable"
        ? "invalid"
        : statusOf(touched.cpf, cpf, cpfFormatValid);

  /** Consulta autoritativa de disponibilidade — reaproveitada no blur (UX) e no submit final. */
  async function checkRegistration(cpfValue: string, phoneValue: string): Promise<RegisterCheckResult> {
    try {
      const res = await fetch("/api/auth/register-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpf: cpfValue, phone: phoneValue }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return { ok: true };
      return {
        ok: false,
        message:
          typeof data.error === "string"
            ? data.error
            : "Não foi possível verificar seus dados agora. Tente novamente.",
      };
    } catch {
      return { ok: false, message: "Erro de conexão. Verifique sua internet e tente novamente." };
    }
  }

  /** Dispara a checagem de unicidade do CPF (debounced) — só quando CPF e telefone já têm formato válido. */
  function scheduleCpfAvailabilityCheck() {
    if (!isValidCPF(cpf) || !isValidPhoneBR(phone)) return;
    if (cpfTimeoutRef.current) clearTimeout(cpfTimeoutRef.current);
    cpfTimeoutRef.current = setTimeout(async () => {
      setCpfCheck({ status: "checking" });
      const result = await checkRegistration(cpf, phone);
      setCpfCheck(
        result.ok
          ? { status: "available" }
          : { status: "unavailable", message: result.message }
      );
    }, 500);
  }

  async function handleSubmitStep0(e: React.FormEvent) {
    e.preventDefault();
    setTouched({
      name: true,
      email: true,
      password: true,
      confirmPassword: true,
      phone: true,
      cpf: true,
      establishmentName: true,
    });

    if (
      !nameValid ||
      !establishmentNameValid ||
      !emailValid ||
      !phoneValid ||
      !cpfFormatValid ||
      !passwordValid ||
      !confirmValid
    ) {
      return;
    }

    if (!captchaToken) {
      toast.error(t("Complete a verificação de segurança para continuar."));
      return;
    }

    setLoading(true);
    try {
      const check = await checkRegistration(cpf, phone);
      if (!check.ok) {
        setCpfCheck({ status: "unavailable", message: check.message });
        toast.error(t(check.message ?? "Não foi possível verificar seus dados agora. Tente novamente."));
        setLoading(false);
        return;
      }

      const cpfDigits = cpf.replace(/\D/g, "");
      const phoneLocal = phone.replace(/\D/g, "").replace(/^55/, "").slice(0, 11);
      const metaPhone = `55${phoneLocal}`;
      const trimmedReferralCode = referralCode.trim().toLowerCase();

      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name.trim(),
            phone: metaPhone,
            cpf: cpfDigits,
            establishment_name: establishmentName.trim(),
            ...(trimmedReferralCode ? { referral_code: trimmedReferralCode } : {}),
          },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/app/onboarding`,
          captchaToken,
        },
      });

      if (error) {
        toast.error(
          error.message.includes("already registered")
            ? t("Este email já tem uma conta. Faça login.")
            : t("Não foi possível criar a conta. Tente novamente.")
        );
        turnstileRef.current?.reset();
        setCaptchaToken("");
        return;
      }

      if (data.session) {
        // Confirmação de email desativada no Supabase — entra direto
        router.replace("/app/onboarding");
        router.refresh();
        return;
      }

      setStep(1);
      setResendCooldown(60);
    } catch {
      toast.error(t("Erro de conexão. Verifique sua internet e tente novamente."));
      turnstileRef.current?.reset();
      setCaptchaToken("");
    } finally {
      setLoading(false);
    }
  }

  // ---- Etapa 2 — verificação por código de 6 dígitos --------------------
  const [otp, setOtp] = useState<string[]>(() => Array(6).fill(""));
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(60);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (step !== 1) return;
    const id = setInterval(() => {
      setResendCooldown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [step]);

  useEffect(() => {
    const code = otp.join("");
    if (code.length === 6 && !verifying) {
      void handleVerify(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  async function handleVerify(code: string) {
    setVerifying(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
      if (error) {
        toast.error(t("Código inválido ou expirado. Tente novamente ou solicite um novo código."));
        setOtp(Array(6).fill(""));
        otpRefs.current[0]?.focus();
        return;
      }
      router.replace("/app/onboarding");
      router.refresh();
    } catch {
      toast.error(t("Erro de conexão. Verifique sua internet e tente novamente."));
      setOtp(Array(6).fill(""));
      otpRefs.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  }

  function handleOtpChange(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    setOtp((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    if (digit && index < 5) otpRefs.current[index + 1]?.focus();
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  }

  function handleOtpPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    e.preventDefault();
    const next = Array(6).fill("");
    for (let i = 0; i < text.length; i++) next[i] = text[i];
    setOtp(next);
    otpRefs.current[Math.min(text.length, 5)]?.focus();
  }

  async function handleResend() {
    if (resendCooldown > 0 || resending) return;
    setResending(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) {
        toast.error(t("Não foi possível reenviar o código. Tente novamente em instantes."));
        return;
      }
      setResendCooldown(60);
      toast.success(t("Novo código enviado."));
    } catch {
      toast.error(t("Erro de conexão. Verifique sua internet e tente novamente."));
    } finally {
      setResending(false);
    }
  }

  return (
    <div>
      {/* Indicador de passos */}
      <ol className="mb-6 flex items-center justify-center gap-2">
        {wizardSteps.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold",
                i < step
                  ? "bg-lime text-white"
                  : i === step
                    ? "border border-lime text-lime"
                    : "border border-line text-txt-dim"
              )}
            >
              {i < step ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
            </span>
            <span
              className={cn(
                "hidden text-xs sm:inline",
                i === step ? "font-medium text-txt" : "text-txt-dim"
              )}
            >
              {t(label)}
            </span>
            {i < wizardSteps.length - 1 && <span className="h-px w-6 bg-line" />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="animate-fade-up rounded-card border border-line bg-surface p-6 sm:p-8">
          <h1 className="font-display text-2xl font-semibold text-txt">{t("Criar conta")}</h1>
          <p className="mt-1.5 text-sm text-txt-mut">
            {t("7 dias grátis. Sem cartão de crédito.")}
          </p>

          <form onSubmit={handleSubmitStep0} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="name">{t("Nome completo")}</Label>
              <IconInput
                id="name"
                autoComplete="name"
                required
                value={name}
                status={statusOf(touched.name, name, nameValid)}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setTouched((s) => ({ ...s, name: true }))}
                placeholder="Maria Silva"
              />
              {touched.name && !nameValid && (
                <FieldError>{t("Informe seu nome completo.")}</FieldError>
              )}
            </div>

            <div>
              <Label htmlFor="establishment-name">{t("Nome do estabelecimento")}</Label>
              <IconInput
                id="establishment-name"
                autoComplete="organization"
                required
                value={establishmentName}
                status={statusOf(touched.establishmentName, establishmentName, establishmentNameValid)}
                onChange={(e) => setEstablishmentName(e.target.value)}
                onBlur={() => setTouched((s) => ({ ...s, establishmentName: true }))}
                placeholder="Pizzaria do Zé"
              />
              {touched.establishmentName && !establishmentNameValid && (
                <FieldError>{t("Informe o nome do seu estabelecimento.")}</FieldError>
              )}
            </div>

            <div>
              <Label htmlFor="email">Email</Label>
              <IconInput
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                status={statusOf(touched.email, email, emailValid)}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched((s) => ({ ...s, email: true }))}
                placeholder="voce@empresa.com.br"
              />
              {touched.email && !emailValid && (
                <FieldError>{t("Informe um email válido.")}</FieldError>
              )}
            </div>

            <div>
              <Label htmlFor="phone">{t("Telefone")}</Label>
              <IconInput
                id="phone"
                inputMode="tel"
                autoComplete="tel"
                required
                value={phone}
                status={statusOf(touched.phone, phone, phoneValid)}
                onChange={(e) => setPhone(formatPhoneBR(e.target.value))}
                onBlur={() => {
                  setTouched((s) => ({ ...s, phone: true }));
                  scheduleCpfAvailabilityCheck();
                }}
                placeholder="+55 (11) 9 1234-5678"
              />
              {touched.phone && phone.replace(/\D/g, "").replace(/^55/, "").length > 0 && !phoneValid && (
                <FieldError>{t("Telefone inválido.")}</FieldError>
              )}
            </div>

            <div>
              <Label htmlFor="cpf">CPF</Label>
              <IconInput
                id="cpf"
                inputMode="numeric"
                autoComplete="off"
                required
                value={cpf}
                status={cpfStatus}
                onChange={(e) => {
                  setCpf(formatCPF(e.target.value));
                  setCpfCheck({ status: "idle" });
                  if (cpfTimeoutRef.current) clearTimeout(cpfTimeoutRef.current);
                }}
                onBlur={() => {
                  setTouched((s) => ({ ...s, cpf: true }));
                  scheduleCpfAvailabilityCheck();
                }}
                placeholder="000.000.000-00"
              />
              {touched.cpf && cpf.length > 0 && !cpfFormatValid && (
                <FieldError>{t("CPF inválido.")}</FieldError>
              )}
              {cpfFormatValid && cpfCheck.status === "checking" && (
                <p className="mt-1.5 text-xs text-txt-dim">{t("verificando…")}</p>
              )}
              {cpfFormatValid && cpfCheck.status === "unavailable" && (
                <FieldError>
                  {t(cpfCheck.message ?? "Este CPF já está cadastrado.")}
                </FieldError>
              )}
            </div>

            <div>
              <Label htmlFor="password" hint={t("mínimo 8 caracteres, 1 número, 1 maiúscula")}>
                {t("Senha")}
              </Label>
              <IconInput
                id="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                status={statusOf(touched.password, password, passwordValid)}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setTouched((s) => ({ ...s, password: true }))}
                placeholder="••••••••"
              />
              {touched.password && password.length > 0 && !passwordValid && (
                <FieldError>
                  {t("A senha precisa ter 8+ caracteres, 1 número e 1 letra maiúscula.")}
                </FieldError>
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
              <Label htmlFor="confirm-password">{t("Confirmar senha")}</Label>
              <IconInput
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                status={statusOf(touched.confirmPassword, confirmPassword, confirmValid)}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onBlur={() => setTouched((s) => ({ ...s, confirmPassword: true }))}
                placeholder="••••••••"
              />
              {touched.confirmPassword && confirmPassword.length > 0 && !confirmValid && (
                <FieldError>{t("As senhas não coincidem.")}</FieldError>
              )}
            </div>

            <div>
              <Label htmlFor="referral-code" hint={t("opcional")}>
                {t("Código de indicação")}
              </Label>
              <Input
                id="referral-code"
                autoComplete="off"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value)}
                placeholder="ab12cd34"
              />
            </div>

            <CaptchaWidget
              ref={turnstileRef}
              onVerify={setCaptchaToken}
              onExpire={() => setCaptchaToken("")}
            />

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
      )}

      {step === 1 && (
        <div className="animate-fade-up rounded-card border border-line bg-surface p-6 text-center sm:p-8">
          <h1 className="font-display text-2xl font-semibold text-txt">
            {t("Confirme seu email")}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-txt-mut">
            {t("Enviamos um código de 6 dígitos para")}{" "}
            <span className="font-medium text-txt">{email}</span>.
          </p>

          <div className="mt-6 flex justify-center gap-2" onPaste={handleOtpPaste}>
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={(el) => {
                  otpRefs.current[i] = el;
                }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                disabled={verifying}
                onChange={(e) => handleOtpChange(i, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(i, e)}
                className="focus-ring h-12 w-10 rounded-lg border border-line bg-surface-raised text-center text-lg font-semibold text-txt transition-colors focus:border-lime/50 disabled:opacity-60"
              />
            ))}
          </div>

          {verifying && (
            <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-txt-dim">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              {t("Verificando…")}
            </p>
          )}

          <button
            onClick={handleResend}
            disabled={resendCooldown > 0 || resending}
            className="focus-ring mt-6 text-sm font-medium text-lime hover:underline disabled:cursor-not-allowed disabled:text-txt-dim disabled:no-underline"
          >
            {resendCooldown > 0
              ? `${t("Reenviar em")} ${resendCooldown}s`
              : t("Reenviar código")}
          </button>

          <p className="mt-6 text-sm text-txt-mut">
            <button
              onClick={() => setStep(0)}
              className="focus-ring font-medium text-txt-mut underline hover:text-txt"
            >
              {t("Errou o email? Corrigir")}
            </button>
          </p>
        </div>
      )}
    </div>
  );
}
