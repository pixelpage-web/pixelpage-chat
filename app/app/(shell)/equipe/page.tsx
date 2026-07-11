import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { EquipeView } from "@/components/equipe/equipe-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Equipe" };

export default async function EquipePage() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) redirect("/app/onboarding");
  const orgId = session.profile.org_id;

  const supabase = await createServerSupabase();
  const { data: members } = await supabase
    .from("profiles")
    .select("id, name, role, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });

  const role = session.profile.role;
  const isOwner = role === "owner" || role === "admin";

  return (
    <EquipeView
      userId={session.user.id}
      isOwner={isOwner}
      initialMembers={members ?? []}
    />
  );
}
