-- ==============================================================================
-- Migração 0019 — Planos Cakto
--
-- 1. connections_limit passa a ser nullable (null = ilimitado)
-- 2. Adiciona cakto_checkout_url na tabela plans
-- 3. Arquiva planos legados (Trial, Starter, Pro, Business) — mantém as linhas
--    para não quebrar assinaturas existentes que referenciam esses plan_ids
-- 4. Faz upsert dos 3 planos reais (Grátis, Plano 2, Plano 3)
-- 5. Atualiza create_organization: novos usuários entram no plano Grátis (active)
-- ==============================================================================

-- 1. connections_limit nullable
ALTER TABLE public.plans ALTER COLUMN connections_limit DROP NOT NULL;

-- 2. checkout URL por plano (preenchido após executar scripts/setup-cakto.mjs)
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS cakto_checkout_url text;

-- 3. Arquivar planos legados
UPDATE public.plans SET active = false WHERE name IN ('Trial', 'Starter', 'Pro', 'Business');

-- 4. Upsert dos 3 planos reais
INSERT INTO public.plans (
  name, price_cents, ai_messages_limit, connections_limit,
  team_limit, campaigns_limit, highlight, sort_order, features, active
)
VALUES
  (
    'Grátis', 0, 0, 1, 1, 0, false, 0,
    '{"meta_api_enabled": false}'::jsonb,
    true
  ),
  (
    'Plano 2', 500, 500, NULL, 3, NULL, false, 1,
    '{"meta_api_enabled": false, "trial_days": 3}'::jsonb,
    true
  ),
  (
    'Plano 3', 1000, 2000, NULL, 7, NULL, true, 2,
    '{"meta_api_enabled": true, "trial_days": 3}'::jsonb,
    true
  )
ON CONFLICT (name) DO UPDATE SET
  price_cents       = EXCLUDED.price_cents,
  ai_messages_limit = EXCLUDED.ai_messages_limit,
  connections_limit = EXCLUDED.connections_limit,
  team_limit        = EXCLUDED.team_limit,
  campaigns_limit   = EXCLUDED.campaigns_limit,
  highlight         = EXCLUDED.highlight,
  sort_order        = EXCLUDED.sort_order,
  features          = EXCLUDED.features,
  active            = EXCLUDED.active;

-- 5. Novos usuários entram no plano Grátis (status active, sem trial_ends_at)
CREATE OR REPLACE FUNCTION public.create_organization(p_name text, p_slug text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org  uuid;
  v_plan uuid;
  v_slug text;
  v_user_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND org_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Usuário já pertence a uma organização';
  END IF;

  v_slug := left(coalesce(nullif(p_slug, ''), 'org'), 40)
            || '-' || substr(md5(random()::text), 1, 6);

  INSERT INTO public.organizations (name, slug, owner_id)
  VALUES (p_name, v_slug, auth.uid())
  RETURNING id INTO v_org;

  v_user_name := coalesce(
    (SELECT raw_user_meta_data ->> 'name'      FROM auth.users WHERE id = auth.uid()),
    (SELECT raw_user_meta_data ->> 'full_name'  FROM auth.users WHERE id = auth.uid()),
    split_part((SELECT email FROM auth.users WHERE id = auth.uid()), '@', 1)
  );

  INSERT INTO public.profiles (id, org_id, role, name)
  VALUES (auth.uid(), v_org, 'owner', coalesce(v_user_name, ''))
  ON CONFLICT (id) DO UPDATE
    SET org_id = EXCLUDED.org_id,
        role   = CASE WHEN public.profiles.role = 'admin' THEN 'admin' ELSE 'owner' END;

  -- Plano Grátis (permanente, sem expiração de trial)
  SELECT id INTO v_plan FROM public.plans WHERE name = 'Grátis' AND active = true LIMIT 1;
  IF v_plan IS NOT NULL THEN
    INSERT INTO public.subscriptions (org_id, plan_id, status, trial_ends_at)
    VALUES (v_org, v_plan, 'active', NULL);
  END IF;

  INSERT INTO public.audit_logs (org_id, actor_id, action, metadata)
  VALUES (v_org, auth.uid(), 'organization.created', jsonb_build_object('name', p_name));

  RETURN v_org;
END;
$$;
