import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { isSubscriptionBlocked } from "@/lib/billing";
import { hasFeatureAccess } from "@/lib/access";
import { FeatureBadge } from "@/components/ui/feature-badge";
import { OnboardingBanner } from "@/components/onboarding-banner";
import { ClientTips } from "@/components/client-tips";
import { InboxView } from "@/components/inbox/inbox-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Inbox" };

export default async function InboxPage() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) redirect("/app/onboarding");

  const supabase = await createServerSupabase();
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("status, trial_ends_at")
    .eq("org_id", session.profile.org_id)
    .maybeSingle();

  // Assinatura expirada → somente leitura. Super Admin segue respondendo.
  const blocked = isSubscriptionBlocked(subscription ?? null);
  const access = hasFeatureAccess({
    userEmail: session.user.email,
    hasNormalAccess: !blocked,
    requiredPlan: "ativo",
  });
  const readOnly = !access.access;

  const seedEnabled =
    process.env.DEV_SEED_ENABLED === "true" &&
    process.env.NODE_ENV !== "production";

  const orgId = session.profile.org_id;

  // Checklist de primeiros passos: exibido SOMENTE para o Super Admin (dono da
  // plataforma) — os clientes não veem mais esse passo a passo no inbox.
  const isPlatformOwner = session.profile.role === "superadmin";

  let steps: {
    connected: boolean;
    configured: boolean;
    tested: boolean;
    teamInvited: boolean;
    published: boolean;
  } | null = null;

  if (isPlatformOwner) {
    const [
      { count: connectedCount },
      { data: agents },
      { count: flowCount },
      { count: publishedFlowCount },
      { count: testCount },
      { count: teamCount },
      { count: aiModeCount },
    ] = await Promise.all([
      supabase
        .from("whatsapp_connections")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("status", "connected"),
      supabase.from("agents").select("system_prompt").eq("org_id", orgId).limit(3),
      supabase.from("flows").select("id", { count: "exact", head: true }).eq("org_id", orgId),
      supabase
        .from("flows")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("status", "published"),
      supabase
        .from("ai_usage_logs")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("source", "simulate"),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("org_id", orgId),
      supabase
        .from("whatsapp_connections")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("mode", "ai_bot"),
    ]);

    steps = {
      connected: (connectedCount ?? 0) > 0,
      configured:
        (flowCount ?? 0) > 0 ||
        (agents ?? []).some((a) => a.system_prompt.trim().length > 0),
      tested: (testCount ?? 0) > 0,
      teamInvited: (teamCount ?? 0) > 1,
      published: (publishedFlowCount ?? 0) > 0 || (aiModeCount ?? 0) > 0,
    };
  }

  // Dicas do admin destinadas a esta organização (ou a todos)
  const { data: tips } = await supabase
    .from("client_tips")
    .select("*")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .limit(5);

  return (
    <div className="flex h-full flex-col">
      {steps && <OnboardingBanner steps={steps} />}
      <ClientTips tips={tips ?? []} />
      {access.isOverride && (
        <div className="border-b border-line bg-surface px-4 py-1.5">
          <FeatureBadge requiredPlan={access.requiredPlan} />
        </div>
      )}
      <div className="min-h-0 flex-1">
        <InboxView
          orgId={session.profile.org_id}
          userId={session.user.id}
          readOnly={readOnly}
          seedEnabled={seedEnabled}
        />
      </div>
    </div>
  );
}
