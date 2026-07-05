import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOwnerEmail } from "@/lib/notify";
import { orgHasMetaApi } from "@/lib/plan-features";

/**
 * Pedido de número novo com API Oficial da Meta (produto interno).
 * Salva o lead no banco e dispara email para o dono da plataforma.
 */
export async function POST(request: Request) {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const orgId = session.profile.org_id;

  // Gating: apenas orgs no plano Pro (meta_api_enabled)
  const hasMetaApi = await orgHasMetaApi(orgId);
  if (!hasMetaApi) {
    return NextResponse.json({ error: "Disponível apenas no plano Pro." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const companyName = str(body.company_name);
  const contactName = str(body.contact_name);
  const contactEmail = str(body.contact_email);
  const contactWhatsapp = str(body.contact_whatsapp);
  const document = str(body.document);
  const desiredPhone = str(body.desired_phone);

  // Campos mínimos para a equipe conseguir dar retorno
  if (!companyName || !contactName || !contactWhatsapp) {
    return NextResponse.json(
      { error: "Preencha empresa, responsável e WhatsApp de contato." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { error } = await admin.from("api_oficial_requests").insert({
    org_id: orgId,
    company_name: companyName,
    document: document || null,
    desired_phone: desiredPhone || null,
    contact_name: contactName,
    contact_email: contactEmail || null,
    contact_whatsapp: contactWhatsapp,
    status: "pending",
  });

  if (error) {
    return NextResponse.json(
      { error: "Não foi possível registrar o pedido. Tente novamente." },
      { status: 500 }
    );
  }

  await admin.from("audit_logs").insert({
    org_id: orgId,
    actor_id: session.user.id,
    action: "api_oficial.requested",
    metadata: { company_name: companyName, contact_whatsapp: contactWhatsapp },
  });

  // Email para a equipe (no-op se Resend não estiver configurado)
  await sendOwnerEmail({
    subject: `🟢 Novo pedido de API Oficial — ${companyName}`,
    html: `
      <h2>Novo pedido de número com API Oficial</h2>
      <ul>
        <li><strong>Empresa:</strong> ${companyName}</li>
        <li><strong>Documento:</strong> ${document || "—"}</li>
        <li><strong>Número desejado:</strong> ${desiredPhone || "qualquer disponível"}</li>
        <li><strong>Responsável:</strong> ${contactName}</li>
        <li><strong>Email:</strong> ${contactEmail || "—"}</li>
        <li><strong>WhatsApp:</strong> ${contactWhatsapp}</li>
      </ul>
      <p>Veja em <a href="${process.env.NEXT_PUBLIC_APP_URL ?? ""}/admin/api-oficial">/admin/api-oficial</a></p>
    `,
  });

  return NextResponse.json({ ok: true });
}
