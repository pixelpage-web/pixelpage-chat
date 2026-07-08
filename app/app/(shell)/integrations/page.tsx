import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { WebhookCard } from "@/components/integrations/webhook-card";
import { ApiKeysCard } from "@/components/integrations/api-keys-card";
import { AiModeCard } from "@/components/integrations/ai-mode-card";
import type { AiMode, AiProvider } from "@/types/database";

export const dynamic = "force-dynamic";

export const metadata = { title: "Integrações" };

export default async function IntegrationsPage() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) redirect("/app/onboarding");
  const orgId = session.profile.org_id;

  const supabase = await createServerSupabase();

  const [{ data: webhooks }, { data: apiKeys }, { data: orgRow }, { data: secretsStatus }] =
    await Promise.all([
      supabase
        .from("external_webhooks")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: true })
        .limit(1),
      supabase
        .from("api_keys")
        .select("id, label, last_used_at, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false }),
      supabase
        .from("organizations")
        .select("ai_mode, ai_provider, ai_byok_verified_at")
        .eq("id", orgId)
        .maybeSingle(),
      supabase.rpc("get_org_secrets_status", { p_org_id: orgId }),
    ]);

  const webhook = webhooks?.[0] ?? null;
  const hasAiKey = secretsStatus?.[0]?.has_ai_key ?? false;

  const { data: logs } = webhook
    ? await supabase
        .from("webhook_logs")
        .select("*")
        .eq("webhook_id", webhook.id)
        .order("created_at", { ascending: false })
        .limit(20)
    : { data: [] };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.zari.com.br";
  const isOwner =
    session.profile.role === "owner" || session.profile.role === "admin";

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
        <header>
          <h1 className="font-display text-lg font-semibold">Integrações</h1>
          <p className="mt-0.5 text-sm text-txt-mut">
            Conecte seu n8n e use a API pública da PixelPage Chat para automatizar tudo.
          </p>
        </header>

        <AiModeCard
          initialAiMode={(orgRow?.ai_mode as AiMode) ?? "managed"}
          initialAiProvider={(orgRow?.ai_provider as AiProvider | null) ?? null}
          initialVerifiedAt={orgRow?.ai_byok_verified_at ?? null}
          initialHasAiKey={hasAiKey}
        />

        <WebhookCard
          orgId={orgId}
          initialWebhook={webhook}
          initialLogs={logs ?? []}
          appUrl={appUrl}
        />

        <ApiKeysCard initialKeys={apiKeys ?? []} appUrl={appUrl} isOwner={isOwner} />
      </div>
    </div>
  );
}
