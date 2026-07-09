import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOwnerEmail } from "@/lib/notify";

/**
 * Abertura de ticket de suporte pelo cliente (botão flutuante "?").
 * Salva o chamado e avisa a equipe por email.
 */
export async function POST(request: Request) {
  const session = await getSessionProfile();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  let body: { subject?: string; message?: string };
  try {
    body = (await request.json()) as { subject?: string; message?: string };
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const subject = (body.subject ?? "").trim().slice(0, 200);
  const message = (body.message ?? "").trim();
  if (message.length < 5) {
    return NextResponse.json(
      { error: "Descreva um pouco mais o que você precisa." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const authorName = session.profile?.name || session.user.email || "Cliente";
  const authorEmail = session.user.email ?? "";

  const { data: ticket, error } = await admin
    .from("support_tickets")
    .insert({
      org_id: session.profile?.org_id ?? null,
      author_id: session.user.id,
      author_name: authorName,
      author_email: authorEmail,
      subject: subject || "Sem assunto",
      message,
      status: "open",
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Não foi possível registrar o chamado." },
      { status: 500 }
    );
  }

  await sendOwnerEmail({
    subject: `Novo ticket de suporte — ${subject || "Sem assunto"}`,
    html: `
      <h2>Novo ticket de suporte</h2>
      <p><strong>De:</strong> ${authorName} (${authorEmail})</p>
      <p><strong>Assunto:</strong> ${subject || "Sem assunto"}</p>
      <p><strong>Mensagem:</strong></p>
      <blockquote>${message.replace(/\n/g, "<br>")}</blockquote>
      <p>Responda em <a href="${process.env.NEXT_PUBLIC_APP_URL ?? ""}/admin/support">/admin/support</a></p>
    `,
  });

  return NextResponse.json({ ok: true, ticket_id: ticket.id });
}
