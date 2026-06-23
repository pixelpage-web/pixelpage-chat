import type {
  FlowDefinition,
  FlowNode,
  FlowRuntimeState,
} from "@/lib/flow-types";

/**
 * Motor de execução de fluxos — núcleo puro, sem banco e sem canal.
 * Recebe a definição do canvas + estado atual + mensagem do cliente e devolve
 * o novo estado e uma lista de EFEITOS. Quem chama decide como aplicar:
 *   - pipeline (WhatsApp real): envia mensagens, atualiza conversa, agenda jobs
 *   - simulador do editor: exibe tudo num chat de teste, sem persistir nada
 */

export type FlowEffect =
  | { type: "send"; text: string }
  | { type: "set_tag"; tag: string }
  | {
      type: "handoff";
      assignTo: string | null;
      generateSummary: boolean;
    }
  | { type: "send_csat" }
  | { type: "wait"; ms: number; resumeNodeId: string }
  | { type: "resolve" };

export interface FlowEngineContext {
  /** Nome do contato para a variável {nome} */
  contactName: string | null;
  /** Gera a resposta do bloco "IA Responde" (Claude API). null em caso de erro. */
  generateAi(params: {
    instructions: string;
    userMessage: string;
  }): Promise<string | null>;
}

export interface FlowStepResult {
  /** Nó atual após o passo (null = fluxo encerrado) */
  nodeId: string | null;
  state: FlowRuntimeState;
  effects: FlowEffect[];
  ended: boolean;
}

// Palavras que confirmam o avanço no modo "Aguarda o cliente confirmar"
const CONFIRM_WORDS = ["sim", "ok", "okay", "pode", "confirmo", "quero", "isso", "claro", "certo", "perfeito", "👍"];

const WAIT_UNIT_MS = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 } as const;

/** Substitui {nome} e {variavel} pelo valor salvo no estado do fluxo. */
export function replaceFlowVariables(
  text: string,
  state: FlowRuntimeState,
  contactName: string | null
): string {
  return text.replace(/\{([\p{L}\p{N}_]+)\}/gu, (full, name: string) => {
    if (name in state.variables) return state.variables[name];
    if (name === "nome") return contactName ?? "cliente";
    return full;
  });
}

function findNode(def: FlowDefinition, id: string | null): FlowNode | null {
  if (!id) return null;
  return def.nodes.find((n) => n.id === id) ?? null;
}

/** Próximo nó a partir de uma saída (handle) específica. */
function nextNodeId(
  def: FlowDefinition,
  nodeId: string,
  handle = "out"
): string | null {
  const edge = def.edges.find(
    (e) => e.source === nodeId && (e.sourceHandle ?? "out") === handle
  );
  return edge?.target ?? null;
}

function validateAnswer(
  type: string | undefined,
  text: string
): boolean {
  const v = text.trim();
  if (!v) return false;
  switch (type) {
    case "number":
      return /^[\d.,\s]+$/.test(v) && /\d/.test(v);
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    case "date":
      // Aceita dd/mm, dd/mm/aaaa, dd-mm-aaaa ou datas por extenso simples
      return /\d{1,2}[\/\-.]\d{1,2}([\/\-.]\d{2,4})?/.test(v);
    default:
      return true;
  }
}

const invalidAnswerMessage: Record<string, string> = {
  number: "Ops, preciso de um número. Pode tentar de novo? 🙏",
  email: "Hmm, esse e-mail não parece válido. Pode conferir e enviar de novo?",
  date: "Não consegui entender a data. Pode enviar no formato dia/mês? (ex.: 15/07)",
  text: "Não entendi. Pode repetir, por favor?",
};

/** Monta o texto do menu (título + opções numeradas). */
function buildMenuText(node: FlowNode, state: FlowRuntimeState, contactName: string | null): string {
  const title = node.data.menuTitle?.trim() || "Escolha uma das opções abaixo:";
  const options = (node.data.options ?? []).filter((o) => o.trim());
  const lines = options.map((o, i) => `${i + 1}. ${o.trim()}`);
  return replaceFlowVariables([title, ...lines].join("\n"), state, contactName);
}

/** Monta o texto da mensagem com botões de resposta rápida numerados. */
function buildMessageWithButtons(
  node: FlowNode,
  state: FlowRuntimeState,
  contactName: string | null
): string {
  const text = replaceFlowVariables(node.data.text ?? "", state, contactName);
  const buttons = (node.data.buttons ?? []).filter((b) => b.trim());
  if (buttons.length === 0) return text;
  const lines = buttons.map((b, i) => `${i + 1}. ${b.trim()}`);
  return [text, "", ...lines].join("\n");
}

/** Interpreta a escolha do cliente entre opções numeradas (número ou texto). */
function matchChoice(text: string, options: string[]): number | null {
  const v = text.trim().toLowerCase();
  // Por número ("2", "2.", "opção 2", emojis de teclado)
  const numMatch = v.match(/^\D*?(\d{1,2})\D*$/);
  if (numMatch) {
    const idx = Number(numMatch[1]) - 1;
    if (idx >= 0 && idx < options.length) return idx;
  }
  // Por texto (igualdade ou contém)
  for (let i = 0; i < options.length; i++) {
    const opt = options[i].trim().toLowerCase();
    if (!opt) continue;
    if (v === opt || v.includes(opt) || opt.includes(v)) return i;
  }
  return null;
}

function matchesKeywords(text: string, keywords: string | undefined): boolean {
  const list = (keywords ?? "")
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
  const v = text.toLowerCase();
  return list.some((k) => v.includes(k));
}

/**
 * Avança o fluxo:
 *   - nodeId null  → começa do bloco Início (primeira mensagem da conversa)
 *   - incomingText null + nodeId → retomada (após o bloco "Aguardar")
 *   - incomingText + nodeId      → mensagem do cliente num fluxo em andamento
 */
export async function advanceFlow(params: {
  def: FlowDefinition;
  nodeId: string | null;
  state: FlowRuntimeState;
  incomingText: string | null;
  ctx: FlowEngineContext;
}): Promise<FlowStepResult> {
  const { def, ctx } = params;
  const state: FlowRuntimeState = {
    variables: { ...params.state.variables },
    awaiting: params.state.awaiting,
    retries: params.state.retries,
  };
  const effects: FlowEffect[] = [];
  const incoming = params.incomingText?.trim() ?? null;
  if (incoming) state.variables["ultima_mensagem"] = incoming;

  const send = (text: string) => {
    const final = replaceFlowVariables(text, state, ctx.contactName).trim();
    if (final) effects.push({ type: "send", text: final });
  };

  const finish = (nodeId: string | null, ended: boolean): FlowStepResult => ({
    nodeId,
    state,
    effects,
    ended,
  });

  let current: FlowNode | null;

  // ---------------------------------------------------------------------------
  // 1. Resolve o ponto de entrada
  // ---------------------------------------------------------------------------
  if (!params.nodeId) {
    // Começo do fluxo: do Início para o primeiro bloco
    const start = def.nodes.find((n) => n.type === "start");
    if (!start) return finish(null, true);
    current = findNode(def, nextNodeId(def, start.id));
    state.awaiting = null;
    state.retries = 0;
  } else if (incoming === null) {
    // Retomada após "Aguardar": executa o nó indicado diretamente
    current = findNode(def, params.nodeId);
    state.awaiting = null;
    state.retries = 0;
  } else {
    // Mensagem do cliente com fluxo em andamento: resolve o nó que aguardava
    const waitingNode = findNode(def, params.nodeId);
    if (!waitingNode) return finish(null, true);

    switch (state.awaiting) {
      case "question": {
        const ok = validateAnswer(waitingNode.data.answerType, incoming);
        if (!ok) {
          state.retries += 1;
          send(invalidAnswerMessage[waitingNode.data.answerType ?? "text"]);
          return finish(waitingNode.id, false);
        }
        const variable = waitingNode.data.variable?.trim();
        if (variable) state.variables[variable] = incoming;
        state.awaiting = null;
        state.retries = 0;
        current = findNode(def, nextNodeId(def, waitingNode.id));
        break;
      }
      case "menu": {
        const options = (waitingNode.data.options ?? []).filter((o) => o.trim());
        const idx = matchChoice(incoming, options);
        if (idx === null) {
          state.retries += 1;
          send("Não entendi. 😅 Responda com o número de uma das opções, por favor.");
          if (state.retries >= 2) send(buildMenuText(waitingNode, state, ctx.contactName));
          return finish(waitingNode.id, false);
        }
        state.awaiting = null;
        state.retries = 0;
        current = findNode(def, nextNodeId(def, waitingNode.id, `opt-${idx}`));
        break;
      }
      case "buttons": {
        const buttons = (waitingNode.data.buttons ?? []).filter((b) => b.trim());
        const idx = matchChoice(incoming, buttons);
        if (idx !== null) {
          state.awaiting = null;
          state.retries = 0;
          current = findNode(def, nextNodeId(def, waitingNode.id, `btn-${idx}`));
        } else if (nextNodeId(def, waitingNode.id) !== null) {
          // Sem match mas há saída padrão — segue por ela
          state.awaiting = null;
          state.retries = 0;
          current = findNode(def, nextNodeId(def, waitingNode.id));
        } else {
          state.retries += 1;
          send("Escolha uma das opções respondendo com o número. 🙂");
          return finish(waitingNode.id, false);
        }
        break;
      }
      case "ai_confirm": {
        const lower = incoming.toLowerCase();
        const confirmed = CONFIRM_WORDS.some((w) => lower === w || lower.startsWith(`${w} `) || lower.includes(` ${w}`));
        if (confirmed) {
          state.awaiting = null;
          current = findNode(def, nextNodeId(def, waitingNode.id));
        } else {
          const reply = await ctx.generateAi({
            instructions: waitingNode.data.aiInstructions ?? "",
            userMessage: incoming,
          });
          if (reply) send(reply);
          return finish(waitingNode.id, false);
        }
        break;
      }
      case "ai_forever": {
        const reply = await ctx.generateAi({
          instructions: waitingNode.data.aiInstructions ?? "",
          userMessage: incoming,
        });
        if (reply) send(reply);
        return finish(waitingNode.id, false);
      }
      case "wait":
        // Cliente escreveu durante a espera — o fluxo segue pausado até o job
        return finish(waitingNode.id, false);
      default:
        // Estado inconsistente: tenta seguir pela saída padrão
        current = findNode(def, nextNodeId(def, waitingNode.id));
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Executa nós em sequência até bloquear (aguardar cliente/tempo) ou acabar
  // ---------------------------------------------------------------------------
  let guard = 0;
  while (current && guard < 30) {
    guard += 1;
    const node = current;
    const d = node.data ?? {};

    switch (node.type) {
      case "start":
        current = findNode(def, nextNodeId(def, node.id));
        break;

      case "message": {
        const buttons = (d.buttons ?? []).filter((b) => b.trim());
        send(buildMessageWithButtons(node, state, ctx.contactName));
        if (buttons.length > 0) {
          state.awaiting = "buttons";
          state.retries = 0;
          return finish(node.id, false);
        }
        current = findNode(def, nextNodeId(def, node.id));
        break;
      }

      case "question":
        send(d.question ?? "");
        state.awaiting = "question";
        state.retries = 0;
        return finish(node.id, false);

      case "condition": {
        const sample = incoming ?? state.variables["ultima_mensagem"] ?? "";
        const handle = matchesKeywords(sample, d.keywords) ? "yes" : "no";
        current = findNode(def, nextNodeId(def, node.id, handle));
        break;
      }

      case "menu":
        send(buildMenuText(node, state, ctx.contactName));
        state.awaiting = "menu";
        state.retries = 0;
        return finish(node.id, false);

      case "ai": {
        const reply = await ctx.generateAi({
          instructions: d.aiInstructions ?? "",
          userMessage: incoming ?? state.variables["ultima_mensagem"] ?? "Olá",
        });
        if (reply) send(reply);
        const mode = d.aiContinue ?? "always";
        if (mode === "always") {
          current = findNode(def, nextNodeId(def, node.id));
        } else {
          state.awaiting = mode === "await_confirm" ? "ai_confirm" : "ai_forever";
          state.retries = 0;
          return finish(node.id, false);
        }
        break;
      }

      case "handoff":
        if (d.handoffMessage?.trim()) send(d.handoffMessage);
        effects.push({
          type: "handoff",
          assignTo: d.assignTo?.trim() ? d.assignTo : null,
          generateSummary: d.generateSummary !== false,
        });
        return finish(null, true);

      case "tag":
        if (d.tag?.trim()) effects.push({ type: "set_tag", tag: d.tag.trim() });
        current = findNode(def, nextNodeId(def, node.id));
        break;

      case "csat":
        effects.push({ type: "send_csat" });
        current = findNode(def, nextNodeId(def, node.id));
        break;

      case "wait": {
        const amount = Math.max(d.waitAmount ?? 0, 0);
        const unit = d.waitUnit ?? "minutes";
        const resume = nextNodeId(def, node.id);
        if (!resume || amount <= 0) {
          current = findNode(def, resume);
          break;
        }
        effects.push({ type: "wait", ms: amount * WAIT_UNIT_MS[unit], resumeNodeId: resume });
        state.awaiting = "wait";
        return finish(node.id, false);
      }

      case "end":
        if (d.endMessage?.trim()) send(d.endMessage);
        effects.push({ type: "resolve" });
        return finish(null, true);

      default:
        current = findNode(def, nextNodeId(def, node.id));
        break;
    }
  }

  // Sem próximo nó (ou loop interrompido) → fluxo encerra silenciosamente
  return finish(null, true);
}
