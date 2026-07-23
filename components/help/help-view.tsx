"use client";

import {
  Bot,
  ChevronDown,
  CreditCard,
  Download,
  Inbox,
  LifeBuoy,
  Lightbulb,
  Plug2,
  Rocket,
  Smartphone,
  Users,
  Workflow,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import { SuggestionForm } from "@/components/suggestion-form";
import { CodeBlock } from "@/components/integrations/code-block";

/**
 * Central de Ajuda — mescla a antiga Documentação (guias expansíveis) com o
 * FAQ em acordeão, numa página só. Guias primeiro, FAQ embaixo.
 * Conteúdo dos guias é bilíngue (PT/EN), mantido junto, fora do dicionário geral.
 */

interface Bi {
  pt: string;
  en: string;
}

interface DocItem {
  term: Bi;
  body: Bi;
}

interface DocSection {
  id: string;
  icon: typeof Inbox;
  title: Bi;
  intro: Bi;
  items: DocItem[];
}

const sections: DocSection[] = [
  {
    id: "primeiros-passos",
    icon: Rocket,
    title: { pt: "Primeiros passos", en: "Getting started" },
    intro: {
      pt: "O caminho recomendado para começar a usar a PixelPage Chat.",
      en: "The recommended path to start using PixelPage Chat.",
    },
    items: [
      {
        term: { pt: "1. Crie sua conta e empresa", en: "1. Create your account and company" },
        body: {
          pt: "Ao se registrar, você preenche seus dados e os da empresa — sua conta já nasce pronta, direto no plano Free (sem cartão, sem prazo). Quando quiser mais recursos, assine o Starter ou o Pro quando quiser. Um modal de boas-vindas mostra os primeiros passos: conectar o WhatsApp, configurar o bot e testar no simulador.",
          en: "When you sign up, you fill in your details and your company's — your account starts ready, straight on the Free plan (no card, no time limit). When you want more features, subscribe to Starter or Pro whenever you like. A welcome modal shows the first steps: connect WhatsApp, set up the bot and test it in the simulator.",
        },
      },
      {
        term: { pt: "2. Configure o Agente IA", en: "2. Set up the AI Agent" },
        body: {
          pt: "Na aba Agente IA, escreva as instruções do seu negócio (o que vende, preços, políticas), escolha o tom de voz e cadastre as perguntas frequentes. Tudo isso vira o 'cérebro' do bot.",
          en: "In the AI Agent tab, write your business instructions (what you sell, prices, policies), pick a tone of voice and add your FAQs. This becomes the bot's 'brain'.",
        },
      },
      {
        term: { pt: "3. Teste no Simulador", en: "3. Test in the Simulator" },
        body: {
          pt: "O simulador conversa com a IA de verdade, sem precisar do WhatsApp conectado e sem consumir o saldo do plano. Escreva como se fosse um cliente e ajuste as instruções até ficar perfeito.",
          en: "The simulator talks to the AI for real, without a connected WhatsApp and without consuming your plan quota. Write as if you were a customer and tweak the instructions until it's perfect.",
        },
      },
      {
        term: { pt: "4. Conecte o WhatsApp", en: "4. Connect WhatsApp" },
        body: {
          pt: "Na aba Conexões, escolha QR Code (qualquer número, pronto em segundos) ou API Oficial Meta (número verificado). A partir daí, cada mensagem dos seus clientes cai no Inbox em tempo real.",
          en: "In the Connections tab, choose QR Code (any number, ready in seconds) or Official Meta API (verified number). From then on, every customer message lands in your Inbox in real time.",
        },
      },
    ],
  },
  {
    id: "inbox",
    icon: Inbox,
    title: { pt: "Inbox (caixa de entrada)", en: "Inbox" },
    intro: {
      pt: "Onde todas as conversas do WhatsApp acontecem, em tempo real.",
      en: "Where all WhatsApp conversations happen, in real time.",
    },
    items: [
      {
        term: { pt: "Filtros: Todas / Abertas / Resolvidas", en: "Filters: All / Open / Resolved" },
        body: {
          pt: "Abertas são conversas aguardando atendimento. Ao clicar em 'Resolver', a conversa vai para Resolvidas — e se o cliente mandar outra mensagem, ela reabre sozinha.",
          en: "Open conversations are waiting for service. Clicking 'Resolve' moves a conversation to Resolved — if the customer writes again, it reopens automatically.",
        },
      },
      {
        term: { pt: "Bolinha verde com número (não lidas)", en: "Green badge with a number (unread)" },
        body: {
          pt: "Mostra quantas mensagens novas chegaram naquela conversa. Ao abrir a conversa, o contador zera automaticamente.",
          en: "Shows how many new messages arrived in that conversation. Opening the conversation clears the counter automatically.",
        },
      },
      {
        term: { pt: "Botão 'Pausar bot'", en: "'Pause bot' button" },
        body: {
          pt: "Pausa o bot SOMENTE naquela conversa, para um humano assumir. O cliente não percebe nada. Clique em 'Retomar bot' quando quiser que ele volte a responder.",
          en: "Pauses the bot ONLY in that conversation so a human can take over. The customer doesn't notice anything. Click 'Resume bot' to let it reply again.",
        },
      },
      {
        term: { pt: "Botão 'Atribuir'", en: "'Assign' button" },
        body: {
          pt: "Define qual membro da equipe é responsável pela conversa. Útil para dividir o atendimento — o nome aparece no topo da conversa.",
          en: "Defines which team member owns the conversation. Useful to split the workload — the name shows at the top of the conversation.",
        },
      },
      {
        term: { pt: "Painel do contato (direita)", en: "Contact panel (right)" },
        body: {
          pt: "Mostra telefone, etiquetas e notas internas do cliente. Etiquetas organizam (ex.: 'vip', 'orçamento'); notas são anotações que só sua equipe vê. Em telas menores, toque no ícone de informações.",
          en: "Shows the customer's phone, tags and internal notes. Tags help organize (e.g. 'vip', 'quote'); notes are visible only to your team. On smaller screens, tap the info icon.",
        },
      },
      {
        term: { pt: "Ícones nas mensagens (quem respondeu)", en: "Message icons (who replied)" },
        body: {
          pt: "Cada resposta mostra quem a enviou: ícone de pessoa para Equipe (humano), ícone de robô para Bot IA, ícone de engrenagem para n8n (automação externa). Assim você sempre sabe o que foi automático e o que foi manual.",
          en: "Each reply shows who sent it: a person icon for Team (human), a bot icon for AI Bot, a gear icon for n8n (external automation). You always know what was automatic vs manual.",
        },
      },
    ],
  },
  {
    id: "agente",
    icon: Bot,
    title: { pt: "Agente IA (o bot)", en: "AI Agent (the bot)" },
    intro: {
      pt: "O robô que responde seus clientes sozinho, com a personalidade que você definir.",
      en: "The robot that replies to your customers on its own, with the personality you define.",
    },
    items: [
      {
        term: { pt: "Instruções / personalidade", en: "Instructions / personality" },
        body: {
          pt: "O texto mais importante: descreva o que sua empresa vende, preços, prazos, políticas e como o bot deve se comportar. O bot NUNCA inventa o que não está aqui ou no FAQ — se não souber, ele oferece chamar um humano.",
          en: "The most important text: describe what your company sells, prices, deadlines, policies and how the bot should behave. The bot NEVER makes up what isn't here or in the FAQ — when unsure, it offers to call a human.",
        },
      },
      {
        term: { pt: "Tom de voz (presets)", en: "Tone of voice (presets)" },
        body: {
          pt: "Vendedor (entusiasmado, conduz à compra), Suporte (paciente, resolve problemas), Formal (polido, sem gírias) ou Casual (leve, próximo). Muda o jeito de escrever do bot inteiro.",
          en: "Sales (enthusiastic, drives purchase), Support (patient, problem-solver), Formal (polite, no slang) or Casual (light, friendly). Changes the bot's whole writing style.",
        },
      },
      {
        term: { pt: "Mensagem de boas-vindas", en: "Welcome message" },
        body: {
          pt: "Enviada automaticamente na PRIMEIRA mensagem de um cliente novo, antes da resposta da IA. Não consome saldo de mensagens IA.",
          en: "Sent automatically on a new customer's FIRST message, before the AI reply. Doesn't consume AI message quota.",
        },
      },
      {
        term: { pt: "Horário de funcionamento + mensagem de ausência", en: "Business hours + away message" },
        body: {
          pt: "Com o horário ativado, fora dele o bot não chama a IA — só envia a mensagem de ausência (ex.: 'respondemos amanhã às 9h'). Os dias e horários usam o fuso de São Paulo.",
          en: "With business hours enabled, outside them the bot doesn't call the AI — it only sends the away message (e.g. 'we reply tomorrow at 9am'). Days and times use the São Paulo timezone.",
        },
      },
      {
        term: { pt: "Palavras-chave de transferência (handoff)", en: "Handoff keywords" },
        body: {
          pt: "Se o cliente escrever uma destas palavras (ex.: 'atendente', 'humano'), o bot avisa que vai transferir, pausa naquela conversa e sua equipe assume pelo Inbox.",
          en: "If the customer types one of these words (e.g. 'agent', 'human'), the bot says it will transfer, pauses in that conversation and your team takes over in the Inbox.",
        },
      },
      {
        term: { pt: "FAQ do bot", en: "Bot FAQ" },
        body: {
          pt: "Perguntas e respostas que o bot usa como fonte de verdade — perfeito para preço, entrega, pagamento, horário. Quanto melhor o FAQ, melhor (e mais barato) o bot.",
          en: "Questions and answers the bot uses as its source of truth — perfect for price, delivery, payment, opening hours. The better the FAQ, the better (and cheaper) the bot.",
        },
      },
      {
        term: { pt: "Simulador", en: "Simulator" },
        body: {
          pt: "Chat de teste que usa a IA de verdade com a configuração atual. Não aparece no Inbox, não envia nada ao WhatsApp e não consome seu saldo. Use à vontade!",
          en: "A test chat using the real AI with your current setup. It doesn't show in the Inbox, doesn't send anything to WhatsApp and doesn't consume your quota. Use it freely!",
        },
      },
    ],
  },
  {
    id: "conexoes",
    icon: Smartphone,
    title: { pt: "Conexões e modos de resposta", en: "Connections and reply modes" },
    intro: {
      pt: "Cada número de WhatsApp conectado tem um modo que define quem responde.",
      en: "Each connected WhatsApp number has a mode that defines who replies.",
    },
    items: [
      {
        term: { pt: "Modo Manual", en: "Manual mode" },
        body: {
          pt: "Nada é automático: as mensagens chegam no Inbox e sua equipe responde. Ideal para começar ou para negócios que exigem atendimento 100% humano.",
          en: "Nothing is automatic: messages arrive in the Inbox and your team replies. Ideal to start out or for businesses that require 100% human service.",
        },
      },
      {
        term: { pt: "Modo Bot IA", en: "AI Bot mode" },
        body: {
          pt: "O bot responde sozinho usando a configuração do Agente IA. Cada resposta consome 1 mensagem do saldo de IA do plano. Você pode pausá-lo por conversa a qualquer momento.",
          en: "The bot replies on its own using the AI Agent setup. Each reply consumes 1 AI message from your plan quota. You can pause it per conversation at any time.",
        },
      },
      {
        term: { pt: "Modo Webhook (n8n)", en: "Webhook (n8n) mode" },
        body: {
          pt: "Cada mensagem recebida é encaminhada para o SEU fluxo no n8n (ferramenta de automação), e o seu fluxo responde pela API da PixelPage Chat. Ilimitado em todos os planos — não consome saldo de IA.",
          en: "Each incoming message is forwarded to YOUR n8n flow (automation tool), and your flow replies through the PixelPage Chat API. Unlimited on all plans — doesn't consume AI quota.",
        },
      },
      {
        term: { pt: "Status da conexão", en: "Connection status" },
        body: {
          pt: "Conectado: recebendo e enviando normalmente. Pendente: conexão criada mas ainda não autorizada na Meta. Desconectado: autorização revogada — reconecte pela aba Conexões.",
          en: "Connected: sending and receiving normally. Pending: connection created but not yet authorized with Meta. Disconnected: authorization revoked — reconnect via the Connections tab.",
        },
      },
    ],
  },
  {
    id: "integracoes",
    icon: Plug2,
    title: { pt: "Integrações (n8n e API)", en: "Integrations (n8n and API)" },
    intro: {
      pt: "Para quem quer automatizar além do bot nativo.",
      en: "For those who want to automate beyond the native bot.",
    },
    items: [
      {
        term: { pt: "URL do webhook", en: "Webhook URL" },
        body: {
          pt: "O endereço do seu fluxo no n8n que recebe cada mensagem (em modo Webhook). Precisa começar com https://. Use o botão 'Enviar evento de teste' para conferir se está tudo certo.",
          en: "Your n8n flow address that receives each message (in Webhook mode). Must start with https://. Use the 'Send test event' button to check everything works.",
        },
      },
      {
        term: { pt: "Secret de assinatura (X-PixelPage-Signature)", en: "Signing secret (X-PixelPage-Signature)" },
        body: {
          pt: "Um código secreto que prova que o aviso veio mesmo da PixelPage Chat (assinatura HMAC SHA-256 do corpo, no header X-PixelPage-Signature). Seu fluxo deve validar esse header antes de confiar nos dados.",
          en: "A secret code proving the notification really came from PixelPage Chat (HMAC SHA-256 signature of the body, in the X-PixelPage-Signature header). Your flow should validate this header before trusting the data.",
        },
      },
      {
        term: { pt: "Log de disparos", en: "Delivery log" },
        body: {
          pt: "Mostra os últimos 20 envios ao seu webhook com status e tempo de resposta. Se falhar 3 vezes seguidas, um alerta vermelho aparece — verifique se o n8n está no ar.",
          en: "Shows the last 20 deliveries to your webhook with status and response time. After 3 consecutive failures a red alert appears — check that your n8n is up.",
        },
      },
      {
        term: { pt: "API keys (pxp_...)", en: "API keys (pxp_...)" },
        body: {
          pt: "Chaves para usar a API pública da PixelPage Chat (enviar mensagens, listar conversas e histórico). A chave aparece UMA única vez ao ser criada — guarde bem. Pode revogar a qualquer momento.",
          en: "Keys to use PixelPage Chat's public API (send messages, list conversations and history). The key is shown ONCE when created — store it safely. You can revoke it anytime.",
        },
      },
    ],
  },
  {
    id: "assinatura",
    icon: CreditCard,
    title: { pt: "Assinatura e limites", en: "Subscription and limits" },
    intro: {
      pt: "Como funcionam os planos, o saldo de IA e o upgrade quando precisar de mais.",
      en: "How plans, AI quota and upgrading when you need more work.",
    },
    items: [
      {
        term: { pt: "O que consome o saldo de mensagens IA?", en: "What consumes the AI message quota?" },
        body: {
          pt: "SOMENTE as respostas do Bot IA no WhatsApp real. Não consomem: modo Manual, modo Webhook/n8n, o Simulador, boas-vindas e mensagem de ausência. O saldo renova todo mês.",
          en: "ONLY AI Bot replies on real WhatsApp. These do NOT consume it: Manual mode, Webhook/n8n mode, the Simulator, welcome and away messages. The quota renews monthly.",
        },
      },
      {
        term: { pt: "Barras de uso", en: "Usage bars" },
        body: {
          pt: "Mostram mensagens IA usadas no mês, conexões WhatsApp e membros da equipe em relação ao limite do seu plano. Ficam amarelas a partir de 90% de uso.",
          en: "Show AI messages used this month, WhatsApp connections and team members against your plan limits. They turn yellow at 90% usage.",
        },
      },
      {
        term: { pt: "Ao atingir o limite de mensagens IA", en: "When the AI message limit is reached" },
        body: {
          pt: "Todo cadastro começa no plano Free, sem cartão e sem prazo pra expirar. Se o saldo de mensagens IA do mês acabar, o bot avisa automaticamente que em breve um atendente responde — o inbox continua funcionando normalmente, nada é bloqueado ou apagado. Assinar o Starter ou o Pro aumenta os limites na hora.",
          en: "Every account starts on the Free plan, with no card and no expiration date. If the month's AI message quota runs out, the bot automatically lets the contact know a teammate will reply soon — the inbox keeps working normally, nothing is blocked or deleted. Subscribing to Starter or Pro raises the limits right away.",
        },
      },
      {
        term: { pt: "Pagamento", en: "Payment" },
        body: {
          pt: "Cobrança mensal via Stripe (cartão de crédito). Ao clicar em Assinar, você é redirecionado para a página de checkout segura da Stripe; o plano ativa automaticamente após a confirmação.",
          en: "Monthly billing via Stripe (credit card). Clicking Subscribe redirects you to Stripe's secure checkout page; the plan activates automatically once payment is confirmed.",
        },
      },
    ],
  },
  {
    id: "equipe",
    icon: Users,
    title: { pt: "Equipe e permissões", en: "Team and permissions" },
    intro: {
      pt: "Quem pode fazer o quê dentro da sua empresa.",
      en: "Who can do what inside your company.",
    },
    items: [
      {
        term: { pt: "Dono", en: "Owner" },
        body: {
          pt: "Acesso total: inbox, bot, conexões, integrações, plano, equipe e exclusão da conta. Pode convidar outros donos e agentes.",
          en: "Full access: inbox, bot, connections, integrations, plan, team and account deletion. Can invite other owners and agents.",
        },
      },
      {
        term: { pt: "Agente", en: "Agent" },
        body: {
          pt: "Focado no atendimento: responde conversas, resolve, atribui e edita contatos. Não gerencia plano, API keys nem equipe.",
          en: "Service-focused: replies to conversations, resolves, assigns and edits contacts. Doesn't manage plan, API keys or team.",
        },
      },
      {
        term: { pt: "Convites", en: "Invitations" },
        body: {
          pt: "Na aba Equipe, digite o email do colega e escolha a função. Ele recebe um email com link para criar a senha e já entra na sua empresa. O limite de membros depende do plano.",
          en: "In the Team tab, type your colleague's email and pick a role. They get an email link to set a password and join your company. The member limit depends on your plan.",
        },
      },
    ],
  },
];

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
      "Vá em Equipe e clique em Convidar membro. A pessoa recebe um email com o link de acesso.",
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

export function HelpView({
  orgId,
  authorName,
  appUrl = "https://www.pixelpagechat.com.br",
}: {
  orgId: string;
  authorName: string;
  appUrl?: string;
}) {
  const t = useT();
  const pick = (bi: Bi) => bi.pt;

  // Guia prático de n8n (com código) — fora do modelo term/body das seções
  const n8nPayload = `{
  "event": "message.received",
  "organization_id": "${orgId}",
  "conversation_id": "uuid-da-conversa",
  "contact": { "name": "Maria Silva", "phone": "5511999998888" },
  "message": {
    "id": "wamid.XXX",
    "text": "Oi, qual o horário de vocês?",
    "type": "text",
    "media_url": null,
    "timestamp": "2026-06-24T14:32:00.000Z"
  },
  "reply_token": "uuid-da-conversa.a1b2c3...",
  "app_url": "${appUrl}"
}`;
  const n8nReply = `POST ${appUrl}/api/v1/messages
Authorization: Bearer SUA_API_KEY
Content-Type: application/json

{
  "conversation_id": "{{ $json.body.conversation_id }}",
  "text": "Atendemos de seg a sex, das 9h às 18h!"
}`;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
        <header>
          <h1 className="flex items-center gap-2 font-display text-lg font-semibold">
            <LifeBuoy className="h-5 w-5 text-txt-mut" aria-hidden />
            {t("Central de Ajuda")}
          </h1>
          <p className="mt-0.5 text-sm text-txt-mut">
            {t("Guias de cada parte do sistema e respostas rápidas para as dúvidas mais comuns.")}
          </p>
        </header>

        {/* Documentação — guias expansíveis */}
        {sections.map((section) => (
          <details
            key={section.id}
            className="group rounded-card border border-line bg-surface"
          >
            <summary className="focus-ring flex cursor-pointer select-none items-center gap-3 rounded-card px-5 py-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-raised">
                <section.icon className="h-5 w-5 text-txt-mut" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="font-display text-sm font-semibold">
                  {pick(section.title)}
                </p>
                <p className="text-xs text-txt-mut">{pick(section.intro)}</p>
              </div>
              <span
                className="ml-auto text-txt-dim transition-transform group-open:rotate-90"
                aria-hidden
              >
                ›
              </span>
            </summary>
            <dl className="space-y-4 border-t border-line px-5 py-4">
              {section.items.map((item, i) => (
                <div key={i}>
                  <dt className="text-sm font-semibold text-txt">
                    {pick(item.term)}
                  </dt>
                  <dd className="mt-1 text-sm leading-relaxed text-txt-mut">
                    {pick(item.body)}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        ))}

        {/* Guia prático: Conectar com n8n (com código + download) */}
        <details className="group rounded-card border border-line bg-surface">
          <summary className="focus-ring flex cursor-pointer select-none items-center gap-3 rounded-card px-5 py-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-soft">
              <Workflow className="h-5 w-5 text-amber" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="font-display text-sm font-semibold">
                {t("Conectar com n8n (passo a passo)")}
              </p>
              <p className="text-xs text-txt-mut">
                {t("Receba cada mensagem no seu n8n e responda pela API da PixelPage Chat.")}
              </p>
            </div>
            <span
              className="ml-auto text-txt-dim transition-transform group-open:rotate-90"
              aria-hidden
            >
              ›
            </span>
          </summary>
          <div className="space-y-4 border-t border-line px-5 py-4 text-sm text-txt-mut">
            <div>
              <p className="mb-1 font-semibold text-txt">{t("Pré-requisitos")}</p>
              <ul className="list-inside list-disc space-y-0.5 leading-relaxed">
                <li>{t("Conta no n8n (n8n.cloud ou self-hosted)")}</li>
                <li>{t("API Key do PixelPage Chat (em Integrações → API Key)")}</li>
              </ul>
            </div>

            <div>
              <p className="mb-1 font-semibold text-txt">{t("1. Criar o workflow no n8n")}</p>
              <ol className="list-inside list-decimal space-y-0.5 leading-relaxed">
                <li>{t("No n8n, clique em “New Workflow”")}</li>
                <li>{t("Adicione um nó Webhook (método POST, path: pixelpage-bot)")}</li>
                <li>{t("Copie a URL de produção (Production URL)")}</li>
              </ol>
            </div>

            <div>
              <p className="mb-1 font-semibold text-txt">{t("2. Configurar na PixelPage Chat")}</p>
              <ol className="list-inside list-decimal space-y-0.5 leading-relaxed">
                <li>{t("Vá em Conexões → sua conexão → Configurar webhook")}</li>
                <li>{t("Na aba “Meu n8n”, cole a URL do webhook e salve")}</li>
                <li>{t("Clique em “Enviar evento de teste” e confirme no n8n")}</li>
              </ol>
            </div>

            <div>
              <p className="mb-1 font-semibold text-txt">{t("3. Payload recebido")}</p>
              <CodeBlock code={n8nPayload} label={t("payload recebido")} />
            </div>

            <div>
              <p className="mb-1 font-semibold text-txt">{t("4. Responder ao cliente")}</p>
              <CodeBlock code={n8nReply} label={t("como responder")} />
            </div>

            <div>
              <p className="mb-1 font-semibold text-txt">{t("Workflow de exemplo")}</p>
              <p className="mb-2 text-xs leading-relaxed">
                {t("Baixe nosso workflow pronto e importe no n8n (lembre de trocar SUA_API_KEY).")}
              </p>
              <a
                href="/downloads/workflow-pixelpage-atendimento-base.json"
                download
                className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-2 text-xs font-medium text-txt transition-colors hover:border-txt-mut"
              >
                <Download className="h-3.5 w-3.5" aria-hidden />
                {t("Baixar workflow base")}
              </a>
            </div>
          </div>
        </details>

        {/* FAQ — acordeão */}
        <div className="pt-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-txt-dim">
            {t("Perguntas frequentes")}
          </h2>
          <div className="mt-2 space-y-2">
            {faq.map((item) => (
              <details
                key={item.question}
                className="group rounded-lg border border-line bg-surface open:border-line-strong"
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

        {/* Sugestões */}
        <div className="rounded-card border border-line-strong bg-surface p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-raised">
              <Lightbulb className="h-5 w-5 text-txt-mut" aria-hidden />
            </div>
            <div className="flex-1">
              <p className="font-display text-sm font-semibold">
                {t("Não achou o que procurava? Tem uma ideia?")}
              </p>
              <p className="mt-0.5 text-xs text-txt-mut">
                {t("Conte pra gente — toda sugestão é lida pela equipe da PixelPage Chat.")}
              </p>
              <div className="mt-4">
                <SuggestionForm orgId={orgId} authorName={authorName} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
