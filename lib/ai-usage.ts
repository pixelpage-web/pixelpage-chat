import type { SupabaseClient } from "@supabase/supabase-js";
import { sendOwnerEmail } from "@/lib/notify";
import type { AiUsageSource, Database } from "@/types/database";

/**
 * Rastreamento de custo real de IA por org + gate de proteção de margem.
 * Toda chamada que gera uma resposta de IA (bot, flow, resumo, nota, teste)
 * passa por aqui — ver lib/claude.ts (generateAgentReply).
 */

type AdminClient = SupabaseClient<Database>;

export interface ModelPricing {
  inputPerMtok: number;
  outputPerMtok: number;
}

/** Busca o preço do modelo (match exato). Retorna null se não cadastrado. */
export async function getModelPricing(
  admin: AdminClient,
  model: string
): Promise<ModelPricing | null> {
  const { data, error } = await admin
    .from("ai_model_pricing")
    .select("input_per_mtok, output_per_mtok")
    .eq("model", model)
    .maybeSingle();

  if (error) {
    console.error("[ai-usage] falha ao buscar preço do modelo:", model, error.message);
    return null;
  }
  if (!data) {
    console.warn(`[ai-usage] modelo sem preço cadastrado em ai_model_pricing: ${model}`);
    return null;
  }
  return { inputPerMtok: data.input_per_mtok, outputPerMtok: data.output_per_mtok };
}

/** Custo em USD para o par (inputTokens, outputTokens) sob o preço dado. */
export function computeCostUsd(
  pricing: ModelPricing | null,
  inputTokens: number,
  outputTokens: number
): number {
  if (!pricing) return 0;
  return (
    (inputTokens / 1_000_000) * pricing.inputPerMtok +
    (outputTokens / 1_000_000) * pricing.outputPerMtok
  );
}

/** true se a org PODE consumir IA agora (status atual != 'blocked'). */
export async function checkAiUsageAllowed(
  admin: AdminClient,
  orgId: string
): Promise<boolean> {
  const { data, error } = await admin.rpc("get_org_usage_status", { p_org_id: orgId });
  if (error) {
    // Falha ao checar o gate não pode impedir o bot de responder — best effort.
    console.error("[ai-usage] falha ao checar status de uso:", orgId, error.message);
    return true;
  }
  return data !== "blocked";
}

/** Perfis (owner/admin) da org — alvo das notificações de uso de IA. */
async function getOrgOwnerAdminUserIds(
  admin: AdminClient,
  orgId: string
): Promise<string[]> {
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("org_id", orgId)
    .in("role", ["owner", "admin"]);
  return (data ?? []).map((p) => p.id);
}

async function notifyUsageTransition(
  admin: AdminClient,
  orgId: string,
  newStatus: string,
  totalCostUsd: number,
  limitUsd: number | null
): Promise<void> {
  try {
    if (newStatus === "warning") {
      const userIds = await getOrgOwnerAdminUserIds(admin, orgId);
      if (userIds.length > 0) {
        await admin.from("in_app_notifications").insert(
          userIds.map((userId) => ({
            org_id: orgId,
            user_id: userId,
            notification_type: "ai_usage_warning",
            body: "Seu uso de IA atingiu 80% do limite do plano este mês.",
          }))
        );
      }
      return;
    }

    if (newStatus === "blocked") {
      const userIds = await getOrgOwnerAdminUserIds(admin, orgId);
      if (userIds.length > 0) {
        await admin.from("in_app_notifications").insert(
          userIds.map((userId) => ({
            org_id: orgId,
            user_id: userId,
            notification_type: "ai_usage_blocked",
            body: "Limite de IA do plano atingido — o assistente automático foi pausado. Faça upgrade para continuar.",
          }))
        );
      }

      const { data: org } = await admin
        .from("organizations")
        .select("name")
        .eq("id", orgId)
        .single();
      const orgName = org?.name ?? orgId;
      await sendOwnerEmail({
        subject: `[Alerta] Org ${orgName} atingiu o limite de custo de IA`,
        html: `
          <p>A organização <strong>${orgName}</strong> (id: ${orgId}) atingiu o limite de custo de IA do plano.</p>
          <p>Custo acumulado no mês: US$ ${totalCostUsd.toFixed(4)}</p>
          <p>Limite do plano: US$ ${(limitUsd ?? 0).toFixed(4)}</p>
          <p>O assistente automático (bot) foi pausado para esta organização até o próximo ciclo ou upgrade de plano.</p>
        `,
      });
    }
  } catch (err) {
    console.error("[ai-usage] falha ao notificar transição de status:", orgId, err);
  }
}

export interface RecordAiUsageParams {
  orgId: string;
  agentId: string | null;
  conversationId: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  responseTimeMs: number;
  source: AiUsageSource;
  /** Provider que efetivamente atendeu — default "anthropic" (comportamento de hoje). */
  provider?: string;
  /**
   * Uso via chave própria do cliente (BYOK) — custo é do cliente, não da
   * plataforma. Quando true, NÃO calculamos cost_usd (fica 0/zerado) e a RPC
   * não conta esse consumo para o teto de custo do plano.
   */
  isByok?: boolean;
}

/**
 * Registra 1 evento de uso de IA (log granular + rollup mensal) e dispara
 * notificações em caso de transição de faixa (ok→warning, *→blocked).
 * Nunca lança — falhas aqui não podem derrubar o fluxo de resposta do bot.
 */
export async function recordAiUsage(
  admin: AdminClient,
  params: RecordAiUsageParams
): Promise<void> {
  try {
    const isByok = params.isByok ?? false;
    // BYOK: custo é do próprio cliente — nem buscamos preço, cost_usd sempre 0.
    const costUsd = isByok
      ? 0
      : computeCostUsd(
          await getModelPricing(admin, params.model),
          params.inputTokens,
          params.outputTokens
        );

    const { data, error } = await admin.rpc("record_ai_usage", {
      p_org_id: params.orgId,
      p_agent_id: params.agentId,
      p_conversation_id: params.conversationId,
      p_provider: params.provider ?? "anthropic",
      p_model: params.model,
      p_input_tokens: params.inputTokens,
      p_output_tokens: params.outputTokens,
      p_cost_usd: costUsd,
      p_response_time_ms: params.responseTimeMs,
      p_source: params.source,
      p_is_byok: isByok,
    });

    if (error) {
      console.error("[ai-usage] falha ao registrar uso de IA:", params.orgId, error.message);
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (row && row.previous_status !== row.new_status) {
      await notifyUsageTransition(
        admin,
        params.orgId,
        row.new_status,
        row.total_ai_cost_usd,
        row.plan_limit_ai_cost_usd
      );
    }
  } catch (err) {
    console.error("[ai-usage] erro inesperado ao registrar uso de IA:", params.orgId, err);
  }
}
