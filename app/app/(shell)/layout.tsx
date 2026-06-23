import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { AppShell, type ShellData } from "@/components/app-shell";

// Sessão e assinatura mudam a cada request — sem cache estático
export const dynamic = "force-dynamic";

export default async function ShellLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSessionProfile();
  if (!session) redirect("/login");

  // Sem organização → onboarding (cria org + trial)
  if (!session.profile?.org_id) redirect("/app/onboarding");

  const supabase = await createServerSupabase();

  const [{ data: org }, { data: subscription }] = await Promise.all([
    supabase
      .from("organizations")
      .select("name, suspended")
      .eq("id", session.profile.org_id)
      .maybeSingle(),
    supabase
      .from("subscriptions")
      .select("status, trial_ends_at, plan_id")
      .eq("org_id", session.profile.org_id)
      .maybeSingle(),
  ]);

  let planName = "—";
  if (subscription?.plan_id) {
    const { data: plan } = await supabase
      .from("plans")
      .select("name")
      .eq("id", subscription.plan_id)
      .maybeSingle();
    planName = plan?.name ?? "—";
  }

  const data: ShellData = {
    userName: session.profile.name,
    userEmail: session.user.email ?? "",
    role: session.profile.role,
    orgName: org?.name ?? "",
    orgSuspended: org?.suspended ?? false,
    impersonating: session.impersonating,
    subscription: subscription
      ? {
          status: subscription.status,
          trialEndsAt: subscription.trial_ends_at,
          planName,
        }
      : null,
  };

  return <AppShell data={data}>{children}</AppShell>;
}
