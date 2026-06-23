import { NextResponse, after } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSubscriptionBlocked } from "@/lib/billing";
import { campaignUsageThisMonth, processCampaignBatch } from "@/lib/campaigns";

/**
 * Criação de campanhas (disparos em massa).
 * Respeita o limite mensal do plano (0 = sem acesso, null = ilimitado).
 * "Enviar agora" inicia o primeiro lote via after(); campanhas agendadas e
 * lotes restantes são processados pelo cron /api/campaigns/run.
 */

interface CreateBody {
  name?: string;
  connection_id?: string;
  message_text?: string;
  contact_ids?: string[];
  phones?: string[];
  scheduled_at?: string | null;
}

export async function POST(request: Request) {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (session.profile.role === "agent") {
    return NextResponse.json(
      { error: "Apenas donos e gerentes criam campanhas" },
      { status: 403 }
    );
  }
  const orgId = session.profile.org_id;

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const name = body.name?.trim();
  const messageText = body.message_text?.trim();
  if (!name || !messageText || !body.connection_id) {
    return NextResponse.json(
      { error: "name, connection_id e message_text são obrigatórios" },
      { status: 400 }
    );
  }

  const supabase = await createServerSupabase();

  // Assinatura ativa?
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("status, trial_ends_at, plan_id")
    .eq("org_id", orgId)
    .maybeSingle();
  if (isSubscriptionBlocked(subscription ?? null)) {
    return NextResponse.json(
      { error: "Seu plano expirou — regularize para criar campanhas." },
      { status: 403 }
    );
  }

  // Conexão da org, conectada
  const { data: connection } = await supabase
    .from("whatsapp_connections")
    .select("id, org_id, status")
    .eq("id", body.connection_id)
    .maybeSingle();
  if (!connection || connection.org_id !== orgId) {
    return NextResponse.json({ error: "Conexão não encontrada" }, { status: 404 });
  }
  if (connection.status !== "connected") {
    return NextResponse.json(
      { error: "A conexão precisa estar conectada para disparar campanhas." },
      { status: 400 }
    );
  }

  // Monta a lista de destinatários (contatos selecionados e/ou telefones CSV)
  const phonesSet = new Map<string, string | null>(); // phone -> contact_id
  if (body.contact_ids?.length) {
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, phone, blocked")
      .in("id", body.contact_ids.slice(0, 20000));
    for (const c of contacts ?? []) {
      if (!c.blocked) phonesSet.set(c.phone, c.id);
    }
  }
  for (const raw of body.phones ?? []) {
    const phone = String(raw).replace(/\D/g, "");
    if (phone.length >= 10 && !phonesSet.has(phone)) phonesSet.set(phone, null);
  }

  const recipients = [...phonesSet.entries()];
  if (recipients.length === 0) {
    return NextResponse.json(
      { error: "Nenhum destinatário válido selecionado" },
      { status: 400 }
    );
  }

  // Limite mensal de campanhas do plano
  let campaignsLimit: number | null = 0;
  if (subscription?.plan_id) {
    const { data: plan } = await supabase
      .from("plans")
      .select("campaigns_limit")
      .eq("id", subscription.plan_id)
      .maybeSingle();
    campaignsLimit = plan?.campaigns_limit ?? 0;
  }
  if (campaignsLimit === 0) {
    return NextResponse.json(
      { error: "Seu plano não inclui campanhas — faça upgrade para o Starter ou superior." },
      { status: 403 }
    );
  }
  if (campaignsLimit !== null) {
    const used = await campaignUsageThisMonth(orgId);
    if (used + recipients.length > campaignsLimit) {
      return NextResponse.json(
        {
          error: `Limite do plano: ${campaignsLimit} disparos/mês. Você já usou ${used} e esta campanha tem ${recipients.length}.`,
        },
        { status: 403 }
      );
    }
  }

  const scheduledAt = body.scheduled_at ? new Date(body.scheduled_at) : null;
  const isScheduled =
    scheduledAt !== null &&
    !Number.isNaN(scheduledAt.getTime()) &&
    scheduledAt.getTime() > Date.now() + 60_000;

  // Cria a campanha + destinatários (service role para o insert em lote)
  const admin = createAdminClient();
  const { data: campaign, error } = await admin
    .from("campaigns")
    .insert({
      org_id: orgId,
      connection_id: connection.id,
      name,
      message_text: messageText,
      status: isScheduled ? "scheduled" : "running",
      scheduled_at: isScheduled ? scheduledAt.toISOString() : null,
      total_contacts: recipients.length,
    })
    .select("*")
    .single();
  if (error || !campaign) {
    return NextResponse.json({ error: "Falha ao criar a campanha" }, { status: 500 });
  }

  for (let i = 0; i < recipients.length; i += 500) {
    const chunk = recipients.slice(i, i + 500).map(([phone, contactId]) => ({
      campaign_id: campaign.id,
      contact_id: contactId,
      phone,
    }));
    await admin.from("campaign_contacts").insert(chunk);
  }

  await admin.from("audit_logs").insert({
    org_id: orgId,
    actor_id: session.user.id,
    action: "campaign.created",
    metadata: {
      campaign_id: campaign.id,
      name,
      total: recipients.length,
      scheduled: isScheduled,
    },
  });

  // Envio imediato: processa o primeiro lote após responder
  if (!isScheduled) {
    after(async () => {
      try {
        await processCampaignBatch(campaign.id);
      } catch (err) {
        console.error("[campaigns] erro no primeiro lote:", err);
      }
    });
  }

  return NextResponse.json({ campaign });
}
