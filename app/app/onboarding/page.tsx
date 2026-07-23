import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { OnboardingWizard } from "@/components/onboarding/wizard";

export const dynamic = "force-dynamic";

export const metadata = { title: "Bem-vindo" };

export default async function OnboardingPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/login");

  // Quem já tem organização vai direto para o inbox
  if (session.profile?.org_id) redirect("/app/inbox");

  // getSessionProfile() já chamou auth.getUser() nesta mesma request — o
  // client repetia essa chamada (mais um round-trip) só pra ler esses 2
  // campos de user_metadata, que a gente já tem aqui.
  const metadata = session.user.user_metadata ?? {};
  const establishmentName =
    typeof metadata.establishment_name === "string" ? metadata.establishment_name.trim() : "";
  const referralCode =
    typeof metadata.referral_code === "string" ? metadata.referral_code.trim() : undefined;

  return (
    <OnboardingWizard establishmentName={establishmentName} referralCode={referralCode} />
  );
}
