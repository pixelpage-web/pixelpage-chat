"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, QrCode, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { cn, slugify } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { EmbeddedSignupButton } from "@/components/whatsapp/embedded-signup-button";
import { QrConnectModal } from "@/components/whatsapp/qr-connect-modal";

export function OnboardingWizard({ qrEnabled }: { qrEnabled: boolean }) {
  const router = useRouter();
  const t = useT();
  // "Nome do estabelecimento" já foi coletado em /register para quem se
  // cadastrou por email/senha — cria a organização direto com esse nome, sem
  // perguntar de novo. Login social (Google) nunca passa por aquele campo,
  // então é o único caso que ainda precisa de um formulário aqui.
  const [ready, setReady] = useState(false);
  const [needsName, setNeedsName] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        const metadata = data.user?.user_metadata ?? {};
        const establishmentName =
          typeof metadata.establishment_name === "string"
            ? metadata.establishment_name.trim()
            : "";
        const referralCode =
          typeof metadata.referral_code === "string" ? metadata.referral_code.trim() : undefined;

        if (establishmentName) {
          await createOrg(establishmentName, referralCode);
        } else {
          setNeedsName(true);
        }
      } catch {
        setNeedsName(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createOrg(name: string, referralCode?: string) {
    const supabase = createClient();
    const { error } = await supabase.rpc("create_organization", {
      p_name: name,
      p_slug: slugify(name),
    });
    if (error) {
      // Corrida rara (ex.: efeito disparado 2x) — a org já existe, segue normal.
      if (!error.message.includes("já pertence")) {
        toast.error(t("Não foi possível criar a empresa. Tente novamente."));
        setNeedsName(true);
        return;
      }
    }

    fetch("/api/referral/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referral_code: referralCode }),
    }).catch(() => {});

    setReady(true);
  }

  async function handleCreateOrgFromForm(e: React.FormEvent) {
    e.preventDefault();
    if (!companyName.trim()) return;
    setLoading(true);
    try {
      await createOrg(companyName.trim());
    } finally {
      setLoading(false);
    }
  }

  function goToConnections() {
    router.replace("/app/connections");
    router.refresh();
  }

  if (!ready && !needsName) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-lime" aria-hidden />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 py-10">
      <Logo className="mb-10 self-center" />

      {needsName ? (
        <div className="animate-fade-up rounded-card border border-line bg-surface p-6">
          <h1 className="font-display text-xl font-semibold">
            {t("Vamos criar sua empresa")}
          </h1>
          <p className="mt-1 text-sm text-txt-mut">
            {t("É o espaço onde ficam suas conversas, seu bot e sua equipe.")}
          </p>
          <form onSubmit={handleCreateOrgFromForm} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="company">{t("Nome da empresa")}</Label>
              <Input
                id="company"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Mercado Bom Preço"
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full" loading={loading}>
              {t("Continuar")}
            </Button>
          </form>
        </div>
      ) : (
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

            <div className="rounded-lg border border-line bg-surface-raised p-4">
              <ShieldCheck className="h-6 w-6 text-ok" aria-hidden />
              <p className="mt-2 text-sm font-semibold">
                {t("API Oficial Meta")}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-txt-mut">
                {t("Número verificado · templates e campanhas")}
              </p>
              <div className="mt-3">
                <EmbeddedSignupButton
                  onConnected={() => {
                    toast.success(t("WhatsApp conectado!"));
                    goToConnections();
                  }}
                />
              </div>
            </div>
          </div>

          <p className="mt-4 text-center text-[11px] text-txt-dim">
            {t("Depois de conectar, escolha ali mesmo se o atendimento é manual, com bot IA ou via webhook.")}
          </p>

          <button
            onClick={goToConnections}
            className="focus-ring mt-4 block w-full text-center text-xs text-txt-dim underline hover:text-txt-mut"
          >
            {t("Conectar depois — pular esta etapa")}
          </button>

          <QrConnectModal
            open={qrOpen}
            onClose={() => setQrOpen(false)}
            onConnected={() => {
              setQrOpen(false);
              toast.success(t("WhatsApp conectado!"));
              goToConnections();
            }}
          />
        </div>
      )}
    </div>
  );
}
