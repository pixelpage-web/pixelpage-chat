select
  (select count(*) from pg_attribute a
    where a.attrelid = 'public.suggestions'::regclass
      and a.attnum > 0 and not a.attisdropped) as colunas,
  (select relrowsecurity from pg_class where oid = 'public.suggestions'::regclass) as rls_ativo,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'suggestions') as policies,
  (select count(*) from pg_indexes
    where schemaname = 'public' and tablename = 'suggestions') as indices,
  (select count(*) from public.suggestions) as linhas;
