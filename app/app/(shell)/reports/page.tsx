import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { canViewNavRoute } from "@/lib/permissions";
import { ReportsView } from "@/components/reports/reports-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Relatórios" };

export default async function ReportsPage() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) redirect("/app/onboarding");
  if (!canViewNavRoute(session.profile.permissions, "/app/reports")) redirect("/app/inbox");

  return <ReportsView orgId={session.profile.org_id} />;
}
