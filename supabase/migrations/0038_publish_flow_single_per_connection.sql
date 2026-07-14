-- Garante no máximo 1 fluxo published por conexão (ou por "global",
-- connection_id null): ao publicar, despublica os demais já published da
-- mesma conexão na mesma transação. Antes disso, publicar dois fluxos pra
-- mesma conexão era possível e não-determinístico (idx_flows_connection não
-- é único, e a query em lib/flow-runner.ts não tem ORDER BY).
--
-- SECURITY INVOKER (padrão): roda como o chamador, RLS de "flows: membros
-- tudo" continua valendo normalmente nas duas atualizações abaixo.
create or replace function public.publish_flow(
  p_flow_id uuid,
  p_name text,
  p_canvas_data jsonb
)
returns public.flows
language plpgsql
as $$
declare
  v_connection_id uuid;
  v_result public.flows;
begin
  select connection_id into v_connection_id from public.flows where id = p_flow_id;

  update public.flows
     set status = 'draft', updated_at = now()
   where status = 'published'
     and id <> p_flow_id
     and connection_id is not distinct from v_connection_id;

  update public.flows
     set name = p_name,
         status = 'published',
         canvas_data = p_canvas_data,
         updated_at = now()
   where id = p_flow_id
  returning * into v_result;

  return v_result;
end;
$$;
