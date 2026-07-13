-- Preços dos modelos GPT-5.6 (OpenAI), lançados em 2026-07, para uso managed
-- (além do BYOK que já existia). Mesmo padrão de 0027_ai_usage_tracking.sql.
insert into public.ai_model_pricing (model, provider, input_per_mtok, output_per_mtok) values
  ('gpt-5.6-luna', 'openai', 1.00, 6.00),
  ('gpt-5.6-terra', 'openai', 2.50, 15.00);
