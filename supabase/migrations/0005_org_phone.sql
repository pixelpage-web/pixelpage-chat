-- Telefone de contato da empresa (passo 1 do onboarding v2)
alter table public.organizations add column if not exists phone text;
