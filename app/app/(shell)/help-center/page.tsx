import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { HelpCenterView } from "@/components/help-center/help-center-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Centro de Ajuda" };

export default async function HelpCenterPage() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) redirect("/app/onboarding");
  return (
    <div className="p-6">
      <HelpCenterView orgId={session.profile.org_id} />
    </div>
  );
}
