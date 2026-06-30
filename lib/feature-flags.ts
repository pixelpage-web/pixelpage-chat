import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Verifica se uma feature flag está habilitada para a org especificada.
 * Usa o service_role client — chamar apenas no servidor.
 *
 * Hierarquia:
 *   1. enabled_globally = true  → habilitada para todos
 *   2. org_id em enabled_for_orgs → habilitada especificamente para essa org
 *   3. Caso contrário → desabilitada
 */
export async function hasFeature(key: string, orgId?: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("feature_flags")
      .select("enabled_globally, enabled_for_orgs")
      .eq("key", key)
      .maybeSingle();

    if (!data) return false;
    if (data.enabled_globally) return true;
    if (orgId && (data.enabled_for_orgs as string[]).includes(orgId)) return true;
    return false;
  } catch {
    // Falha silenciosa — feature desabilitada por padrão
    return false;
  }
}
