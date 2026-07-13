import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { isSubscriptionBlocked } from "@/lib/billing";
import { hasFeatureAccess } from "@/lib/access";
import { FeatureBadge } from "@/components/ui/feature-badge";
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

  // Dicas do admin destinadas a esta organização (ou a todos)
  const { data: tips } = await supabase
    .from("client_tips")
    .select("*")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .limit(5);

  return (
    <div className="flex h-full flex-col">
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
          role={session.profile.role}
        />
      </div>
    </div>
  );
}
