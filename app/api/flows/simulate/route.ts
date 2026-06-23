import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { advanceFlow, type FlowEffect } from "@/lib/flow-engine";
import {
  parseFlowDefinition,
  parseFlowRuntimeState,
  type FlowRuntimeState,
} from "@/lib/flow-types";
import { generateAgentReply } from "@/lib/claude";
import { getAgentKnowledge } from "@/lib/knowledge";
import { DEFAULT_CSAT_MESSAGE } from "@/lib/csat";
import type { Json } from "@/types/database";

/**
 * Simulador do builder de fluxos: executa o fluxo do canvas em memória,
 * sem salvar nada no inbox. Blocos "IA Responde" usam a Claude API real.
 * O bloco "Aguardar" é pulado na hora (com um evento informativo).
 */

interface SimulateBody {
  canvas?: Json;
  node_id?: string | null;
  state?: Json | null;
  message?: string | null;
}

export interface FlowSimEvent {
  kind: "bot" | "event";
  text: string;
}

export async function POST(request: Request) {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const orgId = session.profile.org_id;

  let body: SimulateBody;
  try {
    body = (await request.json()) as SimulateBody;
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const def = parseFlowDefinition(body.canvas ?? null);
  if (def.nodes.length === 0) {
    return NextResponse.json({ error: "Fluxo vazio" }, { status: 400 });
  }

  const supabase = await createServerSupabase();

  // IA dos blocos "IA Responde" — agente da organização + base de conhecimento
  const [{ data: agents }, { data: org }] = await Promise.all([
    supabase
      .from("agents")
      .select("id, name")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true })
      .limit(1),
    supabase.from("organizations").select("name").eq("id", orgId).maybeSingle(),
  ]);
  const agent = agents?.[0] ?? null;
  const knowledge = agent ? await getAgentKnowledge(supabase, agent.id) : [];
  const aiHistory: { role: "user" | "assistant"; content: string }[] = [];

  const generateAi = async (params: { instructions: string; userMessage: string }) => {
    const knowledgeBlock =
      knowledge.length > 0
        ? `\n\n## Base de conhecimento da empresa (use como fonte de verdade)\n${knowledge
            .map((k) => `### Fonte: ${k.name}\n${k.content}`)
            .join("\n\n")}`
        : "";
    const systemPrompt = [
      `Você é ${agent?.name || "o assistente virtual"}, atendente de "${org?.name ?? "sua empresa"}" no WhatsApp.`,
      `## Sua tarefa neste momento da conversa\n${params.instructions.trim() || "Responda a dúvida do cliente com educação."}`,
      "## Regras",
      "- Responda SEMPRE em português brasileiro.",
      "- Mensagens curtas e diretas, adequadas ao WhatsApp.",
      "- Nunca invente preços, prazos ou políticas." + knowledgeBlock,
    ].join("\n\n");

    const result = await generateAgentReply({
      systemPrompt,
      history: aiHistory.slice(-10),
      userMessage: params.userMessage,
    });
    if (!result.ok) return `⚠️ ${result.error}`;
    aiHistory.push({ role: "user", content: params.userMessage });
    aiHistory.push({ role: "assistant", content: result.text });
    // Registro para estimativa de custo (mesmo padrão do simulador do agente)
    await supabase.from("audit_logs").insert({
      org_id: orgId,
      actor_id: session.user.id,
      action: "ai.simulate",
      metadata: {
        model: result.model,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
        source: "flow_simulator",
      },
    });
    return result.text;
  };

  const events: FlowSimEvent[] = [];
  const pushEffects = (effects: FlowEffect[]) => {
    for (const effect of effects) {
      switch (effect.type) {
        case "send":
          events.push({ kind: "bot", text: effect.text });
          break;
        case "set_tag":
          events.push({ kind: "event", text: `🏷️ Etiqueta aplicada: ${effect.tag}` });
          break;
        case "handoff":
          events.push({
            kind: "event",
            text: "👤 Conversa transferida para atendimento humano. O bot pausaria aqui.",
          });
          break;
        case "send_csat":
          events.push({ kind: "bot", text: DEFAULT_CSAT_MESSAGE });
          events.push({ kind: "event", text: "⭐ Pesquisa de satisfação enviada." });
          break;
        case "resolve":
          events.push({ kind: "event", text: "✅ Conversa marcada como resolvida." });
          break;
        case "wait":
          // tratado no loop abaixo (avanço imediato no simulador)
          break;
      }
    }
  };

  let nodeId = body.node_id ?? null;
  let state: FlowRuntimeState = body.state
    ? parseFlowRuntimeState(body.state)
    : { variables: {}, awaiting: null, retries: 0 };
  let incoming = body.message?.trim() || null;
  let ended = false;

  // Executa, pulando os blocos "Aguardar" imediatamente (com aviso)
  for (let i = 0; i < 6; i++) {
    const result = await advanceFlow({
      def,
      nodeId,
      state,
      incomingText: incoming,
      ctx: { contactName: "Cliente Teste", generateAi },
    });
    pushEffects(result.effects);
    nodeId = result.nodeId;
    state = result.state;
    ended = result.ended;

    const waitEffect = result.effects.find((e) => e.type === "wait");
    if (waitEffect && waitEffect.type === "wait" && !ended) {
      const mins = Math.round(waitEffect.ms / 60_000);
      events.push({
        kind: "event",
        text: `⏳ No WhatsApp real, o fluxo pausaria ${mins >= 60 ? `${Math.round(mins / 60)}h` : `${mins} min`} aqui. No simulador, seguimos direto.`,
      });
      nodeId = waitEffect.resumeNodeId;
      state = { ...state, awaiting: null };
      incoming = null;
      continue;
    }
    break;
  }

  return NextResponse.json({
    events,
    node_id: nodeId,
    state: state as unknown as Json,
    ended,
  });
}
