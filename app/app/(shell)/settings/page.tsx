import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasFeatureAccess } from "@/lib/access";
import { SettingsView } from "@/components/settings/settings-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) redirect("/app/onboarding");
  const orgId = session.profile.org_id;

  const supabase = await createServerSupabase();

  const [{ data: org }, { data: members }, { data: subscriptionRows }] = await Promise.all([
    supabase.from("organizations").select("id, name, logo_url").eq("id", orgId).maybeSingle(),
    supabase
      .from("profiles")
      .select("id, name, role, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true }),
    // subscriptions restrita a owner/admin (0045) — plan_id via RPC segura.
    supabase.rpc("get_org_subscription_summary", { p_org_id: orgId }),
  ]);
  const subscription = subscriptionRows?.[0] ?? null;

  // Simplificação de UI pro plano básico: Unidades e White-label (Aparência)
  // só aparecem a partir do Pro. Super Admin sempre enxerga tudo.
  let planName = "Free";
  if (subscription?.plan_id) {
    const { data: plan } = await supabase
      .from("plans")
      .select("name")
      .eq("id", subscription.plan_id)
      .maybeSingle();
    planName = plan?.name ?? "Free";
  }
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
