import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  exchangeEmbeddedSignupCode,
  fetchPhoneDisplay,
  subscribeAppToWaba,
} from "@/lib/meta";

interface SignupBody {
  code?: string;
  waba_id?: string;
  phone_number_id?: string;
}

/**
 * Registra a conexão WhatsApp após o Embedded Signup da Meta.
 * Recebe o code do popup + waba_id/phone_number_id do postMessage.
 */
export async function POST(request: Request) {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const orgId = session.profile.org_id;

  let body: SignupBody;
  try {
    body = (await request.json()) as SignupBody;
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  if (!body.code || !body.waba_id || !body.phone_number_id) {
    return NextResponse.json(
      { error: "Dados incompletos do Embedded Signup (code, waba_id, phone_number_id)" },
      { status: 400 }
    );
  }

  const supabase = await createServerSupabase();

  // Limite de conexões do plano
  const [{ data: sub }, { count: connectionCount }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("plan_id")
      .eq("org_id", orgId)
      .maybeSingle(),
    supabase
      .from("whatsapp_connections")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId),
  ]);

  let limit = 1;
  if (sub?.plan_id) {
    const { data: plan } = await supabase
      .from("plans")
      .select("connections_limit")
      .eq("id", sub.plan_id)
      .maybeSingle();
    limit = plan?.connections_limit ?? 1;
  }
  if ((connectionCount ?? 0) >= limit) {
    return NextResponse.json(
      { error: `Seu plano permite ${limit} conexão(ões) WhatsApp. Faça upgrade para conectar mais números.` },
      { status: 403 }
    );
  }

  // Confirma a autorização na Meta e assina o app nos webhooks da WABA.
  // Falhas aqui não bloqueiam o registro (podem ser refeitas), mas são logadas.
  const [exchanged, subscribed, phoneInfo] = await Promise.all([
    exchangeEmbeddedSignupCode(body.code),
    subscribeAppToWaba(body.waba_id),
    fetchPhoneDisplay(body.phone_number_id),
  ]);

  const { data: connection, error } = await supabase
    .from("whatsapp_connections")
    .insert({
      org_id: orgId,
      label: phoneInfo.verifiedName ?? "Principal",
      waba_id: body.waba_id,
      phone_number_id: body.phone_number_id,
      phone_display: phoneInfo.display,
      status: "connected",
      connected_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error || !connection) {
    return NextResponse.json(
      { error: "Não foi possível salvar a conexão. Tente novamente." },
      { status: 500 }
    );
  }

  await supabase.from("audit_logs").insert({
    org_id: orgId,
    actor_id: session.user.id,
    action: "whatsapp.connected",
    metadata: {
      connection_id: connection.id,
      waba_id: body.waba_id,
      phone_number_id: body.phone_number_id,
      code_exchanged: exchanged,
      app_subscribed: subscribed,
    },
  });

  return NextResponse.json({ connection });
}
