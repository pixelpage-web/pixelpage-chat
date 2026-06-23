select
  (select count(*) from pg_tables where schemaname = 'public') as tabelas,
  (select count(*) from pg_policies where schemaname = 'public') as policies_rls,
  (select count(*) from public.plans) as planos,
  (select string_agg(name, ', ' order by ai_messages_limit) from public.plans) as nomes_planos,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
    and p.proname in ('create_organization','increment_ai_usage','mark_conversation_read','auth_org_id','auth_role','is_admin')) as funcoes,
  (select count(*) from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public') as tabelas_realtime;
