import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { canViewNavRoute } from "@/lib/permissions";
import { AutomationsView } from "@/components/automations/automations-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Automações" };

export default async function AutomationsPage() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) redirect("/app/onboarding");
  if (!canViewNavRoute(session.profile.permissions, "/app/automations")) redirect("/app/inbox");
  const orgId = session.profile.org_id;

  const supabase = await createServerSupabase();

  const [{ data: rules }, { data: connections }, { data: team }, { data: flows }, { data: contacts }] =
    await Promise.all([
      supabase
        .from("automation_rules")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false }),
      supabase
        .from("whatsapp_connections")
        .select("id, label, phone_display")
        .eq("org_id", orgId),
      supabase.from("profiles").select("id, name").eq("org_id", orgId),
      supabase
        .from("flows")
        .select("id, name")
        .eq("org_id", orgId)
        .eq("status", "published"),
      supabase.from("contacts").select("tags").eq("org_id", orgId).limit(1000),
    ]);

  // Etiquetas já usadas nos contatos (sugestões da ação "Adicionar etiqueta")
  const existingTags = [
    ...new Set((contacts ?? []).flatMap((c) => c.tags ?? [])),
  ].sort();

  return (
    <AutomationsView
      orgId={orgId}
      initialRules={rules ?? []}
      connections={(connections ?? []).map((c) => ({
        id: c.id,
        name: c.phone_display ? `${c.label} (${c.phone_display})` : c.label,
      }))}
      team={(team ?? []).map((m) => ({ id: m.id, name: m.name || "Sem nome" }))}
      flows={flows ?? []}
      existingTags={existingTags}
    />
  );
}
