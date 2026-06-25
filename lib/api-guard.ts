import type { NextResponse } from "next/server";
import { authenticateApiKey, type ApiKeyAuth } from "@/lib/api-keys";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { apiError } from "@/lib/api-response";

/**
 * Guarda comum das rotas /api/v1: autentica a API key e aplica o rate limit
 * (60 req/min por chave), devolvendo os headers X-RateLimit-* já prontos.
 * Uso:
 *   const guard = await guardApiV1(request);
 *   if (!guard.ok) return guard.response;
 *   const { auth, headers } = guard;
 */
export type GuardResult =
  | { ok: true; auth: ApiKeyAuth; headers: Record<string, string> }
  | { ok: false; response: NextResponse };

export async function guardApiV1(request: Request): Promise<GuardResult> {
  const auth = await authenticateApiKey(request);
  if (!auth) {
    return {
      ok: false,
      response: apiError(
        "API key inválida ou ausente. Use Authorization: Bearer <sua-api-key>.",
        { status: 401 }
      ),
    };
  }
  const rl = checkRateLimit(auth.keyId);
  const headers = rateLimitHeaders(rl);
  if (!rl.allowed) {
    return {
      ok: false,
      response: apiError("Rate limit excedido (60 requisições por minuto).", {
        status: 429,
        headers,
      }),
    };
  }
  return { ok: true, auth, headers };
}
