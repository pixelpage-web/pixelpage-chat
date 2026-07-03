import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAsaasConfigured, listCustomerPayments } from "@/lib/asaas";
import { BillingView } from "@/components/billing/billing-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Assinatura" };

export default async function BillingPage() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) redirect("/app/onboarding");
  const orgId = session.profile.org_id;

  const supabase = await createServerSupabase();

  const periodKey = (() => {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  })();

  const [
    { data: subscription },
    { data: plans },
    { data: usage },
    { count: connectionsCount },
    { count: teamCount },
  ] = await Promise.all([
    supabase.from("subscriptions").select("*").eq("org_id", orgId).maybeSingle(),
    supabase
      .from("plans")
      .select("*")
      .eq("active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("usage_counters")
      .select("ai_messages_used")
      .eq("org_id", orgId)
      .eq("period_start", periodKey)
      .maybeSingle(),
    supabase
      .from("whatsapp_connections")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId),
  ]);

  const currentPlan =
    plans?.find((p) => p.id === subscription?.plan_id) ?? null;

  const asaasOn = isAsaasConfigured();
  const invoices =
    asaasOn && subscription?.asaas_customer_id
      ? await listCustomerPayments(subscription.asaas_customer_id)
      : [];

  return (
    <BillingView
      subscription={subscription ?? null}
      currentPlan={currentPlan}
      plans={plans ?? []}
      aiUsed={usage?.ai_messages_used ?? 0}
      connectionsCount={connectionsCount ?? 0}
      teamCount={teamCount ?? 0}
      invoices={invoices.map((p) => ({
        id: p.id,
        status: p.status,
        value: p.value,
        due_date: p.dueDate,
        url: p.invoiceUrl ?? p.bankSlipUrl ?? null,
        description: p.description ?? null,
      }))}
      asaasConfigured={asaasOn}
      isOwner={session.profile.role === "owner" || session.profile.role === "admin"}
    />
  );
}
