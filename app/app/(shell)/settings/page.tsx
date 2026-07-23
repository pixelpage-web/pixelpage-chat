import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasFeatureAccess } from "@/lib/access";
import { canViewNavRoute } from "@/lib/permissions";
import { getPlanFeatures } from "@/lib/plan-features";
import { SettingsView } from "@/components/settings/settings-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) redirect("/app/onboarding");
  if (!canViewNavRoute(session.profile.permissions, "/app/settings")) redirect("/app/inbox");
  const orgId = session.profile.org_id;

  const supabase = await createServerSupabase();

  // planFeatures reaproveita a mesma assinatura que layout.tsx já buscou
  // (getOrgSubscriptionSummary tem cache() do React) — antes esta página
  // buscava a assinatura de novo via RPC e mais uma query de plans só pra
  // pegar o nome.
  const [{ data: org }, { data: members }, planFeatures] = await Promise.all([
    supabase.from("organizations").select("id, name, logo_url").eq("id", orgId).maybeSingle(),
    supabase
      .from("profiles")
      .select("id, name, role, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true }),
    getPlanFeatures(orgId),
  ]);

  // Simplificação de UI pro plano básico: Unidades e White-label (Aparência)
  // só aparecem a partir do Pro. Super Admin sempre enxerga tudo.
  const planName = planFeatures?.name ?? "Free";
  const isBasicPlan = planName === "Free" || planName === "Starter";
  const proAccess = hasFeatureAccess({
    userEmail: session.user.email,
    hasNormalAccess: !isBasicPlan,
    requiredPlan: "Pro",
  });

  return (
    <SettingsView
      userId={session.user.id}
      userEmail={session.user.email ?? ""}
      profileName={session.profile.name}
      role={session.profile.role}
      orgId={org?.id ?? orgId}
      orgName={org?.name ?? ""}
      orgLogoUrl={org?.logo_url ?? null}
      showProFeatures={proAccess.access}
      members={members ?? []}
      notificationPrefs={
        (session.profile.notification_prefs ?? {}) as Record<string, boolean>
      }
    />
  );
}
