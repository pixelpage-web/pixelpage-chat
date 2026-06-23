"use client";

import { ChevronDown, LifeBuoy } from "lucide-react";
import { useT } from "@/lib/i18n";

/**
 * Central de Ajuda — FAQ em acordeão (details/summary nativos, acessível).
 * Conteúdo em português simples, sem jargão técnico.
 */

interface FaqItem {
  question: string;
  answer: string[];
}

const faq: FaqItem[] = [
  {
    question: "Como conectar meu WhatsApp?",
    answer: [
      "Vá em Conexões e escolha um dos dois caminhos:",
      "• QR Code: clique em \"Conectar agora\", abra o WhatsApp no celular em Configurações → Dispositivos conectados → Conectar dispositivo e aponte a câmera para o QR Code. Pronto em segundos, funciona com qualquer número.",
      "• API Oficial Meta: número verificado pela Meta, com templates aprovados e campanhas oficiais. Siga o assistente de conexão (quando disponível).",
      "Depois de conectar, escolha o modo de resposta da conexão: Manual (sua equipe responde), Bot IA (responde sozinho) ou Webhook (encaminha para o seu n8n).",
    ],
  },
  {
    question: "Como criar um fluxo de atendimento?",
    answer: [
      "Vá em Fluxos → Criar novo fluxo e escolha um template pronto para o seu nicho (clínica, loja, restaurante…) ou comece em branco.",
      "No editor, arraste blocos da barra lateral para o canvas e conecte as setas entre eles. Clique num bloco para configurar os campos no painel à direita.",
      "Use o botão Testar para simular a conversa como se você fosse o cliente. Quando estiver satisfeito, clique em Publicar — o fluxo passa a responder as mensagens da conexão escolhida.",
    ],
  },
  {
    question: "Como funcionam os limites de mensagens?",
    answer: [
      "Cada plano inclui uma franquia mensal de mensagens respondidas pela IA (blocos \"IA Responde\" e modo Bot IA). Mensagens manuais da sua equipe e mensagens fixas do fluxo (menus, perguntas, avisos) NÃO consomem a franquia.",
      "Quando a franquia acaba, o bot avisa o cliente que um atendente vai responder e sua equipe assume pelo inbox. O contador zera no início de cada mês.",
      "Você acompanha o consumo em Assinatura e pode fazer upgrade a qualquer momento.",
    ],
  },
  {
    question: "Como convidar minha equipe?",
    answer: [
      "Vá em Configurações → Equipe e clique em Convidar membro. A pessoa recebe um email com o link de acesso.",
      "Papéis: Gerente (gerencia equipe e configurações) e Agente (atende conversas no inbox). O dono da conta tem acesso total, incluindo assinatura e chaves de API.",
    ],
  },
  {
    question: "O que é a pesquisa de satisfação (CSAT)?",
    answer: [
      "É uma mensagem automática enviada ao cliente quando o atendimento é resolvido, pedindo uma nota de 1 a 5.",
      "Para ativar: Conexões → botão CSAT na conexão → ligue a chave, personalize a mensagem e o tempo de espera. Também existe o bloco \"Pesquisa de satisfação\" no builder de fluxos.",
      "As notas aparecem em Relatórios → Satisfação: média geral, evolução no tempo, nota por agente e taxa de resposta.",
    ],
  },
  {
    question: "Bot IA ou Fluxo visual — qual usar?",
    answer: [
      "Bot IA (página Agente IA): a inteligência artificial conversa livremente seguindo suas instruções, FAQ e os conteúdos do \"Ensine sua IA\". Ideal para tirar dúvidas abertas, sem roteiro fixo.",
      "Fluxo visual (página Fluxos): você desenha o caminho exato da conversa com blocos — menus, perguntas, condições e transferência. Ideal para processos com etapas definidas (agendar, fazer pedido, qualificar lead).",
      "Dá para combinar os dois: use o bloco \"IA Responde\" dentro de um fluxo para ter um trecho de conversa livre no meio do roteiro. Importante: um fluxo publicado assume a conexão — ele tem prioridade sobre o modo Bot IA.",
    ],
  },
];

export function HelpView() {
  const t = useT();

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
        <header>
          <h1 className="flex items-center gap-2 font-display text-lg font-semibold">
            <LifeBuoy className="h-5 w-5 text-lime" aria-hidden />
            {t("Central de Ajuda")}
          </h1>
          <p className="mt-0.5 text-sm text-txt-mut">
            {t("Respostas rápidas para as dúvidas mais comuns. Não achou o que precisa? Mande sua pergunta pelo formulário de sugestões na Documentação.")}
          </p>
        </header>

        <div className="space-y-2">
          {faq.map((item) => (
            <details
              key={item.question}
              className="group rounded-lg border border-line bg-surface open:border-lime/30"
            >
              <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                {t(item.question)}
                <ChevronDown
                  className="h-4 w-4 shrink-0 text-txt-dim transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <div className="space-y-2 border-t border-line px-4 py-3">
                {item.answer.map((paragraph, i) => (
                  <p key={i} className="text-xs leading-relaxed text-txt-mut">
                    {t(paragraph)}
                  </p>
                ))}
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
