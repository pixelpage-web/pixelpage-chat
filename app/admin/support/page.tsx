import { createAdminClient } from "@/lib/supabase/admin";
import { SupportManager } from "@/components/admin/support-manager";
import type { SupportTicketMessageRow } from "@/types/database";

export const dynamic = "force-dynamic";

export const metadata = { title: "Suporte · Admin" };

export default async function AdminSupportPage() {
  const admin = createAdminClient();

  const [{ data: tickets }, { data: orgs }] = await Promise.all([
    admin
      .from("support_tickets")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(200),
    admin.from("organizations").select("id, name"),
  ]);

  // Respostas de todos os tickets carregados
  const ticketIds = (tickets ?? []).map((t) => t.id);
  let messages: SupportTicketMessageRow[] = [];
  if (ticketIds.length > 0) {
    const { data } = await admin
      .from("support_ticket_messages")
      .select("*")
      .in("ticket_id", ticketIds)
      .order("created_at", { ascending: true });
    messages = data ?? [];
  }

  const messagesByTicket: Record<string, SupportTicketMessageRow[]> = {};
  for (const m of messages) {
    (messagesByTicket[m.ticket_id] ??= []).push(m);
  }

  const orgNames: Record<string, string> = {};
  for (const org of orgs ?? []) orgNames[org.id] = org.name;

  return (
    <SupportManager
      initialTickets={tickets ?? []}
      messagesByTicket={messagesByTicket}
      orgNames={orgNames}
    />
  );
}
