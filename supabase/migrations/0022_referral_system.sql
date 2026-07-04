-- ============================================================
-- 0022 — Sistema de Indicações / Afiliados
-- Modelo de recompensa por marco (não por centavos fixos)
-- ============================================================

-- 1. referral_links: um link por org (criado no primeiro acesso ao dashboard)
CREATE TABLE IF NOT EXISTS public.referral_links (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code       text        NOT NULL UNIQUE,
  enabled    boolean     NOT NULL DEFAULT true,
  clicks     integer     NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id)  -- uma org tem apenas um link ativo por vez
);

-- 2. referrals: relação referenciador → referenciado (1 por org referenciada)
CREATE TABLE IF NOT EXISTS public.referrals (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_org_id  uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  referred_org_id  uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  link_id          uuid        NOT NULL REFERENCES public.referral_links(id),
  status           text        NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'activated', 'rewarded', 'canceled')),
  -- pending   → org referenciada criou conta, ainda sem plano pago
  -- activated → webhook subscription_created chegou (plano pago ativo)
  -- rewarded  → recompensa aplicada pelo Super Admin
  -- canceled  → fraude, estorno ou cancelamento precoce
  activated_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (referred_org_id)  -- cada org só pode ter sido indicada uma vez
);

-- 3. referral_rewards: recompensas por marco, pendentes de aplicação manual
--    Marcos disponíveis: 3 → 20% OFF | 7 → 50% OFF | 10 → 1 mês grátis | 20 → 6 meses grátis
CREATE TABLE IF NOT EXISTS public.referral_rewards (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id uuid        NOT NULL REFERENCES public.referrals(id) ON DELETE CASCADE,
  org_id      uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  reward_type text        NOT NULL
              CHECK (reward_type IN ('discount_20', 'discount_50', 'free_month', 'free_6months')),
  milestone   integer     NOT NULL
              CHECK (milestone IN (3, 7, 10, 20)),
  status      text        NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'applied', 'expired')),
  expires_at  timestamptz,  -- null = sem prazo; preenchido em 60 dias na criação
  notes       text,         -- observações do admin na aplicação
  applied_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, milestone)  -- cada marco só é concedido uma vez por org
);

-- 4. referral_notifications: notificações in-app do sistema de indicações
CREATE TABLE IF NOT EXISTS public.referral_notifications (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type        text        NOT NULL
              CHECK (type IN ('referral_pending', 'referral_activated', 'reward_ready', 'reward_applied')),
  referral_id uuid        REFERENCES public.referrals(id) ON DELETE CASCADE,
  read        boolean     NOT NULL DEFAULT false,
  data        jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Índices para consultas frequentes
CREATE INDEX IF NOT EXISTS referral_links_org_id_idx
  ON public.referral_links(org_id);

CREATE INDEX IF NOT EXISTS referrals_referrer_org_id_idx
  ON public.referrals(referrer_org_id);

CREATE INDEX IF NOT EXISTS referrals_status_idx
  ON public.referrals(status);

CREATE INDEX IF NOT EXISTS referrals_referred_org_id_idx
  ON public.referrals(referred_org_id);

CREATE INDEX IF NOT EXISTS referral_rewards_org_id_idx
  ON public.referral_rewards(org_id);

CREATE INDEX IF NOT EXISTS referral_rewards_status_expires_idx
  ON public.referral_rewards(status, expires_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS referral_notifications_org_read_idx
  ON public.referral_notifications(org_id, read);

-- RLS
ALTER TABLE public.referral_links          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_rewards        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_notifications  ENABLE ROW LEVEL SECURITY;

-- referral_links: membros da org lêem; owner/admin gerenciam
CREATE POLICY "rl_select" ON public.referral_links FOR SELECT
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "rl_insert" ON public.referral_links FOR INSERT
  WITH CHECK (org_id IN (
    SELECT org_id FROM public.profiles
    WHERE id = auth.uid() AND role IN ('owner', 'admin')
  ));

CREATE POLICY "rl_update" ON public.referral_links FOR UPDATE
  USING (org_id IN (
    SELECT org_id FROM public.profiles
    WHERE id = auth.uid() AND role IN ('owner', 'admin')
  ));

-- referrals: referenciador vê suas indicações
CREATE POLICY "ref_select" ON public.referrals FOR SELECT
  USING (referrer_org_id IN (
    SELECT org_id FROM public.profiles WHERE id = auth.uid()
  ));

-- referral_rewards: org beneficiária vê suas recompensas
CREATE POLICY "rr_select" ON public.referral_rewards FOR SELECT
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "rr_update" ON public.referral_rewards FOR UPDATE
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- referral_notifications: org vê e atualiza suas notificações
CREATE POLICY "rn_select" ON public.referral_notifications FOR SELECT
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "rn_update" ON public.referral_notifications FOR UPDATE
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));
