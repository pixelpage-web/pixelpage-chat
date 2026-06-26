import { redirect, notFound } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { PLATFORM_WORKFLOW_URL } from "@/lib/external-webhook";
import { WebhookConfig } from "@/components/connections/webhook-config";

export const dynamic = "force-dynamic";

export const metadata = { title: "Webhook n8n" };

export default async function ConnectionWebhookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) redirect("/app/onboarding");
  const orgId = session.profile.org_id;

  const supabase = await createServerSupabase();

  const { data: connection } = await supabase
    .from("whatsapp_connections")
    .select("id, label, org_id")
    .eq("id", id)
    .maybeSingle();
  if (!connection || connection.org_id !== orgId) notFound();

  // Webhook desta conexão (ou o webhook geral da org, sem conexão)
  const { data: webhooks } = await supabase
    .from("external_webhooks")
    .select("*")
    .eq("org_id", orgId);
  const webhook =
    webhooks?.find((w) => w.connection_id === connection.id) ??
    webhooks?.find((w) => w.connection_id === null) ??
    null;

  const { data: logRows } = webhook
    ? await supabase
        .from("webhook_logs")
        .select("*")
        .eq("webhook_id", webhook.id)
        .order("created_at", { ascending: false })
        .limit(20)
    : { data: [] };

  // A org tem alguma API key? (não expomos a chave em si — só o hash existe)
  const { count: apiKeyCount } = await supabase
    .from("api_keys")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://app.pixelpagechat.com.br";

  return (
    <WebhookConfig
      connection={{ id: connection.id, label: connection.label }}
      orgId={orgId}
      initialWebhook={webhook}
      initialLogs={logRows ?? []}
      appUrl={appUrl}
      platformWorkflowUrl={PLATFORM_WORKFLOW_URL}
      hasApiKey={(apiKeyCount ?? 0) > 0}
    />
  );
}
