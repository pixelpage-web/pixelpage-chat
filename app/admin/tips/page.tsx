import { createAdminClient } from "@/lib/supabase/admin";
import { TipsManager } from "@/components/admin/tips-manager";

export const dynamic = "force-dynamic";

export const metadata = { title: "Dicas · Admin" };

export default async function AdminTipsPage() {
  const admin = createAdminClient();

  const [{ data: tips }, { data: orgs }] = await Promise.all([
    admin
      .from("client_tips")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100),
    admin.from("organizations").select("id, name").order("name"),
  ]);

  return <TipsManager initial={tips ?? []} orgs={orgs ?? []} />;
}
