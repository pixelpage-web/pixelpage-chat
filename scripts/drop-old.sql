-- Remove tabelas vazias de um teste anterior (0 linhas em todas — verificado
-- em 10/06/2026 antes da migração da Zari API)
drop table if exists public.memories cascade;
drop table if exists public.messages cascade;
drop table if exists public.reminders cascade;
drop table if exists public.users cascade;
