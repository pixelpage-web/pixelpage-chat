/**
 * fetch() com retry — só para falhas de rede/timeout (fetch() lança exceção:
 * DNS, conexão recusada, timeout de socket). NUNCA retenta uma resposta HTTP
 * já recebida (2xx-5xx incluído) — um 4xx de validação não muda com retry, e
 * decidir sobre 5xx fica a critério de quem chama (aqui o objetivo é só
 * cobrir instabilidade passageira de rede, ex.: deploy/restart da Evolution
 * API). Usado por lib/evolution.ts e lib/meta.ts para não duplicar a lógica.
 */
const DEFAULT_DELAYS_MS = [500, 1500];

export async function fetchWithRetry(
  input: string,
  init?: RequestInit,
  delaysMs: number[] = DEFAULT_DELAYS_MS
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= delaysMs.length; attempt++) {
    try {
      return await fetch(input, init);
    } catch (err) {
      lastErr = err;
      if (attempt < delaysMs.length) {
        await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]));
      }
    }
  }
  throw lastErr;
}
