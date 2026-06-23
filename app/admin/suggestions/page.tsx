import { createAdminClient } from "@/lib/supabase/admin";
import { SuggestionsManager } from "@/components/admin/suggestions-manager";

export const metadata = { title: "Sugestões · Admin" };

export default async function AdminSuggestionsPage() {
  const admin = createAdminClient();

  const [{ data: suggestions }, { data: orgs }] = await Promise.all([
    admin
      .from("suggestions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200),
    admin.from("organizations").select("id, name"),
  ]);

  const orgNames: Record<string, string> = {};
  for (const org of orgs ?? []) orgNames[org.id] = org.name;

  return (
    <SuggestionsManager
      initialSuggestions={suggestions ?? []}
      orgNames={orgNames}
    />
  );
}
