import { createAdminClient } from "@/lib/supabase/admin";
import { SettingsManager } from "@/components/admin/settings-manager";
import { HelpCard } from "@/components/ui/help-card";
import type { Json } from "@/types/database";

export const metadata = { title: "Configurações · Admin" };

export default async function AdminSettingsPage() {
  const admin = createAdminClient();
  const [{ data: rows }, { data: apiKeys }, { data: orgs }] = await Promise.all([
    admin.from("admin_settings").select("*"),
    admin
      .from("api_keys")
      .select("id, org_id, label, last_used_at, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    admin.from("organizations").select("id, name"),
  ]);

  const settings: Record<string, Json> = {};
  for (const row of rows ?? []) {
    settings[row.key] = row.value;
  }

  const orgNames: Record<string, string> = {};
  for (const org of orgs ?? []) orgNames[org.id] = org.name;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://seu-dominio.com.br";

  // Indica quais valores vêm de env (env tem prioridade sobre o painel)
  const envFlags = {
    claude_api_key: !!process.env.ANTHROPIC_API_KEY,
    claude_model: !!process.env.CLAUDE_MODEL,
    claude_max_tokens: !!process.env.CLAUDE_MAX_TOKENS,
    claude_temperature: !!process.env.CLAUDE_TEMPERATURE,
    meta_app_id: !!process.env.META_APP_ID,
    meta_verify_token: !!process.env.META_VERIFY_TOKEN,
    meta_system_token: !!process.env.META_SYSTEM_USER_TOKEN,
    evolution_url: !!process.env.EVOLUTION_API_URL,
    evolution_key: !!process.env.EVOLUTION_API_KEY,
  };

  return (
    <>
      <div className="mx-auto max-w-3xl px-4 pt-4 sm:px-6">
        <HelpCard>
          Credenciais que conectam a plataforma a serviços externos. Use
          &quot;Testar conexão&quot; após salvar.
        </HelpCard>
      </div>
      <SettingsManager
        initialSettings={settings}
        envFlags={envFlags}
        webhookUrl={`${appUrl}/api/webhooks/meta`}
        apiKeys={(apiKeys ?? []).map((k) => ({
          id: k.id,
          label: k.label,
          last_used_at: k.last_used_at,
          created_at: k.created_at,
          org_name: orgNames[k.org_id] ?? k.org_id,
        }))}
      />
    </>
  );
}
