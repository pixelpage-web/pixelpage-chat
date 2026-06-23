import type { FlowDefinition } from "@/lib/flow-types";

/**
 * Galeria de templates do builder de fluxos — blocos pré-montados por nicho.
 * Ao criar um fluxo, o canvas_data inicial vem daqui.
 */

export interface FlowTemplate {
  id: string;
  name: string;
  emoji: string;
  description: string;
  definition: FlowDefinition;
}

export const flowTemplates: FlowTemplate[] = [
  {
    id: "basico",
    name: "Atendimento básico",
    emoji: "💬",
    description: "Menu de boas-vindas com transferência para sua equipe.",
    definition: {
      nodes: [
        { id: "start", type: "start", position: { x: 0, y: 180 }, data: {} },
        {
          id: "menu",
          type: "menu",
          position: { x: 280, y: 140 },
          data: {
            menuTitle: "Olá, {nome}! 👋 Como podemos ajudar?",
            options: [
              "Falar com um atendente",
              "Saber mais sobre nossos serviços",
              "Outro assunto",
            ],
          },
        },
        {
          id: "servicos",
          type: "message",
          position: { x: 620, y: 20 },
          data: {
            text: "Claro! Trabalhamos com [descreva aqui seus serviços]. Quer falar com alguém da equipe para saber mais?",
          },
        },
        {
          id: "handoff",
          type: "handoff",
          position: { x: 960, y: 180 },
          data: {
            handoffMessage: "Vou te conectar com um atendente. Um momento! 👋",
            generateSummary: true,
          },
        },
      ],
      edges: [
        { id: "e1", source: "start", target: "menu", sourceHandle: "out" },
        { id: "e2", source: "menu", target: "handoff", sourceHandle: "opt-0" },
        { id: "e3", source: "menu", target: "servicos", sourceHandle: "opt-1" },
        { id: "e4", source: "menu", target: "handoff", sourceHandle: "opt-2" },
        { id: "e5", source: "servicos", target: "handoff", sourceHandle: "out" },
      ],
    },
  },
  {
    id: "clinica",
    name: "Clínica / Consultório",
    emoji: "🩺",
    description: "Boas-vindas, agendamento guiado por perguntas e pesquisa CSAT.",
    definition: {
      nodes: [
        { id: "start", type: "start", position: { x: 0, y: 220 }, data: {} },
        {
          id: "welcome",
          type: "message",
          position: { x: 260, y: 200 },
          data: {
            text: "Olá, {nome}! 😊 Bem-vindo(a) à nossa clínica. Estou aqui para ajudar com agendamentos e dúvidas.",
          },
        },
        {
          id: "menu",
          type: "menu",
          position: { x: 560, y: 180 },
          data: {
            menuTitle: "O que você precisa hoje?",
            options: ["Agendar consulta", "Tirar dúvidas", "Falar com a recepção"],
          },
        },
        {
          id: "q-nome",
          type: "question",
          position: { x: 900, y: 0 },
          data: {
            question: "Perfeito! Para agendar, qual é o seu nome completo?",
            variable: "nome_paciente",
            answerType: "text",
          },
        },
        {
          id: "q-data",
          type: "question",
          position: { x: 1200, y: 0 },
          data: {
            question: "Qual a melhor data para você? (ex.: 15/07)",
            variable: "data_consulta",
            answerType: "date",
          },
        },
        {
          id: "q-procedimento",
          type: "question",
          position: { x: 1500, y: 0 },
          data: {
            question: "Qual procedimento ou especialidade você procura?",
            variable: "procedimento",
            answerType: "text",
          },
        },
        {
          id: "confirma",
          type: "message",
          position: { x: 1800, y: 0 },
          data: {
            text: "Anotado, {nome_paciente}! Pedido de agendamento para {data_consulta} ({procedimento}). Nossa equipe vai confirmar em instantes. 🗓️",
          },
        },
        { id: "csat", type: "csat", position: { x: 2100, y: 60 }, data: {} },
        {
          id: "duvidas",
          type: "ai",
          position: { x: 900, y: 260 },
          data: {
            aiInstructions:
              "Responda dúvidas sobre horários, valores e procedimentos da clínica. Seja simpático. Se o cliente quiser agendar, peça nome, data e procedimento desejado.",
            aiContinue: "await_confirm",
          },
        },
        {
          id: "handoff",
          type: "handoff",
          position: { x: 1200, y: 360 },
          data: {
            handoffMessage: "Vou te passar para a recepção. Um momento! 👋",
            generateSummary: true,
          },
        },
      ],
      edges: [
        { id: "e1", source: "start", target: "welcome", sourceHandle: "out" },
        { id: "e2", source: "welcome", target: "menu", sourceHandle: "out" },
        { id: "e3", source: "menu", target: "q-nome", sourceHandle: "opt-0" },
        { id: "e4", source: "menu", target: "duvidas", sourceHandle: "opt-1" },
        { id: "e5", source: "menu", target: "handoff", sourceHandle: "opt-2" },
        { id: "e6", source: "q-nome", target: "q-data", sourceHandle: "out" },
        { id: "e7", source: "q-data", target: "q-procedimento", sourceHandle: "out" },
        { id: "e8", source: "q-procedimento", target: "confirma", sourceHandle: "out" },
        { id: "e9", source: "confirma", target: "csat", sourceHandle: "out" },
        { id: "e10", source: "duvidas", target: "handoff", sourceHandle: "out" },
      ],
    },
  },
  {
    id: "loja",
    name: "Loja / E-commerce",
    emoji: "🛍️",
    description: "Menu de atendimento com IA respondendo dúvidas de produtos.",
    definition: {
      nodes: [
        { id: "start", type: "start", position: { x: 0, y: 160 }, data: {} },
        {
          id: "menu",
          type: "menu",
          position: { x: 280, y: 120 },
          data: {
            menuTitle: "Olá, {nome}! 🛍️ Como podemos ajudar?",
            options: ["Dúvidas sobre produtos", "Falar com um atendente"],
          },
        },
        {
          id: "ia",
          type: "ai",
          position: { x: 620, y: 40 },
          data: {
            aiInstructions:
              "Responda dúvidas sobre os produtos da loja: preços, tamanhos, prazos de entrega e trocas. Seja simpático e objetivo. Se não souber, sugira falar com um atendente.",
            aiContinue: "await_confirm",
          },
        },
        {
          id: "end",
          type: "end",
          position: { x: 960, y: 40 },
          data: {
            endMessage:
              "Obrigado pelo contato! Se precisar de algo mais, é só chamar. Até mais! 😊",
          },
        },
        {
          id: "handoff",
          type: "handoff",
          position: { x: 620, y: 300 },
          data: {
            handoffMessage: "Vou te conectar com um atendente. Um momento! 👋",
            generateSummary: true,
          },
        },
      ],
      edges: [
        { id: "e1", source: "start", target: "menu", sourceHandle: "out" },
        { id: "e2", source: "menu", target: "ia", sourceHandle: "opt-0" },
        { id: "e3", source: "menu", target: "handoff", sourceHandle: "opt-1" },
        { id: "e4", source: "ia", target: "end", sourceHandle: "out" },
      ],
    },
  },
  {
    id: "restaurante",
    name: "Restaurante",
    emoji: "🍕",
    description: "Envia o cardápio, recebe o pedido e encerra com confirmação.",
    definition: {
      nodes: [
        { id: "start", type: "start", position: { x: 0, y: 160 }, data: {} },
        {
          id: "cardapio",
          type: "message",
          position: { x: 260, y: 140 },
          data: {
            text: "Olá, {nome}! 🍕 Nosso cardápio:\n\n• Pizza tradicional — R$ 45\n• Pizza especial — R$ 62\n• Refrigerante 2L — R$ 12\n\n[Edite com o seu cardápio real]",
          },
        },
        {
          id: "menu",
          type: "menu",
          position: { x: 560, y: 120 },
          data: {
            menuTitle: "O que deseja fazer?",
            options: ["Fazer pedido", "Falar com um atendente"],
          },
        },
        {
          id: "q-pedido",
          type: "question",
          position: { x: 900, y: 20 },
          data: {
            question: "Pode mandar seu pedido! Escreva os itens e o endereço de entrega. 📝",
            variable: "pedido",
            answerType: "text",
          },
        },
        {
          id: "end",
          type: "end",
          position: { x: 1200, y: 20 },
          data: {
            endMessage:
              "Pedido recebido! ✅\n\n{pedido}\n\nJá estamos preparando. Obrigado pela preferência! 😊",
          },
        },
        {
          id: "handoff",
          type: "handoff",
          position: { x: 900, y: 300 },
          data: {
            handoffMessage: "Vou te passar para nossa equipe. Um momento! 👋",
            generateSummary: true,
          },
        },
      ],
      edges: [
        { id: "e1", source: "start", target: "cardapio", sourceHandle: "out" },
        { id: "e2", source: "cardapio", target: "menu", sourceHandle: "out" },
        { id: "e3", source: "menu", target: "q-pedido", sourceHandle: "opt-0" },
        { id: "e4", source: "menu", target: "handoff", sourceHandle: "opt-1" },
        { id: "e5", source: "q-pedido", target: "end", sourceHandle: "out" },
      ],
    },
  },
  {
    id: "imobiliaria",
    name: "Imobiliária",
    emoji: "🏠",
    description: "Qualifica o lead com perguntas e transfere para um corretor.",
    definition: {
      nodes: [
        { id: "start", type: "start", position: { x: 0, y: 120 }, data: {} },
        {
          id: "q-interesse",
          type: "question",
          position: { x: 260, y: 100 },
          data: {
            question:
              "Olá, {nome}! 🏠 Que bom ter você aqui. Você procura imóvel para comprar ou alugar?",
            variable: "interesse",
            answerType: "text",
          },
        },
        {
          id: "q-regiao",
          type: "question",
          position: { x: 560, y: 100 },
          data: {
            question: "Ótimo! Em qual bairro ou região você procura?",
            variable: "regiao",
            answerType: "text",
          },
        },
        {
          id: "q-orcamento",
          type: "question",
          position: { x: 860, y: 100 },
          data: {
            question: "E qual o seu orçamento aproximado?",
            variable: "orcamento",
            answerType: "text",
          },
        },
        {
          id: "tag",
          type: "tag",
          position: { x: 1160, y: 100 },
          data: { tag: "lead-qualificado" },
        },
        {
          id: "handoff",
          type: "handoff",
          position: { x: 1420, y: 100 },
          data: {
            handoffMessage:
              "Perfeito, {nome}! Um corretor vai falar com você em instantes sobre imóveis para {interesse} em {regiao}. 🤝",
            generateSummary: true,
          },
        },
      ],
      edges: [
        { id: "e1", source: "start", target: "q-interesse", sourceHandle: "out" },
        { id: "e2", source: "q-interesse", target: "q-regiao", sourceHandle: "out" },
        { id: "e3", source: "q-regiao", target: "q-orcamento", sourceHandle: "out" },
        { id: "e4", source: "q-orcamento", target: "tag", sourceHandle: "out" },
        { id: "e5", source: "tag", target: "handoff", sourceHandle: "out" },
      ],
    },
  },
  {
    id: "blank",
    name: "Em branco",
    emoji: "✨",
    description: "Comece do zero — só o bloco Início no canvas.",
    definition: {
      nodes: [{ id: "start", type: "start", position: { x: 80, y: 160 }, data: {} }],
      edges: [],
    },
  },
];
