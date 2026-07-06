import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { decryptSecret } from "@/lib/crypto";

/**
 * Resolve qual provider/chave usar para gerar a resposta de IA de uma org —
 * chave gerenciada da plataforma (managed), chave própria do cliente (byok),
 * ou IA desligada (disabled). Ponto único de leitura de organizations.ai_mode
 * / ai_provider / ai_byok_verified_at + org_secrets, usado por
 * lib/claude.ts::generateAgentReply antes de decidir qual provider chamar.
 */

type AdminClient = SupabaseClient<Database>;

export interface ResolvedAiConfig {
  mode: "managed" | "byok" | "disabled";
  provider: "anthropic" | "openai" | null; // só definido quando mode === "byok"
  apiKey: string | null; // decifrada, só definida quando mode === "byok" e existe uma chave válida
}

export async function resolveOrgAiConfig(
  admin: AdminClient,
  orgId: string
): Promise<ResolvedAiConfig> {
  const { data: org, error } = await admin
    .from("organizations")
    .select("ai_mode, ai_provider, ai_byok_verified_at")
    .eq("id", orgId)
    .maybeSingle();

  if (error || !org) {
    // Falha ao ler a config não pode travar o bot — comportamento de hoje
    // (managed) é o fallback mais seguro. Best effort, mesmo espírito de
    // lib/ai-usage.ts::checkAiUsageAllowed / lib/settings.ts::getClaudeConfig.
    console.error(
      "[ai-provider] falha ao buscar config de IA da org (usando fallback managed):",
      orgId,
      error?.message
    );
    return { mode: "managed", provider: null, apiKey: null };
  }

  const mode = (org.ai_mode as ResolvedAiConfig["mode"]) || "managed";

  // Cobre tanto "managed" (comportamento de hoje, inalterado) quanto "disabled".
  if (mode !== "byok") {
    return { mode, provider: null, apiKey: null };
  }

  const provider = (org.ai_provider as ResolvedAiConfig["provider"]) ?? null;

  // Nunca verificado com sucesso -> sem chave utilizável, mesmo que exista
  // algo salvo em org_secrets (só marcamos ai_byok_verified_at após uma
  // verificação bem sucedida no fluxo de salvar).
  if (!org.ai_byok_verified_at) {
    return { mode: "byok", provider, apiKey: null };
  }

  const { data: secretsRow, error: secretsError } = await admin
    .from("org_secrets")
    .select("ai_byok_key_encrypted")
    .eq("org_id", orgId)
    .maybeSingle();

  if (secretsError) {
    console.error(
      "[ai-provider] falha ao buscar org_secrets da org:",
      orgId,
      secretsError.message
    );
  }

  if (!secretsRow?.ai_byok_key_encrypted) {
    // Defensivo: não deveria acontecer (o fluxo de salvar só marca
    // ai_byok_verified_at depois de gravar a chave), mas não deixamos a
    // ausência inesperada da linha derrubar a chamada.
    return { mode: "byok", provider, apiKey: null };
  }

  try {
    const apiKey = decryptSecret(secretsRow.ai_byok_key_encrypted);
    return { mode: "byok", provider, apiKey };
  } catch (err) {
    // Ex.: master key rotacionada / dado corrompido — nunca lançar daqui, só
    // reportar claramente e tratar como "chave ausente" (byok_key_missing).
    console.error("[ai-provider] falha ao decifrar chave BYOK da org:", orgId, err);
    return { mode: "byok", provider, apiKey: null };
  }
}
