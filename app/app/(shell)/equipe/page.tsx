import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { isOwnerRole, type PermissionDefaults } from "@/lib/permissions";
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
    .select("id, name, role, created_at, permissions")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });

  const role = session.profile.role;
  const isOwner = isOwnerRole(role);

  // Agent não vê a lista completa de colegas nem métricas alheias — só a
  // própria linha ("meu desempenho"). Ver 0045_restrict_agent_sensitive_rls.sql:
  // csat_responses continua com RLS org-scoped (agent lê a própria nota faz
  // sentido pro produto), mas a query agregada de TODOS os colegas usada
  // aqui é restrita no nível de aplicação, não só escondida na UI.
  const visibleMembers = (
    isOwner ? members ?? [] : (members ?? []).filter((m) => m.id === session.user.id)
  ).map((m) => ({ ...m, permissions: m.permissions as PermissionDefaults | null }));

  return (
    <EquipeView
      userId={session.user.id}
      orgId={orgId}
      isOwner={isOwner}
      initialMembers={visibleMembers}
    />
  );
}
