-- ============================================================================
-- 0027: Rastreamento de custo real de IA + proteção de margem por org.
-- Cria: ai_model_pricing, ai_usage_logs, org_usage_monthly, RPCs
-- record_ai_usage/get_org_usage_status, e estende plans com teto de custo +
-- allow_official_api (promovido de features->>'meta_api_enabled').
-- ============================================================================

-- Preços por modelo, configurável (nunca hardcoded) — Super Admin pode editar via SQL por ora.
create table public.ai_model_pricing (
  model text primary key,
  provider text not null default 'anthropic',
  input_per_mtok numeric(10,4) not null,
  output_per_mtok numeric(10,4) not null,
  updated_at timestamptz not null default now()
);
-- Preços atuais (2026-07-05, tabela oficial Anthropic). Sonnet 5 usa o preço promocional
-- vigente até 2026-08-31 ($2/$10) — atualizar para $3/$15 após essa data.
-- Não sabemos com certeza qual CLAUDE_MODEL está configurado em produção (só confirmamos
-- que admin_settings não tem override — pode estar valendo o default 'claude-haiku-4-5' do
-- código ou um valor customizado na env var), então semeamos os 4 modelos atuais.
insert into public.ai_model_pricing (model, input_per_mtok, output_per_mtok) values
  ('claude-haiku-4-5', 1, 5),
  ('claude-sonnet-5', 2, 10),
  ('claude-opus-4-8', 5, 25),
  ('claude-fable-5', 10, 50);

alter table public.ai_model_pricing enable row level security;
create policy "ai_model_pricing: autenticados leem" on public.ai_model_pricing
  for select using (auth.uid() is not null);
-- sem policy de escrita para authenticated — editar via service role/SQL direto por ora

-- Log granular de cada chamada de IA que gera uma resposta (bot, flow, resumo, nota).
create table public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  provider text not null default 'anthropic',
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(10,6) not null default 0,
  response_time_ms integer,
  source text not null default 'bot_reply', -- 'bot_reply' | 'flow' | 'summary' | 'ai_note' | 'simulate'
  created_at timestamptz not null default now()
);
create index idx_ai_usage_logs_org_month on public.ai_usage_logs (org_id, created_at);

alter table public.ai_usage_logs enable row level security;
create policy "ai_usage_logs: membros leem" on public.ai_usage_logs
  for select using (org_id = public.auth_org_id() or public.is_admin());
-- sem insert/update/delete para authenticated — só via RPC abaixo (security definer)

-- Rollup mensal por org — é contra isso que o limite do plano é comparado.
create table public.org_usage_monthly (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  month date not null, -- sempre o dia 1 do mês (date_trunc('month', now())::date)
  total_messages integer not null default 0,
  total_ai_messages integer not null default 0,
  total_human_messages integer not null default 0,
  total_ai_cost_usd numeric(10,4) not null default 0,
  plan_limit_messages integer,
  plan_limit_ai_cost_usd numeric(10,4),
  status text not null default 'ok', -- 'ok' | 'warning' | 'exceeded' | 'blocked'
  updated_at timestamptz not null default now(),
  unique (org_id, month)
);

alter table public.org_usage_monthly enable row level security;
create policy "org_usage_monthly: membros leem" on public.org_usage_monthly
  for select using (org_id = public.auth_org_id() or public.is_admin());
-- sem insert/update/delete para authenticated — só via RPC abaixo (security definer)

-- Extensão de plans: teto de custo real + flag de API oficial promovida a coluna de 1ª classe.
alter table public.plans
  add column max_ai_cost_usd_monthly numeric(10,4), -- null = sem teto (comportamento atual preservado até o Super Admin configurar)
  add column allow_official_api boolean not null default false;

update public.plans set allow_official_api = coalesce((features->>'meta_api_enabled')::boolean, false);

-- RPC central: registra 1 evento de uso de IA + atualiza o rollup mensal + retorna status
-- anterior e novo (pro chamador decidir se precisa notificar por causa de uma transição de faixa).
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
  p_source text
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
    (org_id, agent_id, conversation_id, provider, model, input_tokens, output_tokens, cost_usd, response_time_ms, source)
  values
    (p_org_id, p_agent_id, p_conversation_id, p_provider, p_model, p_input_tokens, p_output_tokens, p_cost_usd, p_response_time_ms, p_source);

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

revoke execute on function public.record_ai_usage(uuid, uuid, uuid, text, text, integer, integer, numeric, integer, text) from public, anon, authenticated;
grant execute on function public.record_ai_usage(uuid, uuid, uuid, text, text, integer, integer, numeric, integer, text) to service_role;

-- Leitura barata do status atual (para o gate ANTES de chamar a IA — evita gastar em chamadas bloqueadas).
create or replace function public.get_org_usage_status(p_org_id uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select status from public.org_usage_monthly where org_id = p_org_id and month = date_trunc('month', now())::date),
    'ok'
  );
$$;
revoke execute on function public.get_org_usage_status(uuid) from public, anon;
grant execute on function public.get_org_usage_status(uuid) to service_role, authenticated;
