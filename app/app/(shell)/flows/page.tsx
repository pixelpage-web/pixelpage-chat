import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { FlowsView } from "@/components/flows/flows-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Fluxos" };

export default async function FlowsPage() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) redirect("/app/onboarding");
  const orgId = session.profile.org_id;

  const supabase = await createServerSupabase();

  const [{ data: flows }, { data: connections }] = await Promise.all([
    supabase
      .from("flows")
      .select("*")
      .eq("org_id", orgId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("whatsapp_connections")
      .select("id, label, phone_display")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true }),
  ]);

  return <FlowsView initialFlows={flows ?? []} connections={connections ?? []} />;
}
