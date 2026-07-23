import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { canViewNavRoute } from "@/lib/permissions";
import { LabelsReport } from "@/components/reports/labels-report";

export const dynamic = "force-dynamic";
export const metadata = { title: "Relatório por Etiquetas" };

export default async function LabelsReportPage() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) redirect("/app/onboarding");
  if (!canViewNavRoute(session.profile.permissions, "/app/reports")) redirect("/app/inbox");
  return (
    <div className="p-6">
      <LabelsReport orgId={session.profile.org_id} />
    </div>
  );
}
