import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { CannedResponsesView } from "@/components/settings/canned-responses-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Respostas Prontas" };

export default async function CannedResponsesPage() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) redirect("/app/onboarding");
  return <CannedResponsesView orgId={session.profile.org_id} />;
}
