-- Corrige divergência real entre schema e código em referral_rewards: a
-- tabela em produção foi criada fora do fluxo de migrations rastreadas (não
-- aparecia em list_migrations) com um modelo diferente (amount_cents,
-- scratch_card_revealed, scratch_card_amount_cents, reward_type em
-- 'discount'/'credits'/'scratch_card') — sem nenhum código usando esse
-- modelo em lugar nenhum do repo. O app inteiro (lib/referral.ts,
-- app/api/admin/referrals/route.ts, app/app/(shell)/indicacoes/page.tsx)
-- já está construído em cima do modelo de marcos (milestone/expires_at),
-- exatamente como supabase/migrations/0022_referral_system.sql:36-51
-- define. Restaura esse shape sem apagar as colunas novas (tabela está
-- vazia — 0 linhas — confirmado antes de aplicar, sem risco de dado).

alter table public.referral_rewards
  add column if not exists milestone integer,
  add column if not exists expires_at timestamptz;

alter table public.referral_rewards
  alter column milestone set not null;

alter table public.referral_rewards
  drop constraint if exists referral_rewards_milestone_check;
alter table public.referral_rewards
  add constraint referral_rewards_milestone_check check (milestone in (3, 7, 10, 20));

alter table public.referral_rewards
  drop constraint if exists referral_rewards_org_milestone_key;
alter table public.referral_rewards
  add constraint referral_rewards_org_milestone_key unique (org_id, milestone);

-- reward_type: CHECK vivo hoje é do modelo novo (discount/credits/scratch_card),
-- não bate com os valores reais que lib/referral.ts insere.
alter table public.referral_rewards
  drop constraint if exists referral_rewards_reward_type_check;
alter table public.referral_rewards
  add constraint referral_rewards_reward_type_check
  check (reward_type in ('discount_20', 'discount_50', 'free_month', 'free_6months'));

create index if not exists referral_rewards_status_expires_idx
  on public.referral_rewards(status, expires_at)
  where status = 'pending';

notify pgrst, 'reload schema';
