-- ==============================================================================
-- ZARI API — Seed de planos
-- Preços em centavos (0 = a definir). team_limit null = equipe ilimitada.
-- Webhook n8n é ilimitado em todos os planos (diferencial competitivo) —
-- somente o Bot IA nativo consome o saldo de mensagens IA.
-- ==============================================================================

insert into public.plans (name, price_cents, ai_messages_limit, connections_limit, team_limit, features, active)
values
  (
    'Trial',
    0,
    100,
    1,
    1,
    '{"webhook_n8n": true, "api_publica": true, "bot_ia": true, "trial_days": 7}'::jsonb,
    true
  ),
  (
    'Starter',
    0,
    1000,
    1,
    2,
    '{"webhook_n8n": true, "api_publica": true, "bot_ia": true}'::jsonb,
    true
  ),
  (
    'Pro',
    0,
    5000,
    2,
    5,
    '{"webhook_n8n": true, "api_publica": true, "bot_ia": true}'::jsonb,
    true
  ),
  (
    'Business',
    0,
    20000,
    5,
    null,
    '{"webhook_n8n": true, "api_publica": true, "bot_ia": true, "suporte_prioritario": true}'::jsonb,
    true
  )
on conflict (name) do nothing;
