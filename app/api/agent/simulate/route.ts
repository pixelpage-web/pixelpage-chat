import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  buildAgentSystemPrompt,
  generateAgentReply,
  matchesHandoffKeyword,
  type ChatTurn,
} from "@/lib/claude";
import { getAgentKnowledge } from "@/lib/knowledge";

interface SimulateBody {
  agent_id?: string;
  history?: ChatTurn[];
  message?: string;
}

/**
 * Simulador de chat do bot: chama a Claude API de verdade com a configuração
 * atual do agente — funciona ANTES do WhatsApp estar conectado.
 * Não consome o saldo de mensagens IA do plano (é ambiente de teste).
 */
export async function POST(request: Request) {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  let body: SimulateBody;
  try {
    body = (await request.json()) as SimulateBody;
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const message = body.message?.trim();
  if (!body.agent_id || !message) {
    return NextResponse.json(
      { error: "agent_id e message são obrigatórios" },
      { status: 400 }
    );
  }

  const supabase = await createServerSupabase();

  // RLS garante que o agente pertence à organização do usuário
  const [{ data: agent }, { data: org }] = await Promise.all([
    supabase.from("agents").select("*").eq("id", body.agent_id).maybeSingle(),
    supabase
      .from("organizations")
      .select("name")
      .eq("id", session.profile.org_id)
      .maybeSingle(),
  ]);

  if (!agent) {
    return NextResponse.json({ error: "Agente não encontrado" }, { status: 404 });
  }

  const [{ data: faqs }, knowledge] = await Promise.all([
    supabase
      .from("agent_faqs")
      .select("question, answer")
      .eq("agent_id", agent.id)
      .order("position", { ascending: true }),
    // O simulador usa a mesma base de conhecimento do bot real
    getAgentKnowledge(supabase, agent.id),
  ]);

  // Handoff: no WhatsApp real isso pausa o bot; no simulador, sinalizamos
  const handoff = matchesHandoffKeyword(message, agent.handoff_keywords);

  const systemPrompt = buildAgentSystemPrompt({
    agent,
    faqs: faqs ?? [],
    orgName: org?.name ?? "sua empresa",
    knowledge,
  });

  const history = Array.isArray(body.history)
    ? body.history
        .filter(
          (t): t is ChatTurn =>
            !!t &&
            (t.role === "user" || t.role === "assistant") &&
            typeof t.content === "string"
        )
        .slice(-20)
    : [];

  const result = await generateAgentReply({
    systemPrompt,
    history,
    userMessage: message,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  // Registra o uso para estimativa de custo no painel admin
  await supabase.from("audit_logs").insert({
    org_id: session.profile.org_id,
    actor_id: session.user.id,
    action: "ai.simulate",
    metadata: {
      model: result.model,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
    },
  });

  return NextResponse.json({
    reply: result.text,
    handoff,
    usage: {
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      model: result.model,
    },
  });
}
