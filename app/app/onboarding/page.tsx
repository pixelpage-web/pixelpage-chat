import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { getEvolutionConfig, isEvolutionConfigured } from "@/lib/evolution";
import { OnboardingWizard } from "@/components/onboarding/wizard";

export const dynamic = "force-dynamic";

export const metadata = { title: "Bem-vindo" };

export default async function OnboardingPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/login");

  // Quem já tem organização vai direto para o inbox
  if (session.profile?.org_id) redirect("/app/inbox");

  const evolutionCfg = await getEvolutionConfig();

  return <OnboardingWizard qrEnabled={isEvolutionConfigured(evolutionCfg)} />;
}
