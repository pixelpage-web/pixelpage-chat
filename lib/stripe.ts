import Stripe from "stripe";

/**
 * Client Stripe — mesma função no ecossistema de billing que
 * lib/cakto-payments.ts tem pro lado Cakto. Diferença: a Stripe já
 * autentica por API key direto (sem dança de OAuth client_credentials como
 * a Cakto), então o "cache" aqui é só a instância do SDK, não um token.
 */

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

let _client: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (_client) return _client;
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY não configurada");
  }
  _client = new Stripe(process.env.STRIPE_SECRET_KEY);
  return _client;
}
