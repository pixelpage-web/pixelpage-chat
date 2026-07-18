import Stripe from "stripe";

/**
 * Client Stripe — autentica por API key direto, então o "cache" aqui é só
 * a instância do SDK.
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
