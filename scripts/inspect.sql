select
  t.tablename,
  (select count(*) from pg_attribute a
    where a.attrelid = (quote_ident(t.schemaname) || '.' || quote_ident(t.tablename))::regclass
      and a.attnum > 0 and not a.attisdropped) as colunas,
  (xpath('/row/cnt/text()',
    query_to_xml('select count(*) as cnt from ' || quote_ident(t.schemaname) || '.' || quote_ident(t.tablename), false, true, '')
  ))[1]::text::bigint as linhas
from pg_tables t
where t.schemaname = 'public'
order by t.tablename;
