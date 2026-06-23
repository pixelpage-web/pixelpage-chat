import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Webhook do Asaas — confirma pagamento e ativa/renova a assinatura.
 * Autenticação: header asaas-access-token deve bater com ASAAS_WEBHOOK_TOKEN.
 *
 * Eventos tratados:
 *   PAYMENT_CONFIRMED / PAYMENT_RECEIVED → ativa o plano + renova o período
 *   PAYMENT_OVERDUE                      → marca como past_due
 */

interface AsaasWebhookBody {
  event?: string;
  payment?: {
    id?: string;
    subscription?: string;
    externalReference?: string | null;
    value?: number;
    dueDate?: string;
  };
}

export async function POST(request: Request) {
  // Validação do token configurado no painel do Asaas
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;
  if (expected) {
    const received = request.headers.get("asaas-access-token");
    if (received !== expected) {
      return NextResponse.json({ error: "Token inválido" }, { status: 401 });
    }
  }

  let body: AsaasWebhookBody;
  try {
    body = (await request.json()) as AsaasWebhookBody;
  } catch {
    return NextResponse.json({ received: true });
  }

  const event = body.event ?? "";
  const payment = body.payment;
  if (!payment) return NextResponse.json({ received: true });

  const admin = createAdminClient();

  // Identifica a organização: externalReference ("org|plan") ou assinatura
  let orgId: string | null = null;
  let planId: string | null = null;

  if (payment.externalReference?.includes("|")) {
    const [org, plan] = payment.externalReference.split("|");
    orgId = org || null;
    planId = plan || null;
  }

  if (!orgId && payment.subscription) {
    const { data: sub } = await admin
      .from("subscriptions")
      .select("org_id, plan_id")
      .eq("asaas_subscription_id", payment.subscription)
      .maybeSingle();
    orgId = sub?.org_id ?? null;
    planId = planId ?? sub?.plan_id ?? null;
  }

  if (!orgId) return NextResponse.json({ received: true });

  if (event === "PAYMENT_CONFIRMED" || event === "PAYMENT_RECEIVED") {
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await admin
      .from("subscriptions")
      .update({
        status: "active",
        ...(planId ? { plan_id: planId } : {}),
        current_period_end: periodEnd.toISOString(),
        trial_ends_at: null,
      })
      .eq("org_id", orgId);

    await admin.from("audit_logs").insert({
      org_id: orgId,
      action: "billing.payment_confirmed",
      metadata: {
        event,
        payment_id: payment.id,
        value: payment.value,
        plan_id: planId,
      },
    });
  } else if (event === "PAYMENT_OVERDUE") {
    await admin
      .from("subscriptions")
      .update({ status: "past_due" })
      .eq("org_id", orgId);

    await admin.from("audit_logs").insert({
      org_id: orgId,
      action: "billing.payment_overdue",
      metadata: { event, payment_id: payment.id },
    });
  }

  return NextResponse.json({ received: true });
}
