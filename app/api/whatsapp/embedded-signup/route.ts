import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { orgHasMetaApi } from "@/lib/plan-features";
import {
  exchangeEmbeddedSignupCode,
  fetchPhoneDisplay,
  subscribeAppToWaba,
  registerPhoneNumber,
} from "@/lib/meta";

interface SignupBody {
  code?: string;
  waba_id?: string;
  phone_number_id?: string;
}

// Códigos de erro da Meta com mensagem amigável ao cliente
const META_ERROR_MESSAGES: Record<number, string> = {
  131031: "Sua conta Business Meta está bloqueada. Resolva isso no Gerenciador de Negócios antes de conectar.",
  200008: "Nenhum número encontrado nessa conta. Verifique se você tem um número WhatsApp Business ativo.",
  80008:  "Muitas tentativas seguidas. Aguarde alguns minutos e tente novamente.",
};

function resolveMetaError(code: number | undefined, technical: string): string {
  if (code === 190) {
    console.error(`[embedded-signup-critical] Token inválido ou expirado (code=190). Investigar META_SYSTEM_USER_TOKEN. technical="${technical}"`);
    return "Erro temporário no nosso sistema. Nossa equipe já foi notificada.";
  }
  if (code !== undefined && META_ERROR_MESSAGES[code]) {
    return META_ERROR_MESSAGES[code]!;
  }
  return technical;
}

export async function POST(request: Request) {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const orgId = session.profile.org_id;

  const hasMetaApi = await orgHasMetaApi(orgId);
  if (!hasMetaApi) {
    return NextResponse.json({ error: "Disponível apenas no plano Pro." }, { status: 403 });
  }

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

  const [{ data: sub }, { count: connectionCount }] = await Promise.all([
    supabase.from("subscriptions").select("plan_id").eq("org_id", orgId).maybeSingle(),
    supabase.from("whatsapp_connections").select("id", { count: "exact", head: true }).eq("org_id", orgId),
  ]);

  let limit: number | null = 1; // null = ilimitado
  if (sub?.plan_id) {
    const { data: plan } = await supabase
      .from("plans")
      .select("connections_limit")
      .eq("id", sub.plan_id)
      .maybeSingle();
    if (plan !== null) limit = plan.connections_limit;
  }
  if (limit !== null && (connectionCount ?? 0) >= limit) {
    return NextResponse.json(
      { error: `Seu plano permite ${limit} conexão(ões) WhatsApp. Faça upgrade para conectar mais números.` },
      { status: 403 }
    );
  }

  // Troca o code e busca dados do número em paralelo (independentes entre si)
  const [exchanged, phoneInfo] = await Promise.all([
    exchangeEmbeddedSignupCode(body.code),
    fetchPhoneDisplay(body.phone_number_id),
  ]);

  // Insere com status 'pending' para obter o ID antes das chamadas à Meta
  const { data: connection, error: insertError } = await supabase
    .from("whatsapp_connections")
    .insert({
      org_id: orgId,
      label: phoneInfo.verifiedName ?? "Principal",
      waba_id: body.waba_id,
      phone_number_id: body.phone_number_id,
      phone_display: phoneInfo.display,
      status: "pending",
    })
    .select("*")
    .single();

  if (insertError || !connection) {
    return NextResponse.json(
      { error: "Não foi possível salvar a conexão. Tente novamente." },
      { status: 500 }
    );
  }

  // 1. Assinar webhooks na WABA (obrigatório para receber mensagens)
  const subscribeResult = await subscribeAppToWaba(body.waba_id);
  console.log(
    `[embedded-signup] subscribed_apps waba=${body.waba_id} ok=${subscribeResult.ok} err=${subscribeResult.error ?? "-"}`
  );

  if (!subscribeResult.ok) {
    const detail = `subscribed_apps: ${subscribeResult.error ?? "erro desconhecido"}`;
    await supabase
      .from("whatsapp_connections")
      .update({ status: "error", error_detail: detail })
      .eq("id", connection.id);
    await supabase.from("audit_logs").insert({
      org_id: orgId,
      actor_id: session.user.id,
      action: "whatsapp.connect_failed",
      metadata: {
        connection_id: connection.id,
        step: "subscribed_apps",
        error: subscribeResult.error,
        code_exchanged: exchanged,
      },
    });
    return NextResponse.json(
      {
        error: resolveMetaError(
          subscribeResult.code,
          `Não foi possível assinar os webhooks na WABA. ${subscribeResult.error ?? ""}`.trim()
        ),
        status: "error",
      },
      { status: 502 }
    );
  }

  // 2. Registrar o número para Cloud API
  const registerResult = await registerPhoneNumber(body.phone_number_id);
  console.log(
    `[embedded-signup] register phone=${body.phone_number_id} ok=${registerResult.ok} err=${registerResult.error ?? "-"}`
  );

  if (!registerResult.ok) {
    const detail = `register: ${registerResult.error ?? "erro desconhecido"}`;
    await supabase
      .from("whatsapp_connections")
      .update({ status: "error", error_detail: detail })
      .eq("id", connection.id);
    await supabase.from("audit_logs").insert({
      org_id: orgId,
      actor_id: session.user.id,
      action: "whatsapp.connect_failed",
      metadata: {
        connection_id: connection.id,
        step: "register",
        error: registerResult.error,
        waba_subscribed: true,
        code_exchanged: exchanged,
      },
    });
    return NextResponse.json(
      {
        error: resolveMetaError(
          registerResult.code,
          `Não foi possível registrar o número para Cloud API. ${registerResult.error ?? ""}`.trim()
        ),
        status: "error",
      },
      { status: 502 }
    );
  }

  // Ambas as chamadas bem-sucedidas — marcar como conectado
  const { data: ready } = await supabase
    .from("whatsapp_connections")
    .update({ status: "connected", connected_at: new Date().toISOString() })
    .eq("id", connection.id)
    .select("*")
    .single();

  await supabase.from("audit_logs").insert({
    org_id: orgId,
    actor_id: session.user.id,
    action: "whatsapp.connected",
    metadata: {
      connection_id: connection.id,
      waba_id: body.waba_id,
      phone_number_id: body.phone_number_id,
      code_exchanged: exchanged,
      waba_subscribed: true,
      phone_registered: true,
    },
  });

  return NextResponse.json({ connection: ready ?? connection });
}
