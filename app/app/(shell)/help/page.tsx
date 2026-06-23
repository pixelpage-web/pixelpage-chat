import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { HelpView } from "@/components/help/help-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Central de Ajuda" };

export default async function HelpPage() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) redirect("/app/onboarding");

  return <HelpView />;
}
