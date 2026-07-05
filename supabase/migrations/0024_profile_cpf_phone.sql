-- Campos de verificação de identidade no cadastro (CPF + telefone pessoal do usuário)
alter table public.profiles
  add column cpf text,
  add column phone text;

-- CPF único em todo o sistema (não apenas por organização) — decisão explícita do produto
create unique index profiles_cpf_unique_idx on public.profiles (cpf) where cpf is not null;

-- Checagem de disponibilidade de CPF sem expor dados de outros perfis.
-- Precisa ser chamável por usuários ainda não autenticados (etapa 1 do cadastro, antes do signUp).
create or replace function public.check_cpf_available(p_cpf text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles where cpf = p_cpf
  );
$$;

grant execute on function public.check_cpf_available(text) to anon, authenticated;

-- Estende create_organization para persistir phone/cpf (coletados no cadastro e guardados em
-- auth.users.raw_user_meta_data pelo signUp) no momento em que o perfil é criado — atômico,
-- sem round-trip extra do cliente. Idêntica em tudo mais à versão anterior.
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

  select id into v_plan from public.plans where name = 'Trial' limit 1;
  if v_plan is not null then
    insert into public.subscriptions (org_id, plan_id, status, trial_ends_at)
    values (v_org, v_plan, 'trial', now() + interval '7 days');
  end if;

  insert into public.audit_logs (org_id, actor_id, action, metadata)
  values (v_org, auth.uid(), 'organization.created', jsonb_build_object('name', p_name));

  return v_org;
end;
$$;
