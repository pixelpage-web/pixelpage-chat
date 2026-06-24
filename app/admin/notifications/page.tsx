import { createAdminClient } from "@/lib/supabase/admin";
import { NotificationsManager } from "@/components/admin/notifications-manager";

export const dynamic = "force-dynamic";

export const metadata = { title: "Notificações · Admin" };

export default async function AdminNotificationsPage() {
  const admin = createAdminClient();

  const [{ data: notifications }, { data: orgs }] = await Promise.all([
    admin
      .from("system_notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100),
    admin.from("organizations").select("id, name").order("name"),
  ]);

  return (
    <NotificationsManager initial={notifications ?? []} orgs={orgs ?? []} />
  );
}
