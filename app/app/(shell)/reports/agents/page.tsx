import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { AgentsReport } from "@/components/reports/agents-report";

export const dynamic = "force-dynamic";
export const metadata = { title: "Relatório por Agentes" };

export default async function AgentsReportPage() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) redirect("/app/onboarding");
  return (
    <div className="p-6">
      <AgentsReport orgId={session.profile.org_id} />
    </div>
  );
}
