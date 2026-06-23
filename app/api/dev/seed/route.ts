import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import type { MessageType, SenderType } from "@/types/database";

/**
 * Seed de dados de exemplo para desenvolvimento (Fase 3 — inbox).
 * Habilitado apenas com DEV_SEED_ENABLED=true e fora de produção.
 */

interface SeedMessage {
  minutesAgo: number;
  direction: "inbound" | "outbound";
  sender: SenderType;
  type?: MessageType;
  text: string;
}

interface SeedConversation {
  contact: { name: string; phone: string; tags: string[]; notes: string };
  status: "open" | "resolved";
  botPaused: boolean;
  messages: SeedMessage[];
}

const demoData: SeedConversation[] = [
  {
    contact: {
      name: "Mariana Costa",
      phone: "5511998765432",
      tags: ["cliente-vip", "pedido"],
      notes: "Prefere atendimento pela manhã. Cliente desde 2024.",
    },
    status: "open",
    botPaused: false,
    messages: [
      { minutesAgo: 95, direction: "inbound", sender: "contact", text: "Oi! Vocês têm o vestido midi floral no tamanho M?" },
      { minutesAgo: 93, direction: "outbound", sender: "ai_bot", text: "Olá, Mariana! 😊 Temos sim! O vestido midi floral está disponível em M por R$ 189,90. Quer que eu separe uma unidade para você?" },
      { minutesAgo: 90, direction: "inbound", sender: "contact", text: "Quero sim! Consigo retirar hoje na loja?" },
      { minutesAgo: 88, direction: "outbound", sender: "ai_bot", text: "Perfeito! Separei o vestido no seu nome. Pode retirar hoje até as 19h na loja do Shopping Vila Nova. Algo mais?" },
      { minutesAgo: 12, direction: "inbound", sender: "contact", text: "Vocês aceitam Pix na retirada?" },
    ],
  },
  {
    contact: {
      name: "Carlos Mendes",
      phone: "5521987654321",
      tags: ["orcamento"],
      notes: "",
    },
    status: "open",
    botPaused: true,
    messages: [
      { minutesAgo: 240, direction: "inbound", sender: "contact", text: "Bom dia, preciso de um orçamento para 50 camisetas personalizadas para um evento corporativo." },
      { minutesAgo: 235, direction: "outbound", sender: "ai_bot", text: "Bom dia, Carlos! Que legal! Para um orçamento certinho, me conta: qual o prazo do evento e você já tem a arte pronta?" },
      { minutesAgo: 230, direction: "inbound", sender: "contact", text: "Evento dia 28. Tenho a arte sim. Mas prefiro falar com uma pessoa, pode ser?" },
      { minutesAgo: 225, direction: "outbound", sender: "human", text: "Oi Carlos, aqui é o Rafael do comercial! Claro, assumo daqui. Me manda a arte por aqui mesmo que monto o orçamento ainda hoje." },
      { minutesAgo: 220, direction: "inbound", sender: "contact", type: "document", text: "arte-camisetas-evento.pdf" },
      { minutesAgo: 30, direction: "inbound", sender: "contact", text: "Rafael, conseguiu ver a arte? Preciso fechar até amanhã." },
    ],
  },
  {
    contact: {
      name: "Fernanda Lima",
      phone: "5531976543210",
      tags: ["suporte"],
      notes: "Pedido #4821 — problema na entrega resolvido em 09/06.",
    },
    status: "resolved",
    botPaused: false,
    messages: [
      { minutesAgo: 2880, direction: "inbound", sender: "contact", text: "Meu pedido #4821 era pra ter chegado ontem e nada até agora 😤" },
      { minutesAgo: 2875, direction: "outbound", sender: "external", text: "Oi, Fernanda! Verifiquei aqui: seu pedido saiu para entrega hoje e chega até as 18h. O atraso foi da transportadora, e por isso seu frete será estornado. Peço desculpas pelo transtorno!" },
      { minutesAgo: 2400, direction: "inbound", sender: "contact", text: "Chegou aqui! Obrigada pela atenção 💚" },
      { minutesAgo: 2395, direction: "outbound", sender: "external", text: "Que ótimo, Fernanda! Qualquer coisa é só chamar. Boa semana! 😊" },
    ],
  },
  {
    contact: {
      name: "Pizzaria Forno a Lenha",
      phone: "5541965432109",
      tags: ["fornecedor"],
      notes: "",
    },
    status: "open",
    botPaused: false,
    messages: [
      { minutesAgo: 60, direction: "inbound", sender: "contact", type: "image", text: "tabela-precos-junho.jpg" },
      { minutesAgo: 58, direction: "inbound", sender: "contact", text: "Segue a tabela atualizada de junho. Os valores valem até o fim do mês." },
    ],
  },
];

export async function POST() {
  if (
    process.env.DEV_SEED_ENABLED !== "true" ||
    process.env.NODE_ENV === "production"
  ) {
    return NextResponse.json({ error: "Seed desabilitado" }, { status: 403 });
  }

  const session = await getSessionProfile();
  if (!session?.profile?.org_id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const orgId = session.profile.org_id;

  const supabase = await createServerSupabase();

  // Idempotência simples: não duplica se já existem conversas
  const { count } = await supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "Sua organização já tem conversas — seed ignorado." },
      { status: 409 }
    );
  }

  // Conexão de demonstração (sem WhatsApp real)
  const { data: connection, error: connError } = await supabase
    .from("whatsapp_connections")
    .insert({
      org_id: orgId,
      label: "Demonstração",
      phone_display: "+55 11 4002-8922",
      mode: "ai_bot",
      status: "pending",
    })
    .select("id")
    .single();
  if (connError || !connection) {
    return NextResponse.json(
      { error: "Falha ao criar a conexão de demonstração." },
      { status: 500 }
    );
  }

  const now = Date.now();

  for (const item of demoData) {
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .insert({
        org_id: orgId,
        phone: item.contact.phone,
        name: item.contact.name,
        notes: item.contact.notes,
        tags: item.contact.tags,
      })
      .select("id")
      .single();
    if (contactError || !contact) continue;

    const { data: conversation, error: convCreateError } = await supabase
      .from("conversations")
      .insert({
        org_id: orgId,
        connection_id: connection.id,
        contact_id: contact.id,
        status: "open",
        bot_paused: item.botPaused,
      })
      .select("id")
      .single();
    if (convCreateError || !conversation) continue;

    // Mensagens em ordem cronológica (o trigger atualiza a conversa)
    for (const msg of item.messages) {
      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        direction: msg.direction,
        sender_type: msg.sender,
        content: msg.text,
        message_type: msg.type ?? "text",
        created_at: new Date(now - msg.minutesAgo * 60_000).toISOString(),
      });
    }

    // Ajusta o estado final (status/contagem) após o trigger ter rodado
    const unread = item.status === "resolved" ? 0 : undefined;
    await supabase
      .from("conversations")
      .update({
        status: item.status,
        ...(unread !== undefined ? { unread_count: unread } : {}),
      })
      .eq("id", conversation.id);
  }

  return NextResponse.json({ ok: true });
}
