"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Gift, Loader2, Users, Zap } from "lucide-react";
import { Logo } from "@/components/logo";

const COOKIE = "ppref";

function setCookie(code: string) {
  const maxAge = 7 * 24 * 60 * 60; // 7 dias
  document.cookie = `${COOKIE}=${encodeURIComponent(code)}; max-age=${maxAge}; path=/; SameSite=Lax`;
}

/**
 * Landing page de convite/indicação — usada tanto por /r/[code] (URL curta,
 * padrão atual) quanto por /indicacao/[code] (rota antiga, mantida por
 * compatibilidade com links já compartilhados). Lógica de rastreamento
 * idêntica nas duas — só a URL exposta muda.
 */
export function ReferralLandingPage() {
  const params = useParams<{ code: string }>();
  const code = params.code ?? "";

  const [state, setState] = useState<"loading" | "valid" | "invalid">("loading");

  useEffect(() => {
    if (!code) {
      setState("invalid");
      return;
    }

    fetch("/api/referral/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })
      .then(async (res) => {
        if (res.ok) {
          setCookie(code);
          setState("valid");
        } else {
          setState("invalid");
        }
      })
      .catch(() => setState("invalid"));
  }, [code]);

  if (state === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ink">
        <Loader2 className="h-6 w-6 animate-spin text-txt-mut" />
      </div>
    );
  }

  if (state === "invalid") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-ink px-4 text-center">
        <Logo className="mb-2" />
        <h1 className="font-display text-xl font-semibold">
          Link inválido ou expirado
        </h1>
        <p className="text-sm text-txt-mut">
          Este link de convite não existe ou foi desativado.
        </p>
        <Link
          href="/register"
          className="mt-2 rounded-lg bg-txt px-5 py-2.5 text-sm font-semibold text-ink hover:opacity-90"
        >
          Criar conta grátis
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-ink px-4 py-12">
      <div className="w-full max-w-sm space-y-6 text-center">
        <Logo className="mx-auto" />

        <div className="rounded-card border border-line-strong bg-surface p-6">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-raised">
            <Gift className="h-6 w-6 text-txt-mut" aria-hidden />
          </div>
          <h1 className="font-display text-xl font-semibold">
            Você foi convidado!
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-txt-mut">
            Um amigo indicou você para o{" "}
            <span className="font-medium text-txt">PixelPage Chat</span>.
            Crie sua conta grátis e comece a automatizar seu atendimento.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center text-xs">
          <div className="rounded-lg border border-line bg-surface p-3">
            <CheckCircle2 className="mx-auto mb-1.5 h-4 w-4 text-txt-mut" />
            <p className="font-medium text-txt">7 dias grátis</p>
            <p className="text-txt-dim">sem cartão</p>
          </div>
          <div className="rounded-lg border border-line bg-surface p-3">
            <Zap className="mx-auto mb-1.5 h-4 w-4 text-txt-mut" />
            <p className="font-medium text-txt">Bot IA</p>
            <p className="text-txt-dim">incluso</p>
          </div>
          <div className="rounded-lg border border-line bg-surface p-3">
            <Users className="mx-auto mb-1.5 h-4 w-4 text-txt-mut" />
            <p className="font-medium text-txt">Equipe</p>
            <p className="text-txt-dim">colaborativa</p>
          </div>
        </div>

        <div className="space-y-3">
          <Link
            href="/register"
            className="flex w-full items-center justify-center rounded-lg bg-txt px-5 py-3 text-sm font-semibold text-ink transition-opacity hover:opacity-90"
          >
            Criar conta grátis
          </Link>
          <p className="text-[11px] text-txt-dim">
            Já tem conta?{" "}
            <Link href="/login" className="text-txt hover:underline">
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
