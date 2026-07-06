-- ============================================================================
-- 0028: BYOK (bring-your-own-key) de IA por organização + segurança do n8n.
-- Adiciona: organizations.ai_mode/ai_provider/ai_byok_verified_at, tabela
-- org_secrets (segredos cifrados, isolados, sem policy para authenticated),
-- RPC get_org_secrets_status (status seguro, nunca expõe o valor cifrado),
-- ai_usage_logs.is_byok (uso BYOK não conta custo pra plataforma) e
-- record_ai_usage estendida com p_is_byok (default false). NOTA: isso NÃO
-- preserva o OID/ACL da versão de 10 argumentos (0027) — troca de assinatura
-- (aridade) sempre cria um objeto de função novo em Postgres; ver comentário
-- detalhado antes do `drop function` abaixo.
-- ============================================================================

-- Modo de IA por organização: usar a chave/modelo gerenciado da plataforma,
-- usar a própria chave do cliente (BYOK), ou desligar respostas automáticas.
alter table public.organizations
  add column ai_mode text not null default 'managed' check (ai_mode in ('managed', 'byok', 'disabled')),
  add column ai_provider text check (ai_provider in ('anthropic', 'openai')),
  add column ai_byok_verified_at timestamptz;

-- Segredos por organização (chave de IA do cliente, chave de auth do n8n do cliente) —
-- SEMPRE cifrados (ver lib/crypto.ts), NUNCA em texto puro. Tabela isolada e sem
-- nenhuma policy para `authenticated`: só service_role acessa diretamente; leituras
-- de status (existe chave? quando foi verificada?) passam pela RPC abaixo, que
-- nunca retorna o valor cifrado, só booleanos/timestamps.
create table public.org_secrets (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  ai_byok_key_encrypted text,
  n8n_api_key_encrypted text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.org_secrets enable row level security;
-- Nenhuma policy para authenticated/anon — só service_role (bypassa RLS) e a RPC abaixo.

-- Status seguro para o cliente: nunca expõe o valor cifrado, só se existe + quando foi verificado.
create or replace function public.get_org_secrets_status(p_org_id uuid)
returns table (has_ai_key boolean, has_n8n_key boolean)
language plpgsql security definer set search_path = public
as $$
begin
  if not (p_org_id = public.auth_org_id() or public.is_admin()) then
    raise exception 'Não autorizado';
  end if;
  return query
    select
      coalesce((select ai_byok_key_encrypted is not null from public.org_secrets where org_id = p_org_id), false),
      coalesce((select n8n_api_key_encrypted is not null from public.org_secrets where org_id = p_org_id), false);
end;
$$;
grant execute on function public.get_org_secrets_status(uuid) to authenticated;

-- Extensão de ai_usage_logs: distingue uso BYOK (custo do cliente, cost_usd=0/null,
-- não conta para o teto do plano) de uso gerenciado (custo nosso, já rastreado).
alter table public.ai_usage_logs
  add column is_byok boolean not null default false;

-- IMPORTANTE — verificado, NÃO assumido: `create or replace function` só substitui
-- (preserva OID/ACL) quando a lista de TIPOS de argumentos é idêntica. Acrescentar
-- p_is_byok muda a assinatura de 10 para 11 tipos, então `create or replace` aqui
-- NÃO substituiria a função da 0027 — criaria uma segunda função sobrecarregada
-- (mesmo nome, aridade diferente) coexistindo com a antiga. Pior: como p_is_byok
-- tem DEFAULT, uma chamada com os 10 argumentos originais passaria a bater em
-- AMBAS as candidatas (a antiga de 10 params, exata; e a nova de 11 params, via
-- default) — isso é uma ambiguidade documentada do Postgres com argumentos
-- default (create function foo(int); create function foo(int, int default 1);
-- foo(1) => "function foo(integer) is not unique"). Por isso removemos a função
-- antiga explicitamente ANTES do create or replace, e reemitimos os grants na
-- assinatura NOVA (que é, de fato, um objeto/OID novo, não uma preservação).
drop function if exists public.record_ai_usage(uuid, uuid, uuid, text, text, integer, integer, numeric, integer, text);

create or replace function public.record_ai_usage(
  p_org_id uuid,
  p_agent_id uuid,
  p_conversation_id uuid,
  p_provider text,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_cost_usd numeric,
  p_response_time_ms integer,
  p_source text,
  p_is_byok boolean default false
) returns table (
  previous_status text,
  new_status text,
  total_ai_cost_usd numeric,
  plan_limit_ai_cost_usd numeric
)
language plpgsql security definer set search_path = public
as $$
declare
  v_month date := date_trunc('month', now())::date;
  v_limit numeric;
  v_prev_status text;
  v_new_total numeric;
  v_new_status text;
begin
  insert into public.ai_usage_logs
    (org_id, agent_id, conversation_id, provider, model, input_tokens, output_tokens, cost_usd, response_time_ms, source, is_byok)
  values
    (p_org_id, p_agent_id, p_conversation_id, p_provider, p_model, p_input_tokens, p_output_tokens, p_cost_usd, p_response_time_ms, p_source, p_is_byok);

  select coalesce(p.max_ai_cost_usd_monthly, 0) into v_limit
  from public.subscriptions s join public.plans p on p.id = s.plan_id
  where s.org_id = p_org_id;
  v_limit := coalesce(v_limit, 0);

  select status into v_prev_status from public.org_usage_monthly where org_id = p_org_id and month = v_month;
  v_prev_status := coalesce(v_prev_status, 'ok');

  insert into public.org_usage_monthly as oum
    (org_id, month, total_messages, total_ai_messages, total_ai_cost_usd, plan_limit_ai_cost_usd, status)
  values
    (p_org_id, v_month, 1, 1, p_cost_usd, v_limit, 'ok')
  on conflict (org_id, month) do update
    set total_messages    = oum.total_messages + 1,
        total_ai_messages = oum.total_ai_messages + 1,
        total_ai_cost_usd = oum.total_ai_cost_usd + p_cost_usd,
        plan_limit_ai_cost_usd = v_limit,
        updated_at = now()
  returning oum.total_ai_cost_usd into v_new_total;

  v_new_status := case
    when v_limit > 0 and v_new_total >= v_limit then 'blocked'
    when v_limit > 0 and v_new_total >= v_limit * 0.8 then 'warning'
    else 'ok'
  end;

  if v_new_status is distinct from v_prev_status then
    update public.org_usage_monthly set status = v_new_status where org_id = p_org_id and month = v_month;
  end if;

  return query select v_prev_status, v_new_status, v_new_total, v_limit;
end;
$$;

-- Grants explícitos na assinatura NOVA de 11 argumentos — este é um objeto de
-- função distinto do original (ver nota acima), então precisa dos seus próprios
-- grants; não há ACL herdada de 0027 para preservar aqui.
revoke execute on function public.record_ai_usage(uuid, uuid, uuid, text, text, integer, integer, numeric, integer, text, boolean) from public, anon, authenticated;
grant execute on function public.record_ai_usage(uuid, uuid, uuid, text, text, integer, integer, numeric, integer, text, boolean) to service_role;
