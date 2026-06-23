/**
 * Rate limiting da API pública: 60 requisições/minuto por API key.
 * Janela deslizante em memória — em serverless cada instância tem o próprio
 * contador (proteção best-effort; suficiente para abuso acidental).
 */

const WINDOW_MS = 60_000;
const LIMIT = 60;

const hits = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** epoch em segundos em que a janela reseta */
  reset: number;
}

export function checkRateLimit(keyId: string): RateLimitResult {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  const timestamps = (hits.get(keyId) ?? []).filter((ts) => ts > windowStart);

  if (timestamps.length >= LIMIT) {
    hits.set(keyId, timestamps);
    return {
      allowed: false,
      limit: LIMIT,
      remaining: 0,
      reset: Math.ceil((timestamps[0] + WINDOW_MS) / 1000),
    };
  }

  timestamps.push(now);
  hits.set(keyId, timestamps);

  // Limpeza ocasional para não acumular chaves antigas
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (v.every((ts) => ts <= windowStart)) hits.delete(k);
    }
  }

  return {
    allowed: true,
    limit: LIMIT,
    remaining: LIMIT - timestamps.length,
    reset: Math.ceil((now + WINDOW_MS) / 1000),
  };
}

/** Headers informativos de rate limit para as respostas da API pública. */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.reset),
  };
}
