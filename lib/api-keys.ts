import { createHash, randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * API keys da organização (API pública /api/v1).
 * A chave em claro é exibida UMA única vez na criação;
 * no banco fica apenas o hash SHA-256.
 */

export interface GeneratedKey {
  plaintext: string;
  hash: string;
}

export function generateApiKey(): GeneratedKey {
  const plaintext = `zari_${randomBytes(24).toString("hex")}`;
  return { plaintext, hash: hashApiKey(plaintext) };
}

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}

export interface ApiKeyAuth {
  orgId: string;
  keyId: string;
}

/**
 * Autentica uma requisição da API pública.
 * Aceita `Authorization: Bearer zari_...` ou header `X-Api-Key`.
 */
export async function authenticateApiKey(
  request: Request
): Promise<ApiKeyAuth | null> {
  const authHeader = request.headers.get("authorization");
  const key = authHeader?.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : request.headers.get("x-api-key")?.trim();

  if (!key || !key.startsWith("zari_")) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("api_keys")
    .select("id, org_id")
    .eq("key_hash", hashApiKey(key))
    .maybeSingle();

  if (!data) return null;

  // Atualiza o último uso (não bloqueia a resposta)
  void admin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => undefined);

  return { orgId: data.org_id, keyId: data.id };
}
