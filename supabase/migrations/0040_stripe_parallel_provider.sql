-- Integração Stripe em paralelo à Cakto — Cakto continua o provider padrão
-- e intacto. Aditivo, sem migração de dado: payment_provider default 'cakto'
-- preenche todas as linhas existentes automaticamente.

alter table public.subscriptions
  add column if not exists payment_provider text not null default 'cakto'
    check (payment_provider in ('cakto', 'stripe')),
  add column if not exists stripe_subscription_id text;

alter table public.plans
  add column if not exists stripe_price_id text;
