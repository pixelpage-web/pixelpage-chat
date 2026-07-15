-- ============================================================================
-- 0042: registra o aceite de Termos de Uso/Política de Privacidade no
-- cadastro (/register) — prova de consentimento, não cosmético.
--
-- Fica em profiles (ação da pessoa, não da organização), seguindo o mesmo
-- padrão já usado por phone/cpf: capturado como metadata no signUp() e lido
-- aqui dentro de create_organization() via raw_user_meta_data (0026).
--
-- Login social (Google) usa signInWithOAuth, que NÃO aceita metadata
-- customizada como o signUp aceita — não há como carimbar o instante exato
-- do clique no checkbox nesse caminho. O frontend garante que o botão
-- "Entrar com Google" só fica clicável com o checkbox já marcado, então
-- aqui usamos now() como fallback (momento de criação da org) só quando a
-- metadata não trouxer o valor.
-- ============================================================================

alter table public.profiles add column terms_accepted_at timestamptz;

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
  v_terms_accepted_at timestamptz;
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
    raw_user_meta_data ->> 'cpf',
    (raw_user_meta_data ->> 'terms_accepted_at')::timestamptz
  into v_user_name, v_user_phone, v_user_cpf, v_terms_accepted_at
  from auth.users where id = auth.uid();

  v_terms_accepted_at := coalesce(v_terms_accepted_at, now());

  insert into public.profiles (id, org_id, role, name, phone, cpf, terms_accepted_at)
  values (auth.uid(), v_org, 'owner', coalesce(v_user_name, ''), v_user_phone, v_user_cpf, v_terms_accepted_at)
  on conflict (id) do update
    set org_id = excluded.org_id,
        role = case when public.profiles.role = 'admin' then 'admin' else 'owner' end,
        phone = coalesce(public.profiles.phone, excluded.phone),
        cpf = coalesce(public.profiles.cpf, excluded.cpf),
        terms_accepted_at = coalesce(public.profiles.terms_accepted_at, excluded.terms_accepted_at);

  insert into public.audit_logs (org_id, actor_id, action, metadata)
  values (v_org, auth.uid(), 'organization.created', jsonb_build_object('name', p_name));

  return v_org;
end;
$$;
