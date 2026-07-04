import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createCaktoPayment,
  isCaktoPaymentsConfigured,
  isRateLimited,
  resolveOfferId,
} from "@/lib/cakto-payments";

export async function POST(request: Request) {
  if (!isCaktoPaymentsConfigured()) {
    return NextResponse.json({ error: "Gateway não configurado" }, { status: 503 });
  }

  const session = await getSessionProfile();
  if (!session?.profile?.org_id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const orgId = session.profile.org_id;

  let body: {
    offerId?: string;
    customer?: {
      name?: string;
      email?: string;
      phone?: string;
      docType?: string;
      docNumber?: string;
    };
    fingerprint?: string;
    antifraudRef?: string;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const { offerId, customer, fingerprint, antifraudRef } = body;

  if (!offerId || !customer?.name || !customer?.email || !customer?.phone) {
    return NextResponse.json({ error: "Campos obrigatórios ausentes" }, { status: 400 });
  }

  const admin = createAdminClient();

  const resolvedPlan = await resolveOfferId(offerId, admin);
  if (!resolvedPlan) {
    return NextResponse.json({ error: "Oferta inválida" }, { status: 400 });
  }

  if (await isRateLimited(orgId, admin)) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde alguns minutos." },
      { status: 429 }
    );
  }

  await admin.from("audit_logs").insert({
    org_id: orgId,
    action: "billing.payment_attempt_pix",
    metadata: { offer_id: offerId, plan_name: resolvedPlan.planName },
  });

  let caktoRes: Response;
  try {
    caktoRes = await createCaktoPayment(
      {
        paymentMethod: "pix",
        customer: {
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          fingerprint: fingerprint ?? randomUUID(),
          docType: customer.docType === "cnpj" ? "cnpj" : "cpf",
          docNumber: customer.docNumber?.replace(/\D/g, ""),
        },
        items: [{ offerId, quantity: 1, offerType: "main" }],
        antifraudProfilingAttemptReference: antifraudRef ?? randomUUID(),
        pixExpiresIn: 3600, // 1 hora
      },
      randomUUID()
    );
  } catch (err) {
    console.error("[cakto-pix] network error:", err);
    return NextResponse.json({ error: "Falha de rede ao processar PIX" }, { status: 502 });
  }

  if (!caktoRes.ok) {
    const errJson = await caktoRes.json().catch(() => null);
    console.error("[cakto-pix] API error", caktoRes.status, JSON.stringify(errJson));
    return NextResponse.json(
      { error: "Falha ao gerar QR Code PIX. Verifique os dados e tente novamente." },
      { status: 502 }
    );
  }

  const data = (await caktoRes.json()) as {
    id?: string;
    amount?: number;
    pix?: { qrCode?: string; qrCodeBase64?: string; expiresAt?: string };
  };

  return NextResponse.json({
    id: data.id,
    amount: data.amount,
    qrCode: data.pix?.qrCode,
    qrCodeBase64: data.pix?.qrCodeBase64,
    expiresAt: data.pix?.expiresAt,
  });
}
