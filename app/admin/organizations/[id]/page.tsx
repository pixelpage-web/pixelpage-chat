import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { OrgDetail } from "@/components/admin/org-detail";

export const metadata = { title: "Organização · Admin" };

function monthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export default async function AdminOrgDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: org } = await admin
    .from("organizations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!org) notFound();

  const [
    { data: subscription },
    { data: plans },
    { data: connections },
    { data: members },
    { data: usage },
    { count: conversationCount },
    { data: trialExtensions },
  ] = await Promise.all([
    admin.from("subscriptions").select("*").eq("org_id", id).maybeSingle(),
    admin.from("plans").select("*").order("ai_messages_limit"),
    admin.from("whatsapp_connections").select("*").eq("org_id", id),
    admin.from("profiles").select("id, name, role, created_at").eq("org_id", id),
    admin
      .from("usage_counters")
      .select("ai_messages_used")
      .eq("org_id", id)
      .eq("period_start", monthKey())
      .maybeSingle(),
    admin
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("org_id", id),
    admin
      .from("trial_extensions")
      .select("id, days_added, previous_end_at, new_end_at, reason, created_at")
      .eq("org_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  return (
    <OrgDetail
      org={org}
      subscription={subscription ?? null}
      plans={plans ?? []}
      connections={connections ?? []}
      members={members ?? []}
      aiUsed={usage?.ai_messages_used ?? 0}
      conversationCount={conversationCount ?? 0}
      trialExtensions={trialExtensions ?? []}
    />
  );
}
