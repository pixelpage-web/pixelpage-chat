import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { SettingsView } from "@/components/settings/settings-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) redirect("/app/onboarding");
  const orgId = session.profile.org_id;

  const supabase = await createServerSupabase();

  const [{ data: org }, { data: members }] = await Promise.all([
    supabase.from("organizations").select("id, name, logo_url").eq("id", orgId).maybeSingle(),
    supabase
      .from("profiles")
      .select("id, name, role, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true }),
  ]);

  return (
    <SettingsView
      userId={session.user.id}
      userEmail={session.user.email ?? ""}
      profileName={session.profile.name}
      role={session.profile.role}
      orgId={org?.id ?? orgId}
      orgName={org?.name ?? ""}
      orgLogoUrl={org?.logo_url ?? null}
      members={members ?? []}
      notificationPrefs={
        (session.profile.notification_prefs ?? {}) as Record<string, boolean>
      }
    />
  );
}
