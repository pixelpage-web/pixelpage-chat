-- Migração 0021 — identificador da assinatura Cakto em subscriptions.
-- Permite rastrear renovações e cancelamentos pelo ID único de assinatura
-- da Cakto (data.subscription.id no payload do webhook), não apenas por org_id.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS cakto_subscription_id text;
