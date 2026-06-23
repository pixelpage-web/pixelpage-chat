-- ==============================================================================
-- PIXELPAGE CHAT — Role superadmin
-- O superadmin tem os mesmos poderes do admin global no RLS e, no app,
-- acesso a recursos de todos os planos (override via SUPERADMIN_EMAIL).
-- ==============================================================================

-- Permite a role 'superadmin' nos perfis
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('superadmin', 'admin', 'owner', 'manager', 'agent'));

-- is_admin() passa a reconhecer o superadmin (todas as policies de RLS que
-- usam public.is_admin() valem automaticamente para ele)
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select role in ('admin', 'superadmin') from public.profiles where id = auth.uid()),
    false
  );
$$;

-- Seed: garante a role superadmin para o email do dono da plataforma
-- (se a conta ainda não existir, o bootstrap em lib/auth.ts promove no 1º login)
update public.profiles p
set role = 'superadmin'
from auth.users u
where u.id = p.id
  and lower(u.email) = lower('patrickdsc498@gmail.com');
