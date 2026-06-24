import { createAdminClient } from "@/lib/supabase/admin";
import { ApiOficialManager } from "@/components/admin/api-oficial-manager";

export const dynamic = "force-dynamic";

export const metadata = { title: "Pedidos API Oficial · Admin" };

export default async function AdminApiOficialPage() {
  const admin = createAdminClient();

  const [{ data: requests }, { data: orgs }] = await Promise.all([
    admin
      .from("api_oficial_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300),
    admin.from("organizations").select("id, name"),
  ]);

  const orgNames: Record<string, string> = {};
  for (const org of orgs ?? []) orgNames[org.id] = org.name;

  return <ApiOficialManager initialRequests={requests ?? []} orgNames={orgNames} />;
}
