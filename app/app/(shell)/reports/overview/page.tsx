import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { OverviewReport } from "@/components/reports/overview-report";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visão Geral" };

export default async function OverviewPage() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) redirect("/app/onboarding");
  return (
    <div className="p-6">
      <OverviewReport orgId={session.profile.org_id} />
    </div>
  );
}
