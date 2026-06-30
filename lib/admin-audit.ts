import { createAdminClient } from "@/lib/supabase/admin";

interface AuditParams {
  action: string;
  targetType?: string;
  targetId?: string;
  targetName?: string;
  details?: Record<string, unknown>;
  ip?: string;
}

/**
 * Registra uma ação sensível do super admin na tabela admin_audit_logs.
 * Falha silenciosamente — nunca deve bloquear a ação em si.
 * Chamar apenas no servidor (usa service_role).
 */
export async function logAdminAction(params: AuditParams): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("admin_audit_logs").insert({
      action: params.action,
      target_type: params.targetType ?? null,
      target_id: params.targetId ?? null,
      target_name: params.targetName ?? null,
      details: (params.details ?? {}) as unknown as import("@/types/database").Json,
      ip_address: params.ip ?? null,
    });
  } catch {
    // Silencioso — log nunca deve bloquear operações
  }
}
