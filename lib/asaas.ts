/**
 * Integração com o Asaas (Pix/boleto/cartão, assinatura recorrente).
 * Sem ASAAS_API_KEY configurada → modo demonstração (painel mostra "Em breve").
 */

function baseUrl(): string {
  return process.env.ASAAS_ENV === "production"
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3";
}

export function isAsaasConfigured(): boolean {
  return !!process.env.ASAAS_API_KEY;
}

async function asaasFetch<T>(
  path: string,
  init?: RequestInit
): Promise<{ ok: boolean; data: T | null; error: string | null }> {
  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) {
    return { ok: false, data: null, error: "ASAAS_API_KEY não configurada" };
  }
  try {
    const res = await fetch(`${baseUrl()}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        access_token: apiKey,
        ...init?.headers,
      },
    });
    const json = (await res.json().catch(() => null)) as T | null;
    if (!res.ok) {
      const err = json as { errors?: { description?: string }[] } | null;
      return {
        ok: false,
        data: null,
        error: err?.errors?.[0]?.description ?? `Asaas respondeu ${res.status}`,
      };
    }
    return { ok: true, data: json, error: null };
  } catch (err) {
    return {
      ok: false,
      data: null,
      error: err instanceof Error ? err.message : "Falha de rede no Asaas",
    };
  }
}

export interface AsaasCustomer {
  id: string;
}

export async function createAsaasCustomer(params: {
  name: string;
  email: string;
  cpfCnpj: string;
  externalReference: string;
}): Promise<{ id: string | null; error: string | null }> {
  const result = await asaasFetch<AsaasCustomer>("/customers", {
    method: "POST",
    body: JSON.stringify(params),
  });
  return { id: result.data?.id ?? null, error: result.error };
}

export interface AsaasSubscription {
  id: string;
}

export async function createAsaasSubscription(params: {
  customer: string;
  valueCents: number;
  description: string;
  externalReference: string;
}): Promise<{ id: string | null; error: string | null }> {
  const nextDueDate = new Date();
  nextDueDate.setDate(nextDueDate.getDate() + 3);

  const result = await asaasFetch<AsaasSubscription>("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      customer: params.customer,
      // UNDEFINED → o cliente escolhe Pix, boleto ou cartão na fatura
      billingType: "UNDEFINED",
      value: params.valueCents / 100,
      cycle: "MONTHLY",
      description: params.description,
      nextDueDate: nextDueDate.toISOString().slice(0, 10),
      externalReference: params.externalReference,
    }),
  });
  return { id: result.data?.id ?? null, error: result.error };
}

export interface AsaasPayment {
  id: string;
  status: string;
  value: number;
  dueDate: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  description?: string;
  paymentDate?: string | null;
}

/** Fatura mais recente de uma assinatura (link de pagamento). */
export async function getLatestPaymentUrl(
  asaasSubscriptionId: string
): Promise<string | null> {
  const result = await asaasFetch<{ data?: AsaasPayment[] }>(
    `/subscriptions/${asaasSubscriptionId}/payments?limit=1`
  );
  const payment = result.data?.data?.[0];
  return payment?.invoiceUrl ?? payment?.bankSlipUrl ?? null;
}

/** Histórico de faturas do cliente (para a tela de assinatura). */
export async function listCustomerPayments(
  asaasCustomerId: string
): Promise<AsaasPayment[]> {
  const result = await asaasFetch<{ data?: AsaasPayment[] }>(
    `/payments?customer=${asaasCustomerId}&limit=12`
  );
  return result.data?.data ?? [];
}
