import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { orgHasMetaApi } from "@/lib/plan-features";
import { ApiOficialView } from "@/components/connections/api-oficial-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "API Oficial Meta" };

export default async function ApiOficialPage() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) redirect("/app/onboarding");
  const orgId = session.profile.org_id;

  const supabase = await createServerSupabase();

  const [{ data: org }, { data: existing }, hasPlan3] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", orgId).maybeSingle(),
    supabase
      .from("api_oficial_requests")
      .select("id, status")
      .eq("org_id", orgId)
      .in("status", ["pending", "contacted", "in_progress"])
      .limit(1)
      .maybeSingle(),
    orgHasMetaApi(orgId),
  ]);

  return (
    <ApiOficialView
      defaultName={session.profile.name}
      defaultEmail={session.user.email ?? ""}
      defaultCompany={org?.name ?? ""}
      alreadyRequested={!!existing}
      hasPlan3={hasPlan3}
    />
  );
}
