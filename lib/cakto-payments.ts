import { createAdminClient } from "@/lib/supabase/admin";

const CAKTO_BASE = "https://api.cakto.com.br";

// Module-level cache — persists across warm serverless invocations
let _token: { value: string; expiresAt: number } | null = null;

export function isCaktoPaymentsConfigured(): boolean {
  return !!(
    process.env.CAKTO_PAYMENTS_CLIENT_ID &&
    process.env.CAKTO_PAYMENTS_CLIENT_SECRET
  );
}

export async function getCaktoPaymentsToken(): Promise<string> {
  const now = Date.now();
  if (_token && _token.expiresAt > now + 60_000) return _token.value;

  const res = await fetch(`${CAKTO_BASE}/public_api/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.CAKTO_PAYMENTS_CLIENT_ID!,
      client_secret: process.env.CAKTO_PAYMENTS_CLIENT_SECRET!,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Cakto auth failed ${res.status}: ${text}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  _token = { value: json.access_token, expiresAt: now + json.expires_in * 1000 };
  return _token.value;
}

/** POST /public_api/payments/ com idempotency key */
export async function createCaktoPayment(
  body: Record<string, unknown>,
  idempotencyKey: string
): Promise<Response> {
  const token = await getCaktoPaymentsToken();
  return fetch(`${CAKTO_BASE}/public_api/payments/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });
}

/**
 * Valida que o offerId vem de um plano ativo do nosso catálogo.
 * Extrai o short-id do final da cakto_checkout_url e compara.
 */
export async function resolveOfferId(
  offerId: string,
  admin: ReturnType<typeof createAdminClient>
): Promise<{ planId: string; planName: string } | null> {
  const { data: plans } = await admin
    .from("plans")
    .select("id, name, cakto_checkout_url")
    .eq("active", true);

  const plan = (plans ?? []).find(
    (p) => p.cakto_checkout_url?.split("/").pop() === offerId
  );
  return plan ? { planId: plan.id, planName: plan.name } : null;
}

/**
 * Rate limit: max 10 tentativas de pagamento por org a cada 10 minutos.
 * Conta via audit_logs (não requer Redis em serverless).
 */
export async function isRateLimited(
  orgId: string,
  admin: ReturnType<typeof createAdminClient>
): Promise<boolean> {
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .like("action", "billing.payment_attempt_%")
    .gte("created_at", since);
  return (count ?? 0) >= 10;
}
