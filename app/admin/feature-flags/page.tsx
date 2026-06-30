import { createAdminClient } from "@/lib/supabase/admin";
import { FeatureFlagsManager } from "@/components/admin/feature-flags-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Feature Flags · Admin" };

export default async function AdminFeatureFlagsPage() {
  const admin = createAdminClient();

  const [{ data: flags }, { data: orgs }] = await Promise.all([
    admin.from("feature_flags").select("*").order("name"),
    admin.from("organizations").select("id, name").order("name"),
  ]);

  return (
    <FeatureFlagsManager
      initialFlags={flags ?? []}
      orgs={(orgs ?? []).map((o) => ({ id: o.id, name: o.name }))}
    />
  );
}
