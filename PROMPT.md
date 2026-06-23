# PROMPT MESTRE — Zari API (cole em uma pasta vazia no Claude Code)
#
# ⚠ ATUALIZADO PARA v2 — veja o "ADENDO v2" no final deste arquivo.
# O prompt abaixo + o adendo descrevem o sistema completo atual.

## Plataforma de WhatsApp Business com Bot IA (estilo Chatwoot, multi-tenant)

## CONTEXTO DO NEGÓCIO

Sou Patrick, fundador da **PixelPage Chat** (pixelpagechat.com.br), **Tech Provider oficial verificado da Meta** para WhatsApp Business API.

Construa a **Zari API**: uma plataforma SaaS multi-tenant onde empresas conectam o próprio número de WhatsApp e escolhem como as mensagens são respondidas. É o meu próprio "Chatwoot" — as mensagens vêm da Meta Cloud API direto para a plataforma, sem ferramentas de terceiros no meio.

**Separação de produtos:** Zari API = ESTE projeto (inbox + bot para empresas). Zari Bot = outro projeto (assistente pessoal) — NÃO faz parte do escopo.

**NUNCA incluir chaves de API reais no código. Tudo via variáveis de ambiente + .env.example completo e comentado.**

## O PRODUTO

Cada empresa cliente pode:
1. **Conectar o WhatsApp** via Embedded Signup da Meta (cliente clica, loga no Facebook, autoriza)
2. **Ver e responder conversas** num inbox estilo Chatwoot com Supabase Realtime
3. **Escolher o modo de resposta POR CONEXÃO:**
   - **Manual** — só inbox, humano responde
   - **Bot IA (nativo)** — responde sozinho via Claude API (`claude-haiku-4-5`, prompt caching no system), com personalidade/FAQ/tom configuráveis
   - **Webhook Externo (n8n)** — encaminha cada mensagem ao n8n DO CLIENTE (payload assinado), que responde pela API pública da Zari
4. **Usar a API pública** com API key própria por organização

## ARQUITETURA DO FLUXO DE MENSAGENS (núcleo)

```
Cliente final manda mensagem no WhatsApp da empresa
  → Meta Cloud API
    → POST /api/webhooks/meta (webhook ÚNICO global; valida X-Hub-Signature-256;
      responde 200 em <200ms e processa async via after() do next/server)
      → identifica o tenant pelo phone_number_id
      → upsert contato → encontra/cria conversa → salva mensagem
        (dedupe por meta_message_id, unique index parcial)
      → org suspensa ou assinatura bloqueada? salva mas NÃO roteia
      → roteia pelo modo da conexão:
        [manual] realtime notifica o inbox
        [ai_bot] conversa com bot_paused? para. handoff keyword? pausa bot +
          envia confirmação. fora do horário (America/Sao_Paulo)? envia
          away_message sem IA. saldo do plano esgotado? loga ai.limit_reached.
          conversa nova? envia welcome_message (sem custo de IA).
          → monta system prompt estável (agente + FAQs + regras, SEM timestamps,
            cache_control ephemeral) + histórico (20 msgs)
          → Claude API → envia via POST /{phone_number_id}/messages
          → salva resposta (sender_type ai_bot) → rpc increment_ai_usage
          → loga tokens em audit_logs (ai.reply) p/ custo no admin
        [external_webhook] POST ao n8n do cliente:
          { event, organization_id, conversation_id, contact:{name,phone},
            message:{id,text,type,timestamp}, reply_token }
          assinado com HMAC SHA-256 (header X-Zari-Signature), 3 tentativas,
          timeout 8s, loga em webhook_logs; 3 falhas consecutivas → audit_logs
          webhook.failing + alerta no painel. reply_token =
          "<conversation_id>.<hmac(secret, conversation_id)[0:32]>"
```

Envio Meta: `POST https://graph.facebook.com/v21.0/{phone_number_id}/messages` com Bearer do **System User token global do Tech Provider** (env). Cada conexão guarda só waba_id e phone_number_id. GET /api/webhooks/meta responde ao hub.challenge com o verify token de env.

## ÁREA 1 — PAINEL ADMIN (/admin, role admin global)

1. **Dashboard**: total de orgs (pagantes/trial), MRR, conexões ativas, mensagens do mês por modo (recebidas/manual/bot/n8n), custo estimado de tokens Claude (somando input/output dos audit_logs ai.reply+ai.simulate, preço do haiku US$1/US$5 por MTok), gráfico de novas orgs por mês (6 meses)
2. **Organizações**: lista com busca, detalhe (conexões, uso, equipe, plano), suspender/reativar, trocar plano manualmente, **impersonar** (cookie httpOnly `zari_impersonate_org` lido em getSessionProfile; banner âmbar "modo suporte" no /app com botão sair; expira em 2h)
3. **Sugestões**: triagem das sugestões dos clientes (filtros nova/avaliada/concluída, mudar status, excluir)
4. **Configurações globais** (admin_settings, env SEMPRE tem prioridade — mostrar badge "definido em env"): Claude (modelo, max_tokens, temperatura), Meta (App ID, verify token + instruções de configuração do webhook com a callback URL), Asaas (sandbox/produção + URL do webhook)
5. **Planos**: CRUD sem mexer em código (nome, preço, limites, ativo)
6. **Logs**: audit_logs com filtros (erros/bot/cobrança/webhooks)

O admin é promovido automaticamente: primeiro login do email em `ADMIN_EMAIL` (env) vira role admin (bootstrap via service role em getSessionProfile). Painel admin pode ficar só em PT-BR.

## ÁREA 2 — PAINEL DO CLIENTE (/app)

1. **Onboarding 3 passos**: empresa (RPC create_organization: org + perfil owner + trial 7 dias) → WhatsApp (Embedded Signup atrás de `NEXT_PUBLIC_EMBEDDED_SIGNUP_ENABLED`; false = card "disponível em breve" + pular) → modo de resposta (cards explicativos)
2. **Inbox** (estilo Chatwoot/Linear, denso): lista à esquerda (avatar com cor determinística, última msg com ícone de quem respondeu, badge não lidas, filtros todas/abertas/resolvidas, busca), conversa no centro (bolhas, separadores de dia, indicador humano/bot/n8n por mensagem, Enter envia), contato à direita (telefone, notas internas, etiquetas; modal em telas <xl), ações: resolver/reabrir, atribuir a membro, pausar/retomar bot por conversa; Realtime via postgres_changes (INSERT messages + INSERT/UPDATE conversations); trigger SQL atualiza last_message_at/unread/reabre; rpc mark_conversation_read zera não lidas; trial expirado = composer vira aviso somente leitura
3. **Agente IA**: nome, instruções (textarea), 4 presets de tom (vendedor/suporte/formal/casual), boas-vindas, ausência, horário de funcionamento (dias da semana + abre/fecha, fuso São Paulo), palavras-chave de handoff (chips), FAQ (CRUD), **simulador embutido** chamando a Claude API real (funciona SEM WhatsApp conectado, não consome saldo, mostra aviso quando detecta handoff keyword); agente criado automaticamente na primeira visita
4. **Conexões**: lista com status (conectado/pendente/desconectado), modo por conexão (3 cards), limite do plano, botão de Embedded Signup (flag)
5. **Integrações**: webhook n8n (URL https, secret HMAC com mostrar/ocultar/regenerar, evento de teste, log dos últimos 20 disparos com status e ms, alerta vermelho após 3 falhas, docs inline do payload + como responder), API keys (gerar com modal que mostra a chave UMA vez, hash SHA-256 no banco, revogar, docs inline com curl)
6. **Assinatura**: plano atual + status, barras de uso (IA/conexões/equipe, âmbar ≥90%), cards de upgrade, modal CPF/CNPJ na primeira cobrança Asaas, histórico de faturas; sem ASAAS_API_KEY → modal "Em breve"
7. **Documentação** (/app/docs): seções acordeão explicando CADA recurso em linguagem leiga (primeiros passos, inbox, agente, conexões/modos, integrações, assinatura/limites, equipe/permissões), conteúdo bilíngue PT/EN, com caixa de sugestão no final
8. **Configurações**: seletor de idioma, nome/email, renomear empresa, equipe (convidar por email via invite nativo do Supabase respeitando team_limit, roles dono/agente, remover), card ajuda+sugestões (link docs + form), zona de perigo (excluir conta: digita o nome da empresa para confirmar; apaga org em cascata + auth user do dono)

## IDIOMA (i18n PT/EN)

- Português é a língua-fonte escrita nos componentes; dicionário plano PT→EN em `lib/i18n/en.ts`; frase ausente cai no PT (nunca quebra)
- `LanguageProvider` no layout raiz com cookie `zari_lang` (Server Components leem via cookies()); hooks `useT()` e `useLang()`
- Seletor PT|EN nas telas de login/registro (canto superior) e em /app/settings
- Painel do cliente 100% traduzido (inclusive toasts); docs com conteúdo {pt,en} por seção

## SUGESTÕES

- Tabela `suggestions` (org_id, author_id, author_name, content, status new/reviewed/done)
- RLS: membro insere na própria org; autor vê as suas; admin vê/edita/exclui todas
- Form em /app/docs e /app/settings; triagem em /admin/suggestions

## PLANOS E COBRANÇA

| Plano | Preço | Msgs IA/mês | Conexões | n8n | Equipe |
|---|---|---|---|---|---|
| Trial | R$ 0 (7 dias) | 100 | 1 | ✅ | 1 |
| Starter | a definir | 1.000 | 1 | ✅ | 2 |
| Pro | a definir | 5.000 | 2 | ✅ | 5 |
| Business | a definir | 20.000 | 5 | ✅ | Ilimitado (null) |

- SÓ o Bot IA consome saldo (manual/n8n/simulador/boas-vindas/ausência não)
- **Asaas**: cliente + assinatura MONTHLY billingType UNDEFINED; externalReference = "orgId|planId"; webhook /api/webhooks/asaas (header asaas-access-token = ASAAS_WEBHOOK_TOKEN): PAYMENT_CONFIRMED/RECEIVED ativa plano + renova período; PAYMENT_OVERDUE → past_due. Plano só ativa quando o pagamento confirma
- Trial expirado/cancelada: inbox somente leitura, bot e webhooks param, banner de upgrade; past_due segue funcionando (carência) com banner

## STACK OBRIGATÓRIA + AVISOS TÉCNICOS (não ignorar!)

- **Next.js 15 (App Router) + TypeScript**, deploy Vercel; **Tailwind CSS 3.4** com tokens próprios; **Supabase** (auth email/senha + Google, Postgres com RLS, Realtime); API Routes para webhooks e API pública
- ⚠ **TypeScript fixado em `~5.9`** — TS 6 quebra o build do Next 15.5 (erro de import de CSS)
- ⚠ **types/database.ts com TYPE ALIASES, nunca interfaces** — supabase-js exige index signature implícita; interfaces fazem as queries resolverem para `never`
- ⚠ Sem `Relationships` nos tipos manuais, **joins embutidos (`plans(name)`) não tipam** — usar consultas separadas
- ⚠ Webhook Meta usa **`after()` de next/server** para processar depois do 200
- ⚠ Clients Supabase: browser (anon+RLS), server com cookies via @supabase/ssr, admin service_role só no servidor
- Anthropic SDK oficial `@anthropic-ai/sdk`; erros tipados (AuthenticationError, RateLimitError, APIError); `temperature` só em modelos que aceitam
- Middleware protege /app e /admin (sem user → /login); role admin checada no layout do /admin

## SCHEMA DO BANCO (migração SQL completa com RLS)

```
organizations (id, name, slug unique, owner_id, suspended bool, created_at)
profiles (id [auth.users], org_id, role 'admin'|'owner'|'agent', name, created_at)
plans (id, name unique, price_cents, ai_messages_limit, connections_limit,
       team_limit null=ilimitado, features jsonb, active)
subscriptions (id, org_id unique, plan_id, status trial|active|past_due|canceled,
       asaas_subscription_id, asaas_customer_id, trial_ends_at, current_period_end)
whatsapp_connections (id, org_id, label, waba_id, phone_number_id, phone_display,
       mode manual|ai_bot|external_webhook, status pending|connected|disconnected,
       connected_at)
agents (id, org_id, connection_id null, name, system_prompt, tone_preset
       vendedor|suporte|formal|casual, welcome_message, away_message,
       business_hours jsonb {enabled,days[],open,close}, handoff_keywords text[], active)
agent_faqs (id, agent_id, question, answer, position)
external_webhooks (id, org_id, connection_id, url, secret, active, last_status,
       failures_count, created_at)
webhook_logs (id, webhook_id, event, status_code, response_ms, error, created_at)
contacts (id, org_id, phone, name, notes, tags text[], unique(org_id,phone))
conversations (id, org_id, connection_id, contact_id, status open|resolved,
       bot_paused, assigned_to, last_message_at, unread_count)
messages (id, conversation_id, direction inbound|outbound,
       sender_type contact|human|ai_bot|external, content,
       message_type text|image|audio|document, meta_message_id, created_at)
api_keys (id, org_id, key_hash unique, label, last_used_at, created_at)
usage_counters (id, org_id, period_start date, ai_messages_used, unique(org_id,period_start))
admin_settings (key pk, value jsonb, updated_at)
audit_logs (id, org_id, actor_id, action, metadata jsonb, created_at)
suggestions (id, org_id, author_id, author_name, content,
       status new|reviewed|done, created_at)
```

RLS: org só acessa os próprios dados via funções SECURITY DEFINER `auth_org_id()`, `auth_role()`, `is_admin()` (evitam recursão em profiles); admin global vê tudo; messages/agent_faqs/webhook_logs via EXISTS na tabela-mãe; api_keys só owner. Índices: phone_number_id, (conversation_id, created_at), org_id em todas as tenant, unique parcial em messages(meta_message_id), (org_id, last_message_at desc). Trigger em messages: last_message_at, unread_count+1 inbound, reabre resolvida. RPCs: create_organization(p_name, p_slug) [não rebaixar admin], increment_ai_usage(p_org_id) [upsert atômico do mês], mark_conversation_read. Realtime: alter publication supabase_realtime add messages, conversations. Seed dos 4 planos. Seed de demo: rota dev /api/dev/seed (DEV_SEED_ENABLED) cria conexão demo + 4 contatos/conversas realistas com mensagens variadas (bot/humano/n8n/mídia).

## DESIGN — REGRAS RÍGIDAS

- Identidade única, sem cara de template: fundo #0B0D10, superfícies #14171C, acento verde-limão #C8F135 em CTAs/ativos, âmbar para alertas, vermelho suave para perigo
- Títulos Space Grotesk, corpo Inter (next/font); inbox denso estilo ferramenta profissional
- Sidebar fina com ícones no desktop; mobile: tabs inferiores, inbox em tela cheia
- Skeletons com shimmer, estados vazios ilustrados (ícone+glow), toasts (sonner) em TODA chamada assíncrona
- Sem landing page: /login, /register, /app/*, /admin/*

## ENV (.env.example completo e comentado)

NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL, ANTHROPIC_API_KEY, CLAUDE_MODEL=claude-haiku-4-5, CLAUDE_MAX_TOKENS=1024, CLAUDE_TEMPERATURE=0.7, META_APP_ID, META_APP_SECRET, META_VERIFY_TOKEN, META_SYSTEM_USER_TOKEN, META_GRAPH_VERSION=v21.0, NEXT_PUBLIC_META_APP_ID, NEXT_PUBLIC_META_CONFIG_ID, NEXT_PUBLIC_META_GRAPH_VERSION, NEXT_PUBLIC_EMBEDDED_SIGNUP_ENABLED=false, ASAAS_API_KEY, ASAAS_ENV=sandbox, ASAAS_WEBHOOK_TOKEN, DEV_SEED_ENABLED=true

## ORDEM DE EXECUÇÃO (validar `next build` a cada fase)

1. Setup: projeto, tokens Tailwind, .env.example, componentes UI base
2. Migração SQL + auth + middleware + RLS + seed de planos + onboarding
3. Inbox completo com Realtime + seed demo
4. Agente IA + FAQ + simulador (Claude real)
5. Webhook Meta (GET verify + POST async + roteamento + envio)
6. Webhook externo n8n (HMAC, teste, logs, retry) + API pública /api/v1 (messages, conversations, conversations/{id}/messages) com auth por API key
7. Planos + Asaas (modo demo sem key) + contadores + bloqueios
8. Painel admin completo (com impersonação)
9. Conexões + Embedded Signup atrás de flag + tela de configurações/equipe
10. i18n PT/EN (provider + dicionário + seletor) em todo o painel do cliente
11. Documentação bilíngue (/app/docs) + sugestões (form + /admin/suggestions)
12. README completo (Vercel, Supabase, Meta, Asaas, n8n passo a passo) + PROMPT.md

## CRITÉRIOS DE QUALIDADE (não negociáveis)

- Zero erros de build; zero `any` sem justificativa
- Mobile-first perfeito em 375px
- Toast de erro em TODA chamada assíncrona
- Webhook Meta <200ms (async via after())
- Payload externo assinado HMAC SHA-256 (X-Zari-Signature)
- API keys hasheadas (SHA-256), exibidas uma única vez
- Nenhuma credencial hardcoded
- Comentários em português nos fluxos críticos

---

## ADENDO v2 (10/06/2026) — funcionalidades adicionais sobre o prompt acima

### Dois modos de conexão WhatsApp (coexistem)
- meta_api: Embedded Signup (flag NEXT_PUBLIC_EMBEDDED_SIGNUP_ENABLED)
- qr_code: Evolution API (EVOLUTION_API_URL/KEY/WEBHOOK_TOKEN ou admin_settings
  "evolution"); criar instancia por conexao (instanceName zari_<org8>_<rand>),
  webhook unico /api/webhooks/evolution?token=..., eventos messages.upsert /
  connection.update; modal de QR com polling 2s (GET /api/whatsapp/qr);
  reconectar/desconectar/excluir; envio unificado em lib/send.ts decide o canal.
  Mensagens fromMe (enviadas pelo celular) entram como outbound human.
- Onboarding passo 1: + segmento e telefone; passo 2: dois cards (QR | Meta).

### Campanhas / disparos em massa
- Tabelas campaigns + campaign_contacts; wizard (nome, conexao conectada,
  mensagem, destinatarios: todos | por etiqueta | CSV de telefones, agora ou
  agendada); limite mensal por plano (campaigns_limit: 0=sem acesso Trial,
  500 Starter, 5000 Pro, null=ilimitado Business) contando campaign_contacts
  do mes; motor em lotes de 40 com 1,1s entre envios (lib/campaigns.ts);
  cron GET /api/campaigns/run a cada minuto (vercel.json + CRON_SECRET,
  Authorization: Bearer) inicia agendadas e continua lotes; progresso ao vivo
  por polling 3s; relatorio por campanha com lista de falhas; contatos
  bloqueados pulados; aviso inline de boas praticas (janela 24h/templates).

### Contatos (pagina propria)
- Tabela paginada (50/pag), busca, filtro por etiqueta, CRUD em modal,
  importacao CSV com preview + mapeamento de colunas (nome/telefone/tags,
  upsert por org+phone em lotes de 200), exportacao CSV, campo blocked
  (pipeline ignora bloqueados), ultima interacao via conversations.

### Relatorios (/app/reports)
- Periodos 7/30/90d; graficos sem lib (divs/conic-gradient): volume por dia,
  donut bot vs humano vs n8n, tempo medio de 1a resposta (bot e humano),
  top 10 contatos, mensagens por conexao, custo IA do periodo
  (audit_logs ai.reply+ai.simulate, haiku US$1/US$5 por MTok), CSAT "em breve",
  exportar CSV.

### API publica expandida + rate limit
- Novos: GET/PATCH /api/v1/conversations/{id} (status open|resolved|pending),
  GET/POST /api/v1/contacts. Rate limit 60 req/min por API key (janela
  deslizante em memoria) com headers X-RateLimit-Limit/Remaining/Reset em
  TODAS as rotas /api/v1.

### Inbox v2
- Filtros extras Pendentes e Minhas + filtro por conexao (quando >1);
  midia: anexo imagem/documento (bucket Storage "media" publico, max 8MB,
  POST /api/inbox/send-media, envio pelo canal) e render de imagem/audio/
  documento/sticker (media_url); templates rapidos "/" no composer (tabela
  global message_templates); bloquear contato e exportar historico CSV no
  painel do contato (+ contagem de conversas e ultima interacao).

### Admin v2
- Dashboard: + mensagens hoje, taxa bot vs humano, alertas (sessoes QR caidas,
  webhooks falhando >=3, trials expirando hoje).
- Configuracoes: blocos Evolution (URL+key) e n8n global; botoes "Testar
  conexao" para Claude/Evolution/Asaas/Meta (POST /api/admin/test-integration);
  custo por 1.000 mensagens; lista global de API keys dos clientes com revogar.
  Segredos sensiveis (tokens) continuam SOMENTE em env.
- Organizacoes: botao Resetar senha (generateLink recovery, link exibido para
  copiar) alem de impersonar/suspender/trocar plano.
- Planos: + destaque "Mais popular" (badge na tela de assinatura) e
  campanhas/mes; Templates globais por nicho (/admin/templates) com status de
  aprovacao Meta — alimentam os templates rapidos do inbox.
- Logs: secoes "Sessoes QR desconectadas" e "Disparos de webhook com falha"
  com reenvio manual (payload salvo em webhook_logs.payload).

### Schema v2 (migracoes 0004-0006)
- organizations: + logo_url, segment, phone
- profiles: + role "manager", notification_prefs jsonb
- plans: + campaigns_limit, highlight, sort_order
- whatsapp_connections: + connection_type meta_api|qr_code,
  evolution_instance_id (+indice), evolution_instance_token
- conversations.status: + "pending"; messages: + media_url, read_at, sender_id,
  tipos video e sticker; contacts: + blocked; webhook_logs: + payload jsonb
- novas tabelas: campaigns, campaign_contacts, message_templates (RLS:
  leitura autenticada de ativos, escrita admin)
- storage buckets publicos: logos, media (upload autenticado)

### Outras decisoes v2
- Roles: "admin" interno = superadmin do spec; "manager" = gerente (sem
  cobranca/equipe/exclusao). Design: superficies #13161B, bordas #1E2228,
  azul info #3B82F6, erro #EF4444, texto #F1F5F9/#94A3B8/#64748B; sidebar
  desktop com icone+label (w-52). Configuracoes do cliente: alterar senha
  (auth.updateUser) e toggles de notificacao (profiles.notification_prefs).
  Manter i18n PT/EN, Documentacao e Sugestoes do prompt base (nao estao no
  spec v2 mas fazem parte do produto).
