-- Migração 0020 — remover colunas legadas do Asaas na tabela subscriptions
-- Gateway Asaas substituído pelo Cakto (checkout externo, sem colunas de cliente).
--
-- ⚠️  NÃO APLICAR enquanto houver dados em uso nessas colunas.
--     Aplique somente após confirmar que asaas_customer_id e asaas_subscription_id
--     estão NULL (ou sem referências ativas) em todas as linhas.
--
-- Após aplicar: atualizar SubscriptionRow em types/database.ts (remover os campos).

ALTER TABLE public.subscriptions DROP COLUMN IF EXISTS asaas_customer_id;
ALTER TABLE public.subscriptions DROP COLUMN IF EXISTS asaas_subscription_id;
