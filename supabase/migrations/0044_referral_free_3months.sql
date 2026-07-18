-- Troca o marco de 20 indicações de free_6months para free_3months.
-- Verificado antes de aplicar: zero linhas existentes em referral_rewards
-- com reward_type='free_6months' — troca limpa, sem NOT VALID.

alter table public.referral_rewards
  drop constraint if exists referral_rewards_reward_type_check;

alter table public.referral_rewards
  add constraint referral_rewards_reward_type_check
  check (reward_type in ('discount_20', 'discount_50', 'free_month', 'free_3months'));
