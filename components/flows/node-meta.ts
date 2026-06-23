import {
  Clock,
  GitBranch,
  HelpCircle,
  ListOrdered,
  MessageCircle,
  Sparkles,
  Star,
  Tag,
  User,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { FlowNodeType } from "@/lib/flow-types";

/**
 * Metadados visuais de cada bloco do builder (ícone, cor, descrição).
 * Cores seguem o spec do produto, adaptadas ao tema escuro do painel.
 */

export interface NodeMeta {
  type: FlowNodeType;
  label: string;
  icon: LucideIcon;
  /** Cor do acento (borda esquerda, ícone) */
  accent: string;
  /** Fundo suave do cabeçalho do nó */
  soft: string;
  description: string;
  /** Aparece na paleta para arrastar? (Início não — já vem no canvas) */
  inPalette: boolean;
}

export const nodeMeta: Record<FlowNodeType, NodeMeta> = {
  start: {
    type: "start",
    label: "Início",
    icon: Zap,
    accent: "#15803D",
    soft: "rgba(21, 128, 61, 0.18)",
    description: "Ponto de entrada do fluxo. Só pode existir um.",
    inPalette: false,
  },
  message: {
    type: "message",
    label: "Enviar mensagem",
    icon: MessageCircle,
    accent: "#3B82F6",
    soft: "rgba(59, 130, 246, 0.15)",
    description: "O bot envia um texto (com botões opcionais).",
    inPalette: true,
  },
  question: {
    type: "question",
    label: "Fazer pergunta",
    icon: HelpCircle,
    accent: "#A855F7",
    soft: "rgba(168, 85, 247, 0.15)",
    description: "Pergunta e guarda a resposta numa variável.",
    inPalette: true,
  },
  condition: {
    type: "condition",
    label: "Condição",
    icon: GitBranch,
    accent: "#F97316",
    soft: "rgba(249, 115, 22, 0.15)",
    description:
      "Divide o fluxo em dois caminhos. O bot segue um caminho ou outro dependendo do que o cliente escrever.",
    inPalette: true,
  },
  menu: {
    type: "menu",
    label: "Menu de opções",
    icon: ListOrdered,
    accent: "#EAB308",
    soft: "rgba(234, 179, 8, 0.15)",
    description: "O cliente escolhe digitando o número ou clicando na opção.",
    inPalette: true,
  },
  ai: {
    type: "ai",
    label: "IA Responde",
    icon: Sparkles,
    accent: "#FF5C00",
    soft: "rgba(255, 92, 0, 0.15)",
    description: "A IA responde com base nas suas instruções.",
    inPalette: true,
  },
  handoff: {
    type: "handoff",
    label: "Transferir para humano",
    icon: User,
    accent: "#EF4444",
    soft: "rgba(239, 68, 68, 0.15)",
    description: "Pausa o bot e passa a conversa para sua equipe.",
    inPalette: true,
  },
  tag: {
    type: "tag",
    label: "Definir etiqueta",
    icon: Tag,
    accent: "#EC4899",
    soft: "rgba(236, 72, 153, 0.15)",
    description: "Marca esta conversa com uma etiqueta para filtrar depois no inbox.",
    inPalette: true,
  },
  csat: {
    type: "csat",
    label: "Pesquisa de satisfação",
    icon: Star,
    accent: "#4ADE80",
    soft: "rgba(74, 222, 128, 0.15)",
    description:
      "Envia automaticamente uma mensagem pedindo que o cliente avalie o atendimento de 1 a 5. As notas aparecem nos relatórios.",
    inPalette: true,
  },
  wait: {
    type: "wait",
    label: "Aguardar",
    icon: Clock,
    accent: "#94A3B8",
    soft: "rgba(148, 163, 184, 0.15)",
    description:
      "O fluxo pausa aqui e continua depois do tempo definido. Útil para enviar follow-up automático.",
    inPalette: true,
  },
  end: {
    type: "end",
    label: "Encerrar conversa",
    icon: X,
    accent: "#475569",
    soft: "rgba(71, 85, 105, 0.25)",
    description: "Envia a mensagem final e marca a conversa como resolvida.",
    inPalette: true,
  },
};

export const paletteOrder: FlowNodeType[] = [
  "message",
  "question",
  "condition",
  "menu",
  "ai",
  "handoff",
  "tag",
  "csat",
  "wait",
  "end",
];
