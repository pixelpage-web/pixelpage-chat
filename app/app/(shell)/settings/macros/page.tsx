import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { MacrosView } from "@/components/settings/macros-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Macros" };

export default async function MacrosPage() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) redirect("/app/onboarding");
  return <MacrosView orgId={session.profile.org_id} />;
}
