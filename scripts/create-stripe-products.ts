/**
 * Setup Stripe — cria produtos + preços recorrentes (BRL) pros planos
 * Starter e Pro, e grava o price_id retornado direto em plans.stripe_price_id.
 * Espelha scripts/setup-cakto.mjs, adaptado pro SDK da Stripe.
 *
 * Uso (Node 24+, roda .ts nativo sem precisar de build):
 *   node --env-file=.env.local scripts/create-stripe-products.ts
 *
 * Variável necessária em .env.local (cole a chave antes de rodar):
 *   STRIPE_SECRET_KEY=sk_...
 *
 * Já disponíveis em .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...
 */

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const CURRENCY = "brl";

// ─── Validar env vars ────────────────────────────────────────────────────────
const required = ["STRIPE_SECRET_KEY", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
for (const k of required) {
  if (!process.env[k]) {
    console.error(`\nERRO: variável ${k} não encontrada em .env.local`);
    console.error("Adicione-a e execute novamente.\n");
    process.exit(1);
  }
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Helpers ─────────────────────────────────────────────────────────────────
const SEP = "─".repeat(60);
function step(label: string) {
  console.log(`\n${SEP}\n[${label}]`);
}

interface PlanTarget {
  dbName: string; // plans.name no nosso banco
  stripeName: string; // nome do produto na Stripe
  description: string;
}

const TARGETS: PlanTarget[] = [
  {
    dbName: "Starter",
    stripeName: "PixelPage Chat — Starter",
    description: "WhatsApp automatizado: conexão QR Code, 1.500 mensagens IA/mês.",
  },
  {
    dbName: "Pro",
    stripeName: "PixelPage Chat — Pro",
    description:
      "Conexões ilimitadas + API Oficial Meta, 5.000 mensagens IA/mês.",
  },
];

async function createProductAndPrice(target: PlanTarget): Promise<{
  productId: string;
  priceId: string;
  priceCents: number;
}> {
  // Busca o preço atual no nosso banco — fonte da verdade é plans.price_cents,
  // não um valor hardcoded aqui.
  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("id, price_cents")
    .eq("name", target.dbName)
    .maybeSingle();

  if (planError || !plan) {
    throw new Error(
      `Plano "${target.dbName}" não encontrado no banco (${planError?.message ?? "sem dados"})`
    );
  }
  if (!plan.price_cents || plan.price_cents <= 0) {
    throw new Error(
      `Plano "${target.dbName}" com price_cents inválido (${plan.price_cents}) — corrija no banco antes de rodar.`
    );
  }

  const product = await stripe.products.create({
    name: target.stripeName,
    description: target.description,
  });
  console.log(`   product_id: ${product.id}`);

  let price: Stripe.Price;
  try {
    price = await stripe.prices.create({
      product: product.id,
      currency: CURRENCY,
      unit_amount: plan.price_cents,
      recurring: { interval: "month" },
    });
  } catch (err) {
    // Requisito explícito: se moeda 'brl' falhar (conta não habilitada pra
    // BRL), reportar o erro exato ANTES de tentar qualquer fallback — não
    // tenta silenciosamente outra moeda.
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ Falha ao criar price em ${CURRENCY.toUpperCase()} pro produto "${target.stripeName}":`);
    console.error(`   ${message}`);
    console.error(
      `\n   Produto ${product.id} já foi criado na Stripe antes do erro do price — verifique/limpe manualmente no dashboard se necessário.\n`
    );
    throw err;
  }
  console.log(`   price_id:   ${price.id}`);
  console.log(`   valor:      ${(plan.price_cents / 100).toFixed(2)} ${CURRENCY.toUpperCase()}/mês`);

  const { error: updateError } = await supabase
    .from("plans")
    .update({ stripe_price_id: price.id })
    .eq("id", plan.id);

  if (updateError) {
    throw new Error(
      `Produto/price criados na Stripe (${price.id}), mas falhou ao gravar em plans.stripe_price_id: ${updateError.message}`
    );
  }
  console.log(`   ✅ plans.stripe_price_id gravado (plano "${target.dbName}")`);

  return { productId: product.id, priceId: price.id, priceCents: plan.price_cents };
}

// ─── Execução ──────────────────────────────────────────────────────────────
const results: Record<string, { productId: string; priceId: string; priceCents: number }> = {};

for (const target of TARGETS) {
  step(`Criar produto + price — ${target.dbName}`);
  results[target.dbName] = await createProductAndPrice(target);
}

// ─── Resumo ───────────────────────────────────────────────────────────────────
const EQ = "═".repeat(60);
let summary = `\n${EQ}\nRESUMO FINAL\n${EQ}\n`;
for (const target of TARGETS) {
  const r = results[target.dbName];
  summary += `\n${target.dbName}:\n  product_id: ${r.productId}\n  price_id:   ${r.priceId}\n  valor:      ${(r.priceCents / 100).toFixed(2)} ${CURRENCY.toUpperCase()}/mês\n`;
}
summary += `\n${EQ}\n`;
console.log(summary);
