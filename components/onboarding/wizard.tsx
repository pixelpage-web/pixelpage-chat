"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { slugify } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

/**
 * Etapa invisível de provisionamento pós-cadastro: só cria a organização
 * (obrigatória — quase toda página autenticada exige org_id) e manda direto
 * pro inbox. Não pede mais pra conectar o WhatsApp aqui — isso agora é
 * sugerido pelo modal de boas-vindas dentro do próprio inbox.
 *
 * "Nome do estabelecimento" já foi coletado em /register para quem se
 * cadastrou por email/senha — cria a organização direto com esse nome, sem
 * perguntar de novo. Login social (Google) nunca passa por aquele campo,
 * então o formulário abaixo só aparece pra esse caso.
 */
export function OnboardingWizard() {
  const router = useRouter();
  const t = useT();
  const [needsName, setNeedsName] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(false);

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

    router.replace("/app/inbox");
    router.refresh();
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

  if (!needsName) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-txt-mut" aria-hidden />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-4 py-10">
      <Logo className="mb-10 self-center" />

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
    </div>
  );
}
