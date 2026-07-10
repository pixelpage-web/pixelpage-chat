import type { Json } from "@/types/database";

/**
 * Tipos do builder visual de fluxos — compartilhados entre o editor (client),
 * o motor de execução (server) e o simulador.
 * O canvas é persistido em flows.canvas_data como { nodes, edges }.
 */

export type FlowNodeType =
  | "start"
  | "message"
  | "question"
  | "condition"
  | "menu"
  | "ai"
  | "handoff"
  | "tag"
  | "csat"
  | "transfer_unit"
  | "wait"
  | "end";

export type QuestionAnswerType = "text" | "number" | "email" | "date";
export type AiContinueMode = "always" | "await_confirm" | "never";
export type WaitUnit = "minutes" | "hours" | "days";

/** Campos de configuração de cada bloco (data do nó no React Flow). */
export interface FlowNodeData {
  // Enviar mensagem
  text?: string;
  /** Botões de resposta rápida (até 3) — cada um vira um sourceHandle btn-N */
  buttons?: string[];
  // Fazer pergunta
  question?: string;
  variable?: string;
  answerType?: QuestionAnswerType;
  // Condição
  keywords?: string;
  // Menu de opções
  menuTitle?: string;
  options?: string[];
  // IA Responde
  aiInstructions?: string;
  aiContinue?: AiContinueMode;
  // Transferir para humano
  handoffMessage?: string;
  assignTo?: string | null;
  generateSummary?: boolean;
  // Definir etiqueta
  tag?: string;
  // Transferir para unidade
  unitId?: string | null;
  // Aguardar
  waitAmount?: number;
  waitUnit?: WaitUnit;
  // Encerrar conversa
  endMessage?: string;
  [key: string]: unknown;
}

export interface FlowNode {
  id: string;
  type: FlowNodeType;
  position: { x: number; y: number };
  data: FlowNodeData;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface FlowDefinition {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

/** Lê canvas_data (jsonb) com tolerância a dados ausentes/corrompidos. */
export function parseFlowDefinition(value: Json | null | undefined): FlowDefinition {
  const v = (value ?? {}) as { nodes?: unknown; edges?: unknown };
  return {
    nodes: Array.isArray(v.nodes) ? (v.nodes as FlowNode[]) : [],
    edges: Array.isArray(v.edges) ? (v.edges as FlowEdge[]) : [],
  };
}

/** O que o fluxo está esperando do cliente para continuar. */
export type FlowAwaiting =
  | "question"
  | "menu"
  | "buttons"
  | "ai_confirm"
  | "ai_forever"
  | "wait"
  | null;

/** Estado de execução persistido em conversations.flow_state. */
export interface FlowRuntimeState {
  variables: Record<string, string>;
  awaiting: FlowAwaiting;
  /** Tentativas de resposta inválida no nó atual (pergunta/menu) */
  retries: number;
}

export function parseFlowRuntimeState(value: Json | null | undefined): FlowRuntimeState {
  const v = (value ?? {}) as Partial<FlowRuntimeState>;
  return {
    variables:
      v.variables && typeof v.variables === "object" && !Array.isArray(v.variables)
        ? (v.variables as Record<string, string>)
        : {},
    awaiting: (v.awaiting as FlowAwaiting) ?? null,
    retries: typeof v.retries === "number" ? v.retries : 0,
  };
}

// -----------------------------------------------------------------------------
// Validação do fluxo (usada ao publicar e no editor)
// -----------------------------------------------------------------------------

export interface FlowValidationError {
  nodeId: string | null;
  message: string;
}

export function validateFlow(def: FlowDefinition): FlowValidationError[] {
  const errors: FlowValidationError[] = [];
  const starts = def.nodes.filter((n) => n.type === "start");

  if (starts.length === 0) {
    errors.push({ nodeId: null, message: "O fluxo precisa de um bloco Início." });
  }
  if (starts.length > 1) {
    for (const s of starts.slice(1)) {
      errors.push({ nodeId: s.id, message: "Só pode existir um bloco Início por fluxo." });
    }
  }

  // Alcançabilidade a partir do Início (blocos soltos)
  const reachable = new Set<string>();
  if (starts[0]) {
    const queue = [starts[0].id];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (reachable.has(id)) continue;
      reachable.add(id);
      for (const e of def.edges) {
        if (e.source === id && !reachable.has(e.target)) queue.push(e.target);
      }
    }
  }

  const outgoing = (nodeId: string, handle?: string) =>
    def.edges.filter(
      (e) =>
        e.source === nodeId &&
        (handle === undefined || (e.sourceHandle ?? "out") === handle)
    );

  for (const node of def.nodes) {
    const d = node.data ?? {};

    if (starts[0] && !reachable.has(node.id)) {
      errors.push({ nodeId: node.id, message: "Bloco solto — conecte-o ao fluxo." });
    }

    switch (node.type) {
      case "start":
        if (outgoing(node.id).length === 0) {
          errors.push({ nodeId: node.id, message: "Conecte o Início ao primeiro bloco." });
        }
        break;
      case "message":
        if (!d.text?.trim()) {
          errors.push({ nodeId: node.id, message: "Preencha o texto da mensagem." });
        }
        (d.buttons ?? []).forEach((b, i) => {
          if (b.trim() && outgoing(node.id, `btn-${i}`).length === 0) {
            errors.push({
              nodeId: node.id,
              message: `Conecte o botão "${b}" a um bloco.`,
            });
          }
        });
        break;
      case "question":
        if (!d.question?.trim()) {
          errors.push({ nodeId: node.id, message: "Preencha a pergunta." });
        }
        if (!d.variable?.trim()) {
          errors.push({
            nodeId: node.id,
            message: "Defina o nome para salvar a resposta.",
          });
        }
        break;
      case "condition":
        if (!d.keywords?.trim()) {
          errors.push({ nodeId: node.id, message: "Informe as palavras da condição." });
        }
        if (outgoing(node.id, "yes").length === 0 && outgoing(node.id, "no").length === 0) {
          errors.push({
            nodeId: node.id,
            message: "Conecte pelo menos uma saída (Sim/Não) da condição.",
          });
        }
        break;
      case "menu": {
        const opts = (d.options ?? []).filter((o) => o.trim());
        if (opts.length === 0) {
          errors.push({ nodeId: node.id, message: "Adicione pelo menos uma opção ao menu." });
        }
        (d.options ?? []).forEach((o, i) => {
          if (o.trim() && outgoing(node.id, `opt-${i}`).length === 0) {
            errors.push({
              nodeId: node.id,
              message: `Conecte a opção "${o}" a um bloco.`,
            });
          }
        });
        break;
      }
      case "ai":
        if (!d.aiInstructions?.trim()) {
          errors.push({
            nodeId: node.id,
            message: "Explique como a IA deve se comportar neste bloco.",
          });
        }
        break;
      case "transfer_unit":
        if (!d.unitId?.trim()) {
          errors.push({ nodeId: node.id, message: "Escolha a unidade de destino." });
        }
        break;
      case "handoff":
        // mensagem opcional; sem campos obrigatórios
        break;
      case "tag":
        if (!d.tag?.trim()) {
          errors.push({ nodeId: node.id, message: "Informe a etiqueta." });
        }
        break;
      case "wait":
        if (!d.waitAmount || d.waitAmount <= 0) {
          errors.push({ nodeId: node.id, message: "Defina o tempo de espera." });
        }
        break;
      default:
        break;
    }
  }

  return errors;
}
