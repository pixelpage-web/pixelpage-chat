-- 0023 — soft-delete para tickets de suporte e indicações
-- Nunca DELETE físico — admin sempre usa deleted_at

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
