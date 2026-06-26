import { NextResponse } from "next/server";

/**
 * Envelope padrão da API pública /api/v1 — todas as respostas seguem:
 *   sucesso → { ok: true, data: {...} }
 *   erro    → { ok: false, error: "mensagem" }
 * Mantém os headers de rate limit quando fornecidos.
 */

export function apiOk<T>(
  data: T,
  init?: { status?: number; headers?: Record<string, string> }
): NextResponse {
  return NextResponse.json(
    { ok: true, data },
    { status: init?.status ?? 200, headers: init?.headers }
  );
}

export function apiError(
  error: string,
  init?: { status?: number; headers?: Record<string, string> }
): NextResponse {
  return NextResponse.json(
    { ok: false, error },
    { status: init?.status ?? 400, headers: init?.headers }
  );
}
