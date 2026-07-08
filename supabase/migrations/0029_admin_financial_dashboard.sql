-- ============================================================================
-- 0029: RPC de leitura para o dashboard financeiro do Super Admin: MRR, custo
-- real de IA e margem por organização, incluindo o instante em que a margem
-- virou negativa no mês (para o alerta "margem negativa há N dias"). Segue o
-- mesmo padrão de get_org_secrets_status (0028): checagem de autorização
-- DENTRO da função (não confiar em RLS), grant para `authenticated` (não
-- restrito a service_role, porque é uma leitura, não uma escrita sensível).
--
-- NOTA (bug corrigido antes de aplicar, verificado contra o banco real): as
-- colunas de retorno (org_id, mrr_usd, ...) são variáveis PL/pgSQL dentro do
-- corpo da função, e o plpgsql padrão (variable_conflict = error) aborta com
-- `42702: column reference "org_id" is ambiguous` se uma query referenciar
-- esses nomes SEM qualificar. Por isso TODAS as referências dentro do CTE
-- `crossing` são qualificadas com o alias `ranked` — mesma disciplina que
-- record_ai_usage (0027/0028) já segue com o alias `oum`.
create or replace function public.get_admin_financial_dashboard(p_month date)
returns table (
  org_id uuid,
  org_name text,
  plan_id uuid,
  plan_name text,
  mrr_usd numeric,
  subscription_status text,
  ai_mode text,
  ai_cost_usd numeric,
  ai_cost_limit_usd numeric,
  usage_status text,
  margin_usd numeric,
  negative_margin_since timestamptz
)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Não autorizado';
  end if;

  return query
  with base as (
    select
      o.id as org_id,
      o.name as org_name,
      o.ai_mode,
      s.plan_id,
      p.name as plan_name,
      (p.price_cents::numeric / 100) as mrr_usd,
      s.status as subscription_status,
      coalesce(oum.total_ai_cost_usd, 0) as ai_cost_usd,
      p.max_ai_cost_usd_monthly as ai_cost_limit_usd,
      coalesce(oum.status, 'ok') as usage_status
    from public.organizations o
    join public.subscriptions s on s.org_id = o.id
    join public.plans p on p.id = s.plan_id
    left join public.org_usage_monthly oum on oum.org_id = o.id and oum.month = p_month
  ),
  crossing as (
    -- Primeiro instante no mês em que o custo acumulado de IA (soma corrida por
    -- org, ordenada por created_at) ultrapassou o MRR da org — só para orgs
    -- não-BYOK com MRR>0 (BYOK nunca conta custo nosso, não pode ter "margem
    -- negativa" por definição). O `distinct on (ranked.org_id)` com
    -- `order by ranked.org_id, ranked.created_at` mantém, por org, a linha de
    -- MENOR created_at dentre as que já cruzaram o teto — ou seja, o primeiro
    -- cruzamento (a soma corrida é não-decrescente, cost_usd >= 0).
    select distinct on (ranked.org_id)
      ranked.org_id, ranked.created_at as negative_margin_since
    from (
      select
        l.org_id,
        l.created_at,
        sum(l.cost_usd) over (partition by l.org_id order by l.created_at) as running_cost,
        b.mrr_usd
      from public.ai_usage_logs l
      join base b on b.org_id = l.org_id
      where l.created_at >= p_month::timestamptz
        and l.created_at < (p_month::timestamptz + interval '1 month')
        and b.ai_mode <> 'byok'
        and b.mrr_usd > 0
    ) ranked
    where ranked.running_cost >= ranked.mrr_usd
    order by ranked.org_id, ranked.created_at
  )
  select
    b.org_id, b.org_name, b.plan_id, b.plan_name, b.mrr_usd, b.subscription_status,
    b.ai_mode, b.ai_cost_usd, b.ai_cost_limit_usd, b.usage_status,
    (b.mrr_usd - b.ai_cost_usd) as margin_usd,
    c.negative_margin_since
  from base b
  left join crossing c on c.org_id = b.org_id
  order by (b.mrr_usd - b.ai_cost_usd) asc;
end;
$$;

grant execute on function public.get_admin_financial_dashboard(date) to authenticated;
revoke execute on function public.get_admin_financial_dashboard(date) from anon;
