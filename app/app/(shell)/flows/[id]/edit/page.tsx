import { notFound, redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasFeatureAccess } from "@/lib/access";
import { canViewNavRoute } from "@/lib/permissions";
import { getPlanFeatures } from "@/lib/plan-features";
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
  // Mesmo permissionamento da listagem (/app/flows) — sem isso, um agent sem
  // can_view_flows abriria o editor direto pela URL.
  if (!canViewNavRoute(session.profile.permissions, "/app/flows")) redirect("/app/inbox");
  const orgId = session.profile.org_id;

  const { id } = await params;
  const supabase = await createServerSupabase();

  // Fluxos é recurso Pro — bloqueia o editor também (não só a listagem),
  // cobre o caso de a org ter fluxos antigos de quando era Pro e ter caído
  // pra Free/Starter depois. Super Admin sempre libera. planFeatures
  // reaproveita a mesma assinatura que layout.tsx já buscou
  // (getOrgSubscriptionSummary tem cache() do React) — antes buscava de
  // novo via RPC + query de plans.
  const planFeatures = await getPlanFeatures(orgId);
  const planName = planFeatures?.name ?? "Free";
  const isBasicPlan = planName === "Free" || planName === "Starter";
  const flowsAccess = hasFeatureAccess({
    userEmail: session.user.email,
    hasNormalAccess: !isBasicPlan,
    requiredPlan: "Pro",
  });
  if (!flowsAccess.access) redirect("/app/inbox");

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
