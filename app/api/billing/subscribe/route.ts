import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createAsaasCustomer,
  createAsaasSubscription,
  getLatestPaymentUrl,
  isAsaasConfigured,
} from "@/lib/asaas";

/**
 * Inicia a assinatura de um plano via Asaas.
 * Sem ASAAS_API_KEY → responde { demo: true } e o painel mostra "Em breve".
 * Com Asaas → cria cliente + assinatura recorrente e devolve o link da fatura.
 * A ativação do plano acontece SOMENTE quando o webhook do Asaas confirmar
 * o pagamento (/api/webhooks/asaas).
 */

interface SubscribeBody {
  plan_id?: string;
  cpf_cnpj?: string;
}

export async function POST(request: Request) {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (session.profile.role !== "owner" && session.profile.role !== "admin") {
    return NextResponse.json(
      { error: "Apenas o dono da organização altera o plano" },
      { status: 403 }
    );
  }
  const orgId = session.profile.org_id;

  let body: SubscribeBody;
  try {
    body = (await request.json()) as SubscribeBody;
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }
  if (!body.plan_id) {
    return NextResponse.json({ error: "plan_id é obrigatório" }, { status: 400 });
  }

  // Modo demonstração
  if (!isAsaasConfigured()) {
    return NextResponse.json({ demo: true });
  }

  const admin = createAdminClient();

  const [{ data: plan }, { data: org }, { data: subscription }] =
    await Promise.all([
      admin.from("plans").select("*").eq("id", body.plan_id).maybeSingle(),
      admin.from("organizations").select("name").eq("id", orgId).maybeSingle(),
      admin.from("subscriptions").select("*").eq("org_id", orgId).maybeSingle(),
    ]);

  if (!plan || !plan.active || plan.name === "Trial") {
    return NextResponse.json({ error: "Plano indisponível" }, { status: 400 });
  }
  if (plan.price_cents <= 0) {
    return NextResponse.json(
      { error: "Plano sem preço definido — contate o suporte." },
      { status: 400 }
    );
  }
  if (!org || !subscription) {
    return NextResponse.json({ error: "Organização sem assinatura" }, { status: 400 });
  }

  // Cliente Asaas (reusa se já existe)
  let customerId = subscription.asaas_customer_id;
  if (!customerId) {
    const cpfCnpj = body.cpf_cnpj?.replace(/\D/g, "");
    if (!cpfCnpj || (cpfCnpj.length !== 11 && cpfCnpj.length !== 14)) {
      return NextResponse.json(
        { error: "Informe um CPF ou CNPJ válido para emitir a cobrança.", need_cpf: true },
        { status: 400 }
      );
    }
    const customer = await createAsaasCustomer({
      name: org.name,
      email: session.user.email ?? "",
      cpfCnpj,
      externalReference: orgId,
    });
    if (!customer.id) {
      return NextResponse.json(
        { error: customer.error ?? "Falha ao criar cliente no Asaas" },
        { status: 502 }
      );
    }
    customerId = customer.id;
  }

  // Assinatura recorrente — externalReference carrega org+plano para o webhook
  const asaasSub = await createAsaasSubscription({
    customer: customerId,
    valueCents: plan.price_cents,
    description: `PixelPage Chat — Plano ${plan.name}`,
    externalReference: `${orgId}|${plan.id}`,
  });
  if (!asaasSub.id) {
    return NextResponse.json(
      { error: asaasSub.error ?? "Falha ao criar assinatura no Asaas" },
      { status: 502 }
    );
  }

  await admin
    .from("subscriptions")
    .update({
      asaas_customer_id: customerId,
      asaas_subscription_id: asaasSub.id,
    })
    .eq("org_id", orgId);

  await admin.from("audit_logs").insert({
    org_id: orgId,
    actor_id: session.user.id,
    action: "billing.subscribe_started",
    metadata: { plan_id: plan.id, plan_name: plan.name, asaas_subscription_id: asaasSub.id },
  });

  const paymentUrl = await getLatestPaymentUrl(asaasSub.id);

  return NextResponse.json({
    ok: true,
    payment_url: paymentUrl,
    message: paymentUrl
      ? "Fatura gerada! Pague para ativar o plano."
      : "Assinatura criada — a fatura chega no seu email.",
  });
}
