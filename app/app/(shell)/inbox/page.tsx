import Link from "next/link";
import { redirect } from "next/navigation";
import { Bot } from "lucide-react";
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
    .select("status, trial_ends_at, current_period_end")
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

  // Aviso de modo manual: some sozinho assim que não houver mais nenhuma
  // conexão em modo manual (trocou pra Bot IA ou Webhook).
  const { count: manualModeCount } = await supabase
    .from("whatsapp_connections")
    .select("id", { count: "exact", head: true })
    .eq("org_id", session.profile.org_id)
    .eq("mode", "manual");
  const hasManualConnection = (manualModeCount ?? 0) > 0;

  return (
    <div className="flex h-full flex-col">
      {hasManualConnection && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line bg-surface px-4 py-2 text-xs text-txt-mut">
          <Bot className="h-3.5 w-3.5 shrink-0 text-txt-dim" aria-hidden />
          <span>
            Atendimento manual — sua equipe responde direto. Para respostas
            automáticas,{" "}
            <Link
              href="/app/agent"
              className="font-medium text-txt underline-offset-2 hover:underline"
            >
              ative e configure o Agente IA
            </Link>
            .
          </span>
        </div>
      )}
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
