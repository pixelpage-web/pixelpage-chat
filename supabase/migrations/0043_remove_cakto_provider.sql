-- Remove a integração Cakto do sistema de cobrança — Stripe passa a ser o
-- único provider. A coluna payment_provider é mantida (histórico), assim
-- como cakto_subscription_id (rastro de quem já foi Cakto) — só o CHECK
-- fica mais restrito e cakto_checkout_url (não usado por mais nada) sai.
--
-- NOT VALID: não revalida linhas já existentes contra o novo CHECK — pode
-- haver assinaturas históricas (não ativas) ainda com payment_provider=
-- 'cakto', preservadas como estão, sem reescrever dado histórico.

do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.subscriptions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%payment_provider%'
  loop
    execute format('alter table public.subscriptions drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.subscriptions
  add constraint subscriptions_payment_provider_check
    check (payment_provider = 'stripe') not valid;

alter table public.plans
  drop column if exists cakto_checkout_url;
