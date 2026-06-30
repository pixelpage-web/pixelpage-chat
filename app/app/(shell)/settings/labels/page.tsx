import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { LabelsView } from "@/components/settings/labels-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Etiquetas" };

export default async function LabelsPage() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) redirect("/app/onboarding");
  return <LabelsView orgId={session.profile.org_id} />;
}
