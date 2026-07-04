"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  Lock,
  X,
  Zap,
} from "lucide-react";
import { cn, formatBRL } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import type { PlanRow } from "@/types/database";

// ─── tipos ────────────────────────────────────────────────────────────────────

type Tab = "pix" | "boleto" | "card";
type Phase = "form" | "loading" | "result" | "success" | "error";

interface CustomerForm {
  name: string;
  phone: string;
  cpf: string;
}

interface PixResult {
  qrCode: string;
  qrCodeBase64: string;
  expiresAt: string;
}

interface BoletoResult {
  barcode: string;
  pdfUrl?: string;
  dueDate?: string;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatCpf(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function normalizePhone(v: string): string {
  let d = v.replace(/\D/g, "");
  if (d.startsWith("0")) d = d.slice(1);
  if (!d.startsWith("55") && d.length <= 11) d = "55" + d;
  return d.slice(0, 13);
}

function formatTimer(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

// ─── componente ───────────────────────────────────────────────────────────────

export function CheckoutModal({
  plan,
  userEmail,
  userName,
  onClose,
}: {
  plan: PlanRow;
  userEmail: string;
  userName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const offerId = plan.cakto_checkout_url?.split("/").pop() ?? "";
  const trialDays = (plan.features as Record<string, unknown>)?.trial_days as number | undefined;

  const [tab, setTab] = useState<Tab>("pix");
  const [phase, setPhase] = useState<Phase>("form");
  const [form, setForm] = useState<CustomerForm>({ name: userName, phone: "", cpf: "" });
  const [error, setError] = useState<string | null>(null);
  const [pixResult, setPixResult] = useState<PixResult | null>(null);
  const [boletoResult, setBoletoResult] = useState<BoletoResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sdkRef = useRef<any>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Carrega o SDK da Cakto. O client_id vem de um endpoint autenticado —
  // nunca de uma variável NEXT_PUBLIC_ no bundle do browser.
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const res = await fetch("/api/payments/cakto/sdk-key");
        if (!res.ok || cancelled) return;
        const { clientId } = (await res.json()) as { clientId?: string };
        if (!clientId || cancelled) return;

        type CaktoWin = Window & typeof globalThis & {
          Cakto?: { CaktoSDK: new (o: { client_id: string }) => unknown };
        };
        const win = window as CaktoWin;

        function initSdk() {
          if (cancelled || !win.Cakto?.CaktoSDK) return;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const sdk = new (win.Cakto.CaktoSDK as any)({ client_id: clientId }) as any;
          sdkRef.current = sdk;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          void sdk.initAntifraud?.().catch(console.warn);
        }

        if (win.Cakto) { initSdk(); return; }

        const existing = document.querySelector('script[data-cakto-sdk]') as HTMLScriptElement | null;
        if (existing) {
          existing.addEventListener("load", initSdk, { once: true });
          return;
        }

        const script = document.createElement("script");
        script.src = "https://cakto-sdk.pages.dev/cakto-sdk.min.js";
        script.setAttribute("data-cakto-sdk", "1");
        script.async = true;
        script.addEventListener("load", initSdk, { once: true });
        document.head.appendChild(script);
      } catch {}
    }

    void bootstrap();
    return () => { cancelled = true; };
  }, []);

  // ESC fecha o modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  // Timer de expiração do PIX
  useEffect(() => {
    if (phase !== "result" || tab !== "pix" || !pixResult?.expiresAt) return;
    const tick = () => {
      const remaining = Math.floor(
        (new Date(pixResult.expiresAt).getTime() - Date.now()) / 1000
      );
      setTimeLeft(Math.max(0, remaining));
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, tab, pixResult]);

  // Para o polling quando o PIX expirou
  useEffect(() => {
    if (timeLeft === 0 && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [timeLeft]);

  // Polling a cada 5s aguardando o webhook ativar a assinatura
  useEffect(() => {
    if (phase !== "result" || tab !== "pix") return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/payments/cakto/status");
        if (!res.ok) return;
        const data = (await res.json()) as { status?: string };
        if (data.status === "active") {
          if (pollRef.current) clearInterval(pollRef.current);
          if (timerRef.current) clearInterval(timerRef.current);
          setPhase("success");
          setTimeout(() => { router.refresh(); onClose(); }, 2500);
        }
      } catch {}
    }, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [phase, tab, router, onClose]);

  function resetTab(t: Tab) {
    setTab(t);
    setPhase("form");
    setError(null);
    setPixResult(null);
    setBoletoResult(null);
    setTimeLeft(null);
    if (pollRef.current) clearInterval(pollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }, []);

  function validate(): string | null {
    if (!form.name.trim()) return "Nome é obrigatório";
    const phone = normalizePhone(form.phone);
    if (phone.length < 12 || phone.length > 13) return "Telefone inválido — inclua DDD (ex: 11 99999-9999)";
    const cpf = form.cpf.replace(/\D/g, "");
    if (cpf.length !== 11) return "CPF inválido — insira 11 dígitos";
    return null;
  }

  async function handleSubmit() {
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setPhase("loading");
    setError(null);

    // Antifraud via SDK; fallback a UUID se SDK não carregou
    let antifraudRef = crypto.randomUUID();
    const fingerprint = crypto.randomUUID();

    if (sdkRef.current) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        await sdkRef.current.completeAntifraudProfile?.();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        const ref = await sdkRef.current.getAntifraudReference?.() as
          | { reference?: string } | string | null;
        const refStr = typeof ref === "string" ? ref : ref?.reference;
        if (refStr) antifraudRef = refStr;
      } catch {}
    }

    try {
      const endpoint = tab === "pix"
        ? "/api/payments/cakto/pix"
        : "/api/payments/cakto/boleto";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offerId,
          customer: {
            name: form.name.trim(),
            email: userEmail,
            phone: normalizePhone(form.phone),
            docType: "cpf",
            docNumber: form.cpf.replace(/\D/g, ""),
          },
          fingerprint,
          antifraudRef,
        }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "Falha ao processar pagamento");
      }

      const data = (await res.json()) as Record<string, unknown>;

      if (tab === "pix") {
        setPixResult({
          qrCode: (data.qrCode as string) ?? "",
          qrCodeBase64: (data.qrCodeBase64 as string) ?? "",
          expiresAt: (data.expiresAt as string) ?? "",
        });
      } else {
        setBoletoResult({
          barcode: (data.barcode as string) ?? "",
          pdfUrl: data.pdfUrl as string | undefined,
          dueDate: data.dueDate as string | undefined,
        });
      }
      setPhase("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
      setPhase("error");
    }
  }

  // ─── render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/80 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Assinar ${plan.name}`}
    >
      <div className="animate-fade-up flex w-full max-w-[460px] flex-col rounded-t-card border border-line bg-surface shadow-pop sm:rounded-card">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <p className="font-display text-sm font-semibold">Assinar {plan.name}</p>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="font-display text-lg font-bold text-lime">
                {formatBRL(plan.price_cents)}
                <span className="text-[11px] font-normal text-txt-dim">/mês</span>
              </span>
              {!!trialDays && (
                <span className="rounded-full border border-amber/40 bg-amber/10 px-2 py-0.5 text-[10px] font-medium text-amber">
                  {trialDays} dias grátis
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="focus-ring -mr-1 -mt-0.5 rounded-md p-1.5 text-txt-dim transition-colors hover:bg-surface-hover hover:text-txt"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-line px-5">
          {(["pix", "boleto", "card"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => resetTab(t)}
              className={cn(
                "relative -mb-px px-3 py-2.5 text-xs font-medium transition-colors",
                tab === t
                  ? "border-b-2 border-lime text-lime"
                  : "text-txt-dim hover:text-txt"
              )}
            >
              {t === "pix" ? "PIX" : t === "boleto" ? "Boleto" : "Cartão"}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="max-h-[70vh] overflow-y-auto p-5">

          {/* ── Cartão placeholder ────────────────────────────────────────── */}
          {tab === "card" && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface-raised">
                <Lock className="h-5 w-5 text-txt-dim" aria-hidden />
              </div>
              <p className="font-medium text-txt">Cartão em breve</p>
              <p className="max-w-[260px] text-xs leading-relaxed text-txt-mut">
                O pagamento por cartão está sendo preparado. Use PIX ou Boleto agora — é rápido e sem redirecionamentos.
              </p>
              <button
                onClick={() => resetTab("pix")}
                className="mt-1 text-xs font-medium text-lime hover:underline"
              >
                Pagar com PIX →
              </button>
            </div>
          )}

          {/* ── Formulário (PIX ou Boleto) ─────────────────────────────────── */}
          {(tab === "pix" || tab === "boleto") && phase === "form" && (
            <div className="space-y-4">
              <p className="text-xs text-txt-mut">
                {tab === "pix"
                  ? "Preencha seus dados para gerar o QR Code PIX."
                  : "Preencha seus dados para gerar o boleto bancário."}
              </p>

              <div className="grid gap-3">
                <div>
                  <Label>Nome completo</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Seu nome completo"
                    autoComplete="name"
                  />
                </div>

                <div>
                  <Label>E-mail</Label>
                  <div className="relative">
                    <Input
                      value={userEmail}
                      readOnly
                      className="cursor-default pr-8 text-txt-dim opacity-70"
                    />
                    <Lock className="absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-txt-dim" aria-hidden />
                  </div>
                </div>

                <div>
                  <Label hint="com DDD, ex: 11 99999-9999">Celular</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        phone: e.target.value.replace(/[^\d ()+\-]/g, ""),
                      }))
                    }
                    placeholder="5511999999999"
                    inputMode="tel"
                    autoComplete="tel"
                  />
                </div>

                <div>
                  <Label>CPF</Label>
                  <Input
                    value={form.cpf}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, cpf: formatCpf(e.target.value) }))
                    }
                    placeholder="000.000.000-00"
                    inputMode="numeric"
                    autoComplete="off"
                  />
                </div>
              </div>

              {error && (
                <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
                  {error}
                </p>
              )}

              <Button
                onClick={() => void handleSubmit()}
                className="w-full"
                size="lg"
              >
                {tab === "pix" ? "Gerar QR Code PIX" : "Gerar Boleto"}
              </Button>
            </div>
          )}

          {/* ── Carregando ────────────────────────────────────────────────── */}
          {(tab === "pix" || tab === "boleto") && phase === "loading" && (
            <div className="flex flex-col items-center gap-3 py-12">
              <Loader2 className="h-8 w-8 animate-spin text-lime" />
              <p className="text-sm text-txt-mut">
                {tab === "pix" ? "Gerando QR Code..." : "Gerando boleto..."}
              </p>
            </div>
          )}

          {/* ── Resultado PIX ─────────────────────────────────────────────── */}
          {tab === "pix" && phase === "result" && pixResult && (
            <div className="space-y-4">
              {/* QR code num quadro branco para legibilidade */}
              <div className="flex justify-center">
                <div className="rounded-xl border-2 border-line bg-white p-3 shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pixResult.qrCodeBase64}
                    alt="QR Code PIX"
                    className="h-44 w-44"
                    draggable={false}
                  />
                </div>
              </div>

              {/* Timer */}
              {timeLeft !== null && (
                <p
                  className={cn(
                    "text-center font-mono text-sm font-semibold",
                    timeLeft === 0
                      ? "text-danger"
                      : timeLeft < 300
                        ? "text-amber"
                        : "text-txt-mut"
                  )}
                >
                  {timeLeft > 0 ? `Expira em ${formatTimer(timeLeft)}` : "PIX expirado"}
                </p>
              )}

              {/* Copia e cola */}
              <div>
                <p className="mb-1.5 text-[11px] font-medium text-txt-mut">Copia e Cola</p>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1 truncate rounded-lg border border-line bg-surface-raised px-3 py-2 font-mono text-[11px] text-txt-mut">
                    {pixResult.qrCode}
                  </div>
                  <button
                    onClick={() => void copy(pixResult.qrCode)}
                    className="focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-hover transition-colors hover:border-lime/40 hover:text-lime"
                    title="Copiar código PIX"
                  >
                    {copied
                      ? <Check className="h-3.5 w-3.5 text-lime" />
                      : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              {/* Status polling */}
              {timeLeft !== 0 ? (
                <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-raised px-3 py-2.5">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime opacity-70" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-lime" />
                  </span>
                  <p className="text-xs text-txt-mut">Aguardando confirmação do pagamento…</p>
                </div>
              ) : (
                <div className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5">
                  <p className="text-xs text-danger">Este QR Code expirou. Gere um novo para continuar.</p>
                </div>
              )}

              <button
                onClick={() => resetTab("pix")}
                className="text-xs text-txt-dim transition-colors hover:text-txt"
              >
                ← Gerar novo QR Code
              </button>
            </div>
          )}

          {/* ── Resultado Boleto ──────────────────────────────────────────── */}
          {tab === "boleto" && phase === "result" && boletoResult && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-txt">
                <CheckCircle2 className="h-4 w-4 text-lime" aria-hidden />
                Boleto gerado com sucesso
              </div>

              {boletoResult.dueDate && (
                <p className="text-xs text-txt-mut">
                  Vence em{" "}
                  <span className="font-medium text-txt">
                    {new Date(`${boletoResult.dueDate}T12:00:00`).toLocaleDateString("pt-BR")}
                  </span>
                </p>
              )}

              {/* Linha digitável */}
              {boletoResult.barcode && (
                <div>
                  <p className="mb-1.5 text-[11px] font-medium text-txt-mut">Linha Digitável</p>
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1 truncate rounded-lg border border-line bg-surface-raised px-3 py-2 font-mono text-[11px] text-txt-mut">
                      {boletoResult.barcode}
                    </div>
                    <button
                      onClick={() => void copy(boletoResult.barcode)}
                      className="focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-hover transition-colors hover:border-lime/40 hover:text-lime"
                      title="Copiar linha digitável"
                    >
                      {copied
                        ? <Check className="h-3.5 w-3.5 text-lime" />
                        : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              )}

              {/* PDF */}
              {boletoResult.pdfUrl && (
                <a
                  href={boletoResult.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-line bg-surface-hover px-3 py-2.5 text-xs font-medium text-txt transition-colors hover:border-lime/40 hover:text-lime"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  Abrir PDF do boleto
                </a>
              )}

              {/* Aviso compensação */}
              <div className="rounded-lg border border-amber/30 bg-amber/5 px-3 py-2.5">
                <p className="text-[11px] leading-relaxed text-amber">
                  ⚠ Boletos podem levar até 3 dias úteis para compensar. Seu plano será ativado automaticamente após a confirmação.
                </p>
              </div>

              <button
                onClick={() => resetTab("boleto")}
                className="text-xs text-txt-dim transition-colors hover:text-txt"
              >
                ← Tentar outra forma de pagamento
              </button>
            </div>
          )}

          {/* ── Erro ──────────────────────────────────────────────────────── */}
          {phase === "error" && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3">
                <p className="text-sm text-danger">{error}</p>
              </div>
              <Button
                variant="outline"
                onClick={() => { setPhase("form"); setError(null); }}
                className="w-full"
              >
                Tentar novamente
              </Button>
            </div>
          )}

          {/* ── Sucesso ───────────────────────────────────────────────────── */}
          {phase === "success" && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-lime">
                <Check className="h-7 w-7 text-black" aria-hidden />
              </div>
              <p className="font-display text-base font-semibold text-txt">
                Pagamento confirmado!
              </p>
              <p className="text-xs text-txt-mut">
                Seu {plan.name} já está ativo. Redirecionando…
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {(tab === "pix" || tab === "boleto") && phase === "form" && (
          <div className="border-t border-line px-5 py-3">
            <p className="flex items-center gap-1.5 text-[11px] text-txt-dim">
              <Zap className="h-3 w-3 text-lime" aria-hidden />
              Cobrança processada com segurança via Cakto
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
