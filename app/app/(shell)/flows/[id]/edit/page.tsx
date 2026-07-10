import { notFound, redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { FlowEditor } from "@/components/flows/flow-editor";

export const dynamic = "force-dynamic";

export const metadata = { title: "Editor de fluxo" };

export default async function FlowEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) redirect("/app/onboarding");
  const orgId = session.profile.org_id;

  const { id } = await params;
  const supabase = await createServerSupabase();

  // RLS garante que o fluxo pertence à organização do usuário
  const [{ data: flow }, { data: team }, { data: units }] = await Promise.all([
    supabase.from("flows").select("*").eq("id", id).maybeSingle(),
    supabase.from("profiles").select("id, name").eq("org_id", orgId),
    supabase
      .from("org_units")
      .select("id, name")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .order("name"),
  ]);

  if (!flow) notFound();

  return (
    <FlowEditor
      flow={flow}
      team={(team ?? []).map((m) => ({ id: m.id, name: m.name || "Sem nome" }))}
      units={units ?? []}
    />
  );
}
