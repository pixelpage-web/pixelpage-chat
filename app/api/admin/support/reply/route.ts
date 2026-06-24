import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Resposta do admin a um ticket de suporte. Registra a mensagem na conversa do
 * ticket e move o status para "answered".
 */
export async function POST(request: Request) {
  const session = await getSessionProfile();
  const role = session?.profile?.role;
  if (role !== "admin" && role !== "superadmin") {
    return NextResponse.json({ error: "Acesso restrito" }, { status: 403 });
  }

  let body: { ticket_id?: string; body?: string };
  try {
    body = (await request.json()) as { ticket_id?: string; body?: string };
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const ticketId = body.ticket_id;
  const text = (body.body ?? "").trim();
  if (!ticketId || text.length < 1) {
    return NextResponse.json({ error: "Resposta vazia." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { error: msgError } = await admin.from("support_ticket_messages").insert({
    ticket_id: ticketId,
    author_id: session!.user.id,
    from_admin: true,
    body: text,
  });
  if (msgError) {
    return NextResponse.json({ error: "Falha ao salvar a resposta." }, { status: 500 });
  }

  await admin
    .from("support_tickets")
    .update({ status: "answered", updated_at: new Date().toISOString() })
    .eq("id", ticketId);

  // TODO(email): notificar o cliente por email quando RESEND estiver ativo.
  return NextResponse.json({ ok: true });
}
