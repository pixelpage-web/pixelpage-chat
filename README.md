# PixelPage Chat

Plataforma SaaS multi-tenant de **WhatsApp Business com Bot IA** — estilo Chatwoot, da [PixelPage Chat](https://pixelpagechat.com.br) (Tech Provider oficial verificado da Meta).

Cada empresa cliente conecta o próprio número de WhatsApp via Embedded Signup e escolhe como as mensagens são respondidas:

| Modo | O que acontece |
|---|---|
| **Manual** | Sua equipe responde pelo inbox em tempo real |
| **Bot IA** | A plataforma responde sozinha com Claude API (personalidade, tom e FAQ configuráveis) |
| **Webhook externo (n8n)** | Cada mensagem é encaminhada para o n8n DO CLIENTE, que responde pela API pública da PixelPage Chat |

## Arquitetura do fluxo de mensagens

```
Cliente final manda mensagem no WhatsApp da empresa
  → Meta Cloud API
    → POST /api/webhooks/meta (webhook ÚNICO global, responde <200ms)
      → identifica o tenant pelo phone_number_id
      → salva em messages + atualiza a conversa (Realtime notifica o inbox)
      → roteia pelo modo da conexão:
          manual            → inbox (humano responde)
          ai_bot            → checa saldo → Claude API → envia → decrementa saldo
          external_webhook  → POST assinado (HMAC) para o n8n do cliente
                              → o n8n responde via POST /api/v1/messages
```

## Stack

- **Next.js 15 (App Router) + TypeScript** — deploy na Vercel
- **Tailwind CSS** com design tokens próprios (dark, acento verde-limão)
- **Supabase** — Auth (email/senha + Google), Postgres com RLS, Realtime
- **Claude API** (`claude-haiku-4-5` com prompt caching) — bot nativo + simulador
- **Asaas** — cobrança recorrente BR (Pix/boleto/cartão); sem chave → modo demo

---

## 1. Rodando localmente

```bash
npm install
cp .env.example .env.local   # preencha (mínimo: Supabase + ADMIN_EMAIL)
npm run dev
```

Sem `ANTHROPIC_API_KEY` o app sobe normalmente — bot/simulador mostram erro amigável. Sem `ASAAS_API_KEY` a cobrança roda em modo demonstração.

### Dados de exemplo (inbox)

Com `DEV_SEED_ENABLED=true`, o inbox vazio mostra o botão **"Criar dados de exemplo"** (ou `POST /api/dev/seed` logado), que cria contatos, conversas e mensagens fictícias para testar o inbox sem WhatsApp conectado.

---

## 2. Setup do Supabase

1. Crie um projeto em [supabase.com](https://supabase.com)
2. Copie de **Settings → API** para o `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (⚠ somente servidor, nunca no client)
3. No **SQL Editor**, execute na ordem:
   - `supabase/migrations/0001_schema.sql` — schema completo, RLS, triggers, RPCs e Realtime
   - `supabase/migrations/0002_seed_plans.sql` — planos (Trial, Starter, Pro, Business)
4. **Auth → Providers**:
   - **Email** já vem ativo (recomendado manter "Confirm email")
   - **Google**: ative e cole o Client ID/Secret do Google Cloud Console; em **Authorized redirect URIs** use `https://SEU-PROJETO.supabase.co/auth/v1/callback`
5. **Auth → URL Configuration**: adicione `http://localhost:3000/**` e o domínio de produção em *Redirect URLs*
6. Defina `ADMIN_EMAIL` no `.env.local` com o SEU email — no primeiro login esse usuário recebe a role `admin` (acesso ao `/admin`)

> O Realtime das tabelas `messages` e `conversations` já é habilitado pela migração (`alter publication supabase_realtime ...`).

---

## 3. Deploy na Vercel

1. Suba o repositório para o GitHub e importe na [Vercel](https://vercel.com)
2. Em **Settings → Environment Variables**, cadastre TODAS as variáveis do `.env.example` (em produção use `NEXT_PUBLIC_APP_URL=https://seu-dominio.com.br` e `DEV_SEED_ENABLED=false`)
3. Deploy — o build (`next build`) precisa passar sem erros
4. Aponte o domínio e atualize as *Redirect URLs* no Supabase

> O webhook da Meta usa `after()` do Next para processar mensagens **depois** de responder 200 — na Vercel isso funciona nativamente (a função continua viva até concluir).

---

## 4. Webhook no painel da Meta

App em [developers.facebook.com](https://developers.facebook.com) (Tech Provider):

1. **WhatsApp → Configuration → Webhook → Edit**
   - **Callback URL**: `https://seu-dominio.com.br/api/webhooks/meta`
   - **Verify token**: o MESMO valor de `META_VERIFY_TOKEN` do seu env (você inventa esse valor)
   - Clique em *Verify and save* — o GET com `hub.challenge` é respondido automaticamente
2. Em **Webhook fields**, assine **`messages`**
3. Preencha no env:
   - `META_APP_ID` e `META_APP_SECRET` (App settings → Basic) — o secret valida a assinatura `X-Hub-Signature-256` de cada evento
   - `META_SYSTEM_USER_TOKEN` — token permanente do System User do Tech Provider (Business Settings → System users), usado para enviar mensagens em nome de todos os clientes

### Embedded Signup (conexão do cliente)

1. No painel da Meta: **Facebook Login for Business → Configurations** → crie uma configuração de Embedded Signup do WhatsApp e copie o **Configuration ID**
2. No env: `NEXT_PUBLIC_META_APP_ID`, `NEXT_PUBLIC_META_CONFIG_ID`
3. Enquanto o app estiver em análise, mantenha `NEXT_PUBLIC_EMBEDDED_SIGNUP_ENABLED=false` — o onboarding mostra "disponível em breve" e o restante da plataforma funciona normalmente (inclusive o simulador do bot)
4. Quando a Meta publicar o app: troque para `true` e o botão de conexão aparece no onboarding e em **/app/connections**

---

## 5. Cobrança (Asaas)

1. Crie a conta em [asaas.com](https://www.asaas.com) (comece no sandbox)
2. Env: `ASAAS_API_KEY`, `ASAAS_ENV=sandbox` (ou `production`)
3. No painel do Asaas, cadastre o webhook `https://seu-dominio.com.br/api/webhooks/asaas` com um token de autenticação — o mesmo valor vai em `ASAAS_WEBHOOK_TOKEN`
4. Eventos tratados: `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED` ativam/renovam o plano; `PAYMENT_OVERDUE` marca pendência
5. Defina os preços reais dos planos em **/admin/planos**

Sem `ASAAS_API_KEY`, os botões de upgrade abrem o modal "Em breve" (modo demonstração).

---

## 6. Integração n8n — passo a passo

O modo **Webhook externo** encaminha cada mensagem recebida para o n8n do cliente, que responde pela API pública.

### 6.1 No painel da PixelPage Chat

1. **/app/integrations** → cole a URL do Webhook do seu n8n → **Salvar**
2. Copie o **secret de assinatura** (valida que o POST veio da PixelPage Chat)
3. Gere uma **API key** (`zari_...`) — usada para responder
4. Em **/app/connections**, mude o modo da conexão para **Webhook**
5. Use **"Enviar evento de teste"** para validar o fluxo de ponta a ponta

### 6.2 Workflow de exemplo no n8n

```
[Webhook] → [Code: validar assinatura] → [sua lógica/IA] → [HTTP Request: responder]
```

**Nó 1 — Webhook**: método `POST`, copie a *Production URL* para o painel da PixelPage Chat. Payload recebido:

```json
{
  "event": "message.received",
  "organization_id": "uuid",
  "conversation_id": "uuid",
  "contact": { "name": "Maria Silva", "phone": "5511999998888" },
  "message": { "id": "wamid.XXX", "text": "Oi!", "type": "text", "timestamp": "..." },
  "reply_token": "uuid.assinatura"
}
```

**Nó 2 — Code (validar a assinatura HMAC)**:

```javascript
const crypto = require('crypto');
const secret = 'SEU_SECRET_DO_PAINEL';
const body = JSON.stringify($input.first().json.body);
const received = $input.first().json.headers['x-zari-signature'];
const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
if (received !== expected) throw new Error('Assinatura inválida');
return $input.first().json.body;
```

**Nó 3 — HTTP Request (responder)**:

- Método: `POST` · URL: `https://seu-dominio.com.br/api/v1/messages`
- Header: `Authorization: Bearer zari_SUA_API_KEY`
- Body (JSON):

```json
{
  "reply_token": "={{ $json.reply_token }}",
  "text": "Resposta gerada pelo seu fluxo 🚀"
}
```

Se a entrega ao seu n8n falhar 3 vezes seguidas, a PixelPage Chat registra o erro e mostra o alerta em **/app/integrations** (log dos últimos 20 disparos incluído).

---

## 7. API pública

Autenticação: `Authorization: Bearer zari_...` (gere em /app/integrations).

| Endpoint | Descrição |
|---|---|
| `POST /api/v1/messages` | Envia mensagem — por `conversation_id`, `reply_token` ou `to` (telefone E.164) |
| `GET /api/v1/conversations` | Lista conversas (`?status=open\|resolved&limit=50`) |
| `GET /api/v1/conversations/{id}/messages` | Histórico (`?limit=100&before=ISO8601`) |

```bash
curl -X POST https://seu-dominio.com.br/api/v1/messages \
  -H "Authorization: Bearer zari_xxx" \
  -H "Content-Type: application/json" \
  -d '{ "to": "5511999998888", "text": "Olá pela API!" }'
```

---

## 8. Estrutura do projeto

```
app/
  (auth)/login, register      autenticação (+ Google OAuth)
  app/onboarding              wizard 3 passos (empresa → WhatsApp → modo)
  app/(shell)/inbox           inbox estilo Chatwoot com Supabase Realtime
  app/(shell)/agent           config do bot + FAQ + simulador (Claude real)
  app/(shell)/connections     conexões WhatsApp + modo por conexão
  app/(shell)/integrations    webhook n8n + API keys + docs inline
  app/(shell)/billing         plano, uso, upgrade (Asaas) e faturas
  app/(shell)/settings        conta, equipe (convites), excluir conta
  admin/                      dashboard, organizações (impersonar), planos,
                              configurações globais e logs
  api/webhooks/meta           webhook global da Meta (GET verify + POST async)
  api/webhooks/asaas          confirmação de pagamento
  api/v1/*                    API pública (auth por API key)
components/                   UI + features (inbox, agent, admin, ...)
lib/                          claude, meta, pipeline, asaas, webhooks, billing
supabase/migrations/          0001_schema.sql (RLS completo) + 0002_seed_plans.sql
types/database.ts             tipos do banco para o client Supabase
```

## Segurança

- **RLS em todas as tabelas** — cada organização só enxerga os próprios dados; a role `admin` global vê tudo
- Webhook da Meta validado por `X-Hub-Signature-256` (HMAC com App Secret)
- Webhook externo assinado com HMAC SHA-256 (`X-Zari-Signature`)
- API keys armazenadas como hash SHA-256 (o valor em claro aparece uma única vez)
- Nenhuma credencial no código — tudo via variáveis de ambiente
