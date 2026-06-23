import { createAdminClient } from "@/lib/supabase/admin";
import { TemplatesManager } from "@/components/admin/templates-manager";

export const metadata = { title: "Templates · Admin" };

export default async function AdminTemplatesPage() {
  const admin = createAdminClient();
  const { data: templates } = await admin
    .from("message_templates")
    .select("*")
    .order("niche")
    .order("name");

  return <TemplatesManager initialTemplates={templates ?? []} />;
}
