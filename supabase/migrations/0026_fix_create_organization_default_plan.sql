-- Corrige regressão introduzida pela migração 0024: aquela migração recriou create_organization
-- a partir da versão pré-0019 (plano 'Trial', status 'trial', 7 dias de expiração), sem perceber
-- que a 0019 já havia trocado o comportamento padrão de novos cadastros para o plano 'Grátis'
-- (status 'active', sem expiração). Restaura o comportamento pós-0019, já com o nome pós-rename
-- da migração 0025 ('Grátis' → 'Free').
create or replace function public.create_organization(p_name text, p_slug text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_plan uuid;
  v_slug text;
  v_user_name text;
  v_user_phone text;
  v_user_cpf text;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;

  if exists (select 1 from public.profiles where id = auth.uid() and org_id is not null) then
    raise exception 'Usuário já pertence a uma organização';
  end if;

  v_slug := left(coalesce(nullif(p_slug, ''), 'org'), 40) || '-' || substr(md5(random()::text), 1, 6);

  insert into public.organizations (name, slug, owner_id)
  values (p_name, v_slug, auth.uid())
  returning id into v_org;

  select
    coalesce(raw_user_meta_data ->> 'name', raw_user_meta_data ->> 'full_name', split_part(email, '@', 1)),
    raw_user_meta_data ->> 'phone',
    raw_user_meta_data ->> 'cpf'
  into v_user_name, v_user_phone, v_user_cpf
  from auth.users where id = auth.uid();

  insert into public.profiles (id, org_id, role, name, phone, cpf)
  values (auth.uid(), v_org, 'owner', coalesce(v_user_name, ''), v_user_phone, v_user_cpf)
  on conflict (id) do update
    set org_id = excluded.org_id,
        role = case when public.profiles.role = 'admin' then 'admin' else 'owner' end,
        phone = coalesce(public.profiles.phone, excluded.phone),
        cpf = coalesce(public.profiles.cpf, excluded.cpf);

  select id into v_plan from public.plans where name = 'Free' and active = true limit 1;
  if v_plan is not null then
    insert into public.subscriptions (org_id, plan_id, status, trial_ends_at)
    values (v_org, v_plan, 'active', null);
  end if;

  insert into public.audit_logs (org_id, actor_id, action, metadata)
  values (v_org, auth.uid(), 'organization.created', jsonb_build_object('name', p_name));

  return v_org;
end;
$$;
