import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { orgHasMetaApi } from "@/lib/plan-features";
import { canViewNavRoute } from "@/lib/permissions";
import { ApiOficialView } from "@/components/connections/api-oficial-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "API Oficial Meta" };

export default async function ApiOficialPage() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) redirect("/app/onboarding");
  // Mesmo permissionamento da listagem (/app/connections) — sem isso, um
  // agent sem can_view_connections conectaria um número direto pela URL.
  if (!canViewNavRoute(session.profile.permissions, "/app/connections")) redirect("/app/inbox");
  const orgId = session.profile.org_id;

  const supabase = await createServerSupabase();

  const [{ data: existingConnection }, hasPlan3] = await Promise.all([
    supabase
      .from("whatsapp_connections")
      .select("*")
      .eq("org_id", orgId)
      .eq("connection_type", "meta_api")
      .in("status", ["connected", "error", "pending"])
      .limit(1)
      .maybeSingle(),
    orgHasMetaApi(orgId),
  ]);

  return (
    <ApiOficialView
      hasPlan3={hasPlan3}
      existingConnection={existingConnection}
    />
  );
}
