import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

function isSuperadmin(
  session: Awaited<ReturnType<typeof getSessionProfile>>,
  email: string | undefined
): boolean {
  if (!session || !email) return false;
  return (
    session.profile?.role === "superadmin" &&
    session.user.email?.toLowerCase() === email.toLowerCase()
  );
}

/** POST — soft-delete de um ticket de suporte com motivo obrigatório. */
export async function POST(request: Request) {
  const session = await getSessionProfile();
  const superEmail = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();

  if (!isSuperadmin(session, superEmail)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    ticket_id?: string;
    reason?: string;
  } | null;

  if (!body?.ticket_id || !body.reason?.trim()) {
    return NextResponse.json(
      { error: "ticket_id e reason são obrigatórios" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { error } = await admin
    .from("support_tickets")
    .update({ deleted_at: now })
    .eq("id", body.ticket_id)
    .is("deleted_at", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await admin.from("audit_logs").insert({
    org_id: null,
    actor_id: session!.user.id,
    action: "admin.support_ticket.deleted",
    metadata: {
      ticket_id: body.ticket_id,
      reason: body.reason.trim(),
    },
  });

  return NextResponse.json({ ok: true });
}
