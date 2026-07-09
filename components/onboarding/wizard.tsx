"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock,
  Inbox,
  QrCode,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { cn, slugify } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmbeddedSignupButton } from "@/components/whatsapp/embedded-signup-button";
import { QrConnectModal } from "@/components/whatsapp/qr-connect-modal";
import type { ConnectionMode } from "@/types/database";

const segments = [
  "Loja / E-commerce",
  "Clínica / Saúde",
  "Restaurante / Delivery",
  "Imobiliária",
  "Serviços",
  "Educação",
  "Beleza / Estética",
  "Outro",
];

const signupEnabled =
  process.env.NEXT_PUBLIC_EMBEDDED_SIGNUP_ENABLED === "true";

const steps = ["Sua empresa", "WhatsApp", "Modo de resposta"];

const modeCards: {
  mode: ConnectionMode;
  title: string;
  description: string;
  icon: typeof Inbox;
}[] = [
  {
    mode: "manual",
    title: "Manual",
    description:
      "Sua equipe responde tudo pelo inbox. Ideal para começar e sentir a plataforma.",
    icon: Inbox,
  },
  {
    mode: "ai_bot",
    title: "Bot IA",
    description:
      "Nosso bot responde sozinho com a personalidade, tom e FAQ que você configurar.",
    icon: Bot,
  },
  {
    mode: "external_webhook",
    title: "Webhook (n8n)",
    description:
      "Cada mensagem é encaminhada para o SEU n8n, e seu fluxo responde pela API da PixelPage Chat.",
    icon: Workflow,
  },
];

export function OnboardingWizard({ qrEnabled }: { qrEnabled: boolean }) {
  const router = useRouter();
  const t = useT();
  const [step, setStep] = useState(0);
  const [companyName, setCompanyName] = useState("");
  const [segment, setSegment] = useState(segments[0]);
  const [companyPhone, setCompanyPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<ConnectionMode>("manual");
  const [qrOpen, setQrOpen] = useState(false);
  const [referralCodeFromMeta, setReferralCodeFromMeta] = useState<string | undefined>(undefined);

  // Pré-preenche "Nome da empresa" com o "Nome do estabelecimento" já coletado
  // na página de cadastro (raw_user_meta_data.establishment_name), evitando
  // pedir a mesma informação de novo — segmento e telefone da empresa ainda
  // são perguntados aqui, pois hoje não existe outra tela para editá-los depois.
  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        const metadata = data.user?.user_metadata ?? {};
        if (
          typeof metadata.establishment_name === "string" &&
          metadata.establishment_name.trim()
        ) {
          setCompanyName(metadata.establishment_name.trim());
        }
        if (typeof metadata.referral_code === "string" && metadata.referral_code.trim()) {
          setReferralCodeFromMeta(metadata.referral_code.trim());
        }
      } catch {
        // segue sem pré-preencher — usuário digita normalmente
      }
    })();
  }, []);

  /** Após conectar (QR ou Meta), captura a conexão recém-criada p/ o passo 3 */
  async function captureLatestConnection() {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("whatsapp_connections")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) setConnectionId(data.id);
    } catch {
      // segue sem id — o modo poderá ser definido depois em Conexões
    }
    setStep(2);
  }

  // Passo 1 — cria organização + perfil de dono + trial de 7 dias
  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    if (!companyName.trim()) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: orgId, error } = await supabase.rpc("create_organization", {
        p_name: companyName.trim(),
        p_slug: slugify(companyName),
      });
      if (error) {
        toast.error(
          error.message.includes("já pertence")
            ? t("Você já faz parte de uma organização.")
            : t("Não foi possível criar a empresa. Tente novamente.")
        );
        return;
      }
      // Complementa com segmento e telefone (passo 1 do v2)
      if (orgId) {
        await supabase
          .from("organizations")
          .update({ segment, phone: companyPhone.trim() || null })
          .eq("id", orgId);
      }
      toast.success(t("Empresa criada! Seu teste de 7 dias começou."));

      // Registra indicação: código digitado no cadastro tem prioridade,
      // com fallback para o cookie de link de referral (a rota decide)
      fetch("/api/referral/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referral_code: referralCodeFromMeta }),
      }).catch(() => {});

      setStep(1);
    } catch {
      toast.error(t("Erro de conexão. Verifique sua internet e tente novamente."));
    } finally {
      setLoading(false);
    }
  }

  // Passo 3 — aplica o modo escolhido à conexão (quando houver)
  async function handleFinish() {
    setLoading(true);
    try {
      if (connectionId) {
        const supabase = createClient();
        const { error } = await supabase
          .from("whatsapp_connections")
          .update({ mode: selectedMode })
          .eq("id", connectionId);
        if (error) {
          toast.error(t("Não foi possível salvar o modo. Ajuste depois em Conexões."));
        }
      }
      router.replace("/app/inbox");
      router.refresh();
    } catch {
      toast.error(t("Erro de conexão ao finalizar. Tente novamente."));
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 py-10">
      <Logo className="mb-10 self-center" />

      {/* Indicador de passos */}
      <ol className="mb-8 flex items-center justify-center gap-2">
        {steps.map((label, i) => (
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
            {i < steps.length - 1 && <span className="h-px w-6 bg-line" />}
          </li>
        ))}
      </ol>

      {/* Passo 1 — dados da empresa */}
      {step === 0 && (
        <div className="animate-fade-up rounded-card border border-line bg-surface p-6">
          <h1 className="font-display text-xl font-semibold">
            {t("Vamos criar sua empresa")}
          </h1>
          <p className="mt-1 text-sm text-txt-mut">
            {t("É o espaço onde ficam suas conversas, seu bot e sua equipe.")}
          </p>
          <form onSubmit={handleCreateOrg} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="company">{t("Nome da empresa")}</Label>
              <Input
                id="company"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Pizzaria do Zé"
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="segment">{t("Segmento")}</Label>
              <Select
                id="segment"
                value={segment}
                onChange={(e) => setSegment(e.target.value)}
              >
                {segments.map((s) => (
                  <option key={s} value={s}>
                    {t(s)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="company-phone" hint={t("opcional")}>
                {t("Telefone da empresa")}
              </Label>
              <Input
                id="company-phone"
                value={companyPhone}
                onChange={(e) => setCompanyPhone(e.target.value)}
                placeholder="(11) 99999-8888"
                inputMode="tel"
              />
            </div>
            <Button type="submit" className="w-full" loading={loading}>
              {t("Continuar")}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </form>
        </div>
      )}

      {/* Passo 2 — conectar WhatsApp (Embedded Signup atrás de feature flag) */}
      {step === 1 && (
        <div className="animate-fade-up rounded-card border border-line bg-surface p-6">
          <h1 className="font-display text-xl font-semibold">
            {t("Conecte seu WhatsApp")}
          </h1>
          <p className="mt-1 text-sm text-txt-mut">
            {t("Escolha como conectar — dá para mudar depois.")}
          </p>

          {/* Dois modos lado a lado */}
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div
              className={cn(
                "rounded-lg border border-line bg-surface-raised p-4",
                !qrEnabled && "opacity-70"
              )}
            >
              <QrCode className="h-6 w-6 text-lime" aria-hidden />
              <p className="mt-2 text-sm font-semibold">QR Code</p>
              <p className="mt-0.5 text-xs leading-relaxed text-txt-mut">
                {t("Conecta em segundos · qualquer número")}
              </p>
              <Button
                size="sm"
                className="mt-3 w-full"
                disabled={!qrEnabled}
                onClick={() => setQrOpen(true)}
              >
                {t("Conectar agora")}
              </Button>
              {!qrEnabled && (
                <p className="mt-2 text-center text-[10px] text-txt-dim">
                  {t("Indisponível no momento")}
                </p>
              )}
            </div>

            <div
              className={cn(
                "rounded-lg border border-line bg-surface-raised p-4",
                !signupEnabled && "opacity-70"
              )}
            >
              <ShieldCheck className="h-6 w-6 text-ok" aria-hidden />
              <p className="mt-2 text-sm font-semibold">
                {t("API Oficial Meta")}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-txt-mut">
                {t("Número verificado · templates e campanhas")}
              </p>
              {signupEnabled ? (
                <div className="mt-3">
                  <EmbeddedSignupButton
                    onConnected={() => void captureLatestConnection()}
                  />
                </div>
              ) : (
                <>
                  <Button size="sm" variant="secondary" className="mt-3 w-full" disabled>
                    <Clock className="h-3.5 w-3.5" aria-hidden />
                    {t("Em breve")}
                  </Button>
                  <p className="mt-2 text-center text-[10px] text-txt-dim">
                    {t("Em análise na Meta")}
                  </p>
                </>
              )}
            </div>
          </div>

          <button
            onClick={() => setStep(2)}
            className="focus-ring mt-4 text-xs text-txt-dim underline hover:text-txt-mut"
          >
            {t("Conectar depois — pular esta etapa")}
          </button>

          <QrConnectModal
            open={qrOpen}
            onClose={() => setQrOpen(false)}
            onConnected={() => {
              setQrOpen(false);
              void captureLatestConnection();
            }}
          />
        </div>
      )}

      {/* Passo 3 — modo de resposta */}
      {step === 2 && (
        <div className="animate-fade-up rounded-card border border-line bg-surface p-6">
          <h1 className="font-display text-xl font-semibold">
            {t("Como as mensagens serão respondidas?")}
          </h1>
          <p className="mt-1 text-sm text-txt-mut">
            {connectionId
              ? t("Escolha o modo da sua conexão. Dá para trocar a qualquer momento.")
              : t("Conheça os modos disponíveis — você define ao conectar seu WhatsApp.")}
          </p>
          <div className="mt-6 space-y-3">
            {modeCards.map((card) => (
              <button
                key={card.mode}
                onClick={() => setSelectedMode(card.mode)}
                className={cn(
                  "focus-ring w-full rounded-lg border p-4 text-left transition-colors",
                  selectedMode === card.mode
                    ? "border-lime/60 bg-lime-soft"
                    : "border-line bg-surface-raised hover:border-line-strong"
                )}
              >
                <div className="flex items-start gap-3">
                  <card.icon
                    className={cn(
                      "mt-0.5 h-5 w-5 shrink-0",
                      selectedMode === card.mode ? "text-lime" : "text-txt-dim"
                    )}
                    aria-hidden
                  />
                  <div>
                    <p className="text-sm font-semibold">{t(card.title)}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-txt-mut">
                      {t(card.description)}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
          <Button onClick={handleFinish} className="mt-6 w-full" loading={loading}>
            {t("Começar a usar a PixelPage Chat")}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      )}
    </div>
  );
}
