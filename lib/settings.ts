import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Configurações globais resolvidas em camadas:
 * defaults → admin_settings (painel /admin) → variáveis de ambiente.
 * Valores em env SEMPRE têm prioridade sobre o painel.
 */

export interface ClaudeConfig {
  model: string;
  maxTokens: number;
  temperature: number | null;
}

interface ClaudeSettingsValue {
  model?: string;
  max_tokens?: number;
  temperature?: number;
}

export async function getClaudeConfig(): Promise<ClaudeConfig> {
  // Defaults da plataforma (o spec do produto usa claude-haiku-4-5 no bot)
  let model = "claude-haiku-4-5";
  let maxTokens = 1024;
  let temperature: number | null = 0.7;

  // Camada 2: admin_settings (best effort — sem service key, segue defaults)
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("admin_settings")
      .select("value")
      .eq("key", "claude")
      .maybeSingle();
    const value = (data?.value ?? {}) as ClaudeSettingsValue;
    if (value.model) model = value.model;
    if (typeof value.max_tokens === "number") maxTokens = value.max_tokens;
    if (typeof value.temperature === "number") temperature = value.temperature;
  } catch {
    // banco indisponível ou service key ausente — usa defaults/env
  }

  // Camada 3: env tem prioridade final
  if (process.env.CLAUDE_MODEL) model = process.env.CLAUDE_MODEL;
  if (process.env.CLAUDE_MAX_TOKENS) {
    const parsed = Number(process.env.CLAUDE_MAX_TOKENS);
    if (Number.isFinite(parsed) && parsed > 0) maxTokens = parsed;
  }
  if (process.env.CLAUDE_TEMPERATURE) {
    const parsed = Number(process.env.CLAUDE_TEMPERATURE);
    if (Number.isFinite(parsed)) temperature = parsed;
  }

  return { model, maxTokens, temperature };
}
