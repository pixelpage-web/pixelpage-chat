/**
 * Setup Cakto — cria produtos, ofertas e webhook para PixelPage Chat
 * e atualiza cakto_checkout_url nos planos do Supabase.
 *
 * Uso (Node 20.6+):
 *   node --env-file=.env.local scripts/setup-cakto.mjs
 *
 * Variáveis necessárias em .env.local (NUNCA commitar):
 *   CAKTO_CLIENT_ID=...
 *   CAKTO_CLIENT_SECRET=...
 *
 * Já disponíveis em .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...
 */

import { createClient } from "@supabase/supabase-js";

const CAKTO_BASE    = "https://api.cakto.com.br";
const CHECKOUT_BASE = "https://pay.cakto.com.br";
const WEBHOOK_URL   = "https://www.pixelpagechat.com.br/api/webhooks/cakto";

// ─── Validar env vars ────────────────────────────────────────────────────────
const required = [
  "CAKTO_CLIENT_ID",
  "CAKTO_CLIENT_SECRET",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];
for (const k of required) {
  if (!process.env[k]) {
    console.error(`\nERRO: variável ${k} não encontrada em .env.local`);
    console.error("Adicione-a e execute novamente.\n");
    process.exit(1);
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── Helpers ─────────────────────────────────────────────────────────────────
const SEP = "─".repeat(60);
function step(label) { console.log(`\n${SEP}\n[${label}]`); }

async function caktoPost(path, body, token) {
  const res = await fetch(`${CAKTO_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": body instanceof URLSearchParams
        ? "application/x-www-form-urlencoded"
        : "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body instanceof URLSearchParams ? body : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    console.error(`❌ HTTP ${res.status}:`, JSON.stringify(json, null, 2));
    process.exit(1);
  }
  console.log(`✅ HTTP ${res.status}:`, JSON.stringify(json, null, 2));
  return json;
}

// ─── 1. Autenticação ─────────────────────────────────────────────────────────
step("1. Autenticação OAuth2 (client_credentials)");
const authData = await caktoPost(
  "/public_api/token/",
  new URLSearchParams({
    client_id:     process.env.CAKTO_CLIENT_ID,
    client_secret: process.env.CAKTO_CLIENT_SECRET,
  })
);
const token = authData.access_token;
console.log(`   scope: ${authData.scope ?? "n/a"}`);
console.log(`   expires_in: ${authData.expires_in}s`);

// ─── 2. Produto — Plano 2 ────────────────────────────────────────────────────
step("2. Criar produto — Plano 2");
const prod2 = await caktoPost(
  "/public_api/products/",
  {
    name: "PixelPage Chat — Plano 2",
    description:
      "WhatsApp automatizado: conexões ilimitadas, 3 membros, 500 mensagens IA/mês.",
    type: "subscription",
  },
  token
);
const productId2 = prod2.id;
console.log(`   product_id: ${productId2}`);

// ─── 3. Oferta — Plano 2 ─────────────────────────────────────────────────────
step("3. Criar oferta — Plano 2 (R$5/mês, 3 dias grátis)");
const offer2 = await caktoPost(
  "/public_api/offers/",
  {
    name:                 "Plano 2 — Mensal",
    price:                5.00,
    product:              productId2,
    type:                 "subscription",
    intervalType:         "month",
    interval:             1,
    recurrence_period:    30,
    quantity_recurrences: -1,
    trial_days:           3,
    max_retries:          3,
    retry_interval:       1,
    status:               "active",
  },
  token
);
const offerId2      = offer2.id;
const checkoutUrl2  = `${CHECKOUT_BASE}/${offerId2}`;
console.log(`   offer_id:    ${offerId2}`);
console.log(`   checkout:    ${checkoutUrl2}`);

// ─── 4. Produto — Plano 3 ────────────────────────────────────────────────────
step("4. Criar produto — Plano 3");
const prod3 = await caktoPost(
  "/public_api/products/",
  {
    name: "PixelPage Chat — Plano 3",
    description:
      "API Oficial Meta: número verificado, templates aprovados, campanhas sem risco de ban.",
    type: "subscription",
  },
  token
);
const productId3 = prod3.id;
console.log(`   product_id: ${productId3}`);

// ─── 5. Oferta — Plano 3 ─────────────────────────────────────────────────────
step("5. Criar oferta — Plano 3 (R$10/mês, 3 dias grátis)");
const offer3 = await caktoPost(
  "/public_api/offers/",
  {
    name:                 "Plano 3 — Mensal",
    price:                10.00,
    product:              productId3,
    type:                 "subscription",
    intervalType:         "month",
    interval:             1,
    recurrence_period:    30,
    quantity_recurrences: -1,
    trial_days:           3,
    max_retries:          3,
    retry_interval:       1,
    status:               "active",
  },
  token
);
const offerId3     = offer3.id;
const checkoutUrl3 = `${CHECKOUT_BASE}/${offerId3}`;
console.log(`   offer_id:    ${offerId3}`);
console.log(`   checkout:    ${checkoutUrl3}`);

// ─── 6. Webhook ──────────────────────────────────────────────────────────────
step("6. Criar webhook");
const webhook = await caktoPost(
  "/public_api/webhook/",
  {
    name:     "PixelPage Chat — Eventos",
    url:      WEBHOOK_URL,
    products: [productId2, productId3],
    events: [
      "subscription_created",
      "subscription_renewed",
      "subscription_canceled",
      "subscription_renewal_refused",
      "purchase_approved",
      "refund",
      "chargeback",
    ],
  },
  token
);
const webhookId     = webhook.id ?? "(ver resposta acima)";
const webhookSecret = webhook.fields?.secret ?? webhook.secret ?? "(não retornado — verifique no dashboard da Cakto)";
console.log(`   webhook_id: ${webhookId}`);
console.log(`   secret:     [SALVE ESTE VALOR — veja resumo final]`);

// ─── 7. Atualizar Supabase ───────────────────────────────────────────────────
step("7. Atualizando cakto_checkout_url nos planos do Supabase");

const { error: e2 } = await supabase
  .from("plans")
  .update({ cakto_checkout_url: checkoutUrl2 })
  .eq("name", "Plano 2");
if (e2) console.error("❌ Plano 2:", e2.message);
else    console.log("✅ Plano 2 atualizado.");

const { error: e3 } = await supabase
  .from("plans")
  .update({ cakto_checkout_url: checkoutUrl3 })
  .eq("name", "Plano 3");
if (e3) console.error("❌ Plano 3:", e3.message);
else    console.log("✅ Plano 3 atualizado.");

// ─── Resumo ───────────────────────────────────────────────────────────────────
const EQ = "═".repeat(60);
console.log(`
${EQ}
RESUMO FINAL
${EQ}

Plano 2:
  product_id:  ${productId2}
  offer_id:    ${offerId2}
  checkout:    ${checkoutUrl2}

Plano 3:
  product_id:  ${productId3}
  offer_id:    ${offerId3}
  checkout:    ${checkoutUrl3}

Webhook:
  id:          ${webhookId}
  secret:      ${webhookSecret}

⚠️  PRÓXIMO PASSO OBRIGATÓRIO:
    Adicione na Vercel (Settings → Environment Variables):

    CAKTO_WEBHOOK_SECRET=${webhookSecret}

    NUNCA commite este valor em código ou .env.local.
${EQ}
`);
