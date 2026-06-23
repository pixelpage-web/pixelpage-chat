import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createEvolutionInstance,
  deleteEvolutionInstance,
  fetchEvolutionOwner,
  getEvolutionConfig,
  getEvolutionQr,
  getEvolutionState,
  isEvolutionConfigured,
  logoutEvolutionInstance,
} from "@/lib/evolution";

/**
 * Conexão WhatsApp via QR Code (Evolution API).
 * POST { action: 'create' }                         → cria instância + conexão
 * POST { action: 'reconnect', connection_id }       → reativa sessão caída
 * POST { action: 'logout'|'delete', connection_id } → desconecta / exclui
 * GET  ?connection_id=                              → estado + QR ao vivo
 */

function webhookUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const token = process.env.EVOLUTION_WEBHOOK_TOKEN;
  return `${base}/api/webhooks/evolution${token ? `?token=${token}` : ""}`;
}

export async function POST(request: Request) {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const orgId = session.profile.org_id;

  const cfg = await getEvolutionConfig();
  if (!isEvolutionConfigured(cfg)) {
    return NextResponse.json(
      {
        error:
          "Conexão por QR Code ainda não está habilitada nesta plataforma (Evolution API não configurada).",
      },
      { status: 503 }
    );
  }

  let body: { action?: string; connection_id?: string };
  try {
    body = (await request.json()) as { action?: string; connection_id?: string };
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const supabase = await createServerSupabase();

  // ---------------------------------------------------------------- criar
  if (body.action === "create") {
    // Limite de conexões do plano
    const [{ data: sub }, { count }] = await Promise.all([
      supabase.from("subscriptions").select("plan_id").eq("org_id", orgId).maybeSingle(),
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
    if ((count ?? 0) >= limit) {
      return NextResponse.json(
        { error: `Seu plano permite ${limit} conexão(ões). Faça upgrade para conectar mais números.` },
        { status: 403 }
      );
    }

    const instanceName = `zari_${orgId.slice(0, 8)}_${randomBytes(3).toString("hex")}`;
    const created = await createEvolutionInstance(instanceName, webhookUrl());
    if (!created.ok) {
      return NextResponse.json(
        { error: created.error ?? "Falha ao criar a sessão de QR Code." },
        { status: 502 }
      );
    }

    const { data: connection, error } = await supabase
      .from("whatsapp_connections")
      .insert({
        org_id: orgId,
        label: "WhatsApp (QR Code)",
        connection_type: "qr_code",
        evolution_instance_id: instanceName,
        evolution_instance_token: created.token,
        status: "pending",
        mode: "manual",
      })
      .select("id")
      .single();

    if (error || !connection) {
      await deleteEvolutionInstance(instanceName);
      return NextResponse.json(
        { error: "Falha ao registrar a conexão." },
        { status: 500 }
      );
    }

    return NextResponse.json({ connection_id: connection.id });
  }

  // ---------------------------------------------------- ações sobre existente
  if (!body.connection_id) {
    return NextResponse.json({ error: "connection_id é obrigatório" }, { status: 400 });
  }
  const { data: connection } = await supabase
    .from("whatsapp_connections")
    .select("*")
    .eq("id", body.connection_id)
    .maybeSingle();
  if (!connection || connection.org_id !== orgId) {
    return NextResponse.json({ error: "Conexão não encontrada" }, { status: 404 });
  }
  if (connection.connection_type !== "qr_code" || !connection.evolution_instance_id) {
    return NextResponse.json(
      { error: "Esta conexão não é via QR Code" },
      { status: 400 }
    );
  }
  const instance = connection.evolution_instance_id;

  if (body.action === "reconnect") {
    // Sessão caiu: garante a instância viva (recria se foi removida) e
    // volta para 'pending' — o modal de QR assume daqui
    const state = await getEvolutionState(instance);
    if (state === "unknown") {
      await createEvolutionInstance(instance, webhookUrl());
    }
    await supabase
      .from("whatsapp_connections")
      .update({ status: "pending" })
      .eq("id", connection.id);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "logout") {
    await logoutEvolutionInstance(instance);
    await supabase
      .from("whatsapp_connections")
      .update({ status: "disconnected" })
      .eq("id", connection.id);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "delete") {
    await deleteEvolutionInstance(instance);
    const { error } = await supabase
      .from("whatsapp_connections")
      .delete()
      .eq("id", connection.id);
    if (error) {
      return NextResponse.json({ error: "Falha ao excluir a conexão" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Ação desconhecida" }, { status: 400 });
}

// ------------------------------------------------------------------ status/QR
export async function GET(request: Request) {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const connectionId = new URL(request.url).searchParams.get("connection_id");
  if (!connectionId) {
    return NextResponse.json({ error: "connection_id é obrigatório" }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  const { data: connection } = await supabase
    .from("whatsapp_connections")
    .select("*")
    .eq("id", connectionId)
    .maybeSingle();
  if (!connection || connection.org_id !== session.profile.org_id) {
    return NextResponse.json({ error: "Conexão não encontrada" }, { status: 404 });
  }
  if (!connection.evolution_instance_id) {
    return NextResponse.json({ error: "Conexão sem instância QR" }, { status: 400 });
  }

  const state = await getEvolutionState(connection.evolution_instance_id);

  // Conectou: atualiza status + número detectado automaticamente
  if (state === "open" && connection.status !== "connected") {
    const owner = await fetchEvolutionOwner(connection.evolution_instance_id);
    const admin = createAdminClient();
    await admin
      .from("whatsapp_connections")
      .update({
        status: "connected",
        connected_at: new Date().toISOString(),
        phone_display: owner.phone,
        label: owner.profileName ?? connection.label,
      })
      .eq("id", connection.id);
    return NextResponse.json({
      status: "connected",
      qr: null,
      phone_display: owner.phone,
      profile_name: owner.profileName,
    });
  }

  if (state === "open") {
    return NextResponse.json({
      status: "connected",
      qr: null,
      phone_display: connection.phone_display,
    });
  }

  // Ainda não conectado: devolve o QR atual para o modal
  const { qrBase64, pairingCode, error } = await getEvolutionQr(
    connection.evolution_instance_id
  );
  return NextResponse.json({
    status: state === "close" ? "disconnected" : "pending",
    qr: qrBase64,
    pairing_code: pairingCode,
    error,
  });
}
