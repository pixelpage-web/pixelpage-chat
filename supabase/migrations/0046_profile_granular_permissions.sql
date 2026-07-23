-- FASE 1 do sistema de permissões granulares por funcionário (dono escolhe
-- o que cada agent pode ver/fazer) — só a base de segurança, sem UI ainda.
-- Substitui o sistema legado `team_members`/`team_member_permissions`
-- (migration 0016), que nunca teve RLS nem dado real em produção (0 linhas
-- confirmado). As flags ficam num único jsonb em profiles, mesmo padrão já
-- usado em plans.features — lib/permissions.ts (ROLE_DEFAULTS,
-- NAV_PERMISSION_MAP) já sabe o formato esperado.
alter table public.profiles
  add column if not exists permissions jsonb;

-- CRÍTICO: a policy "profiles: atualizar próprio" (0001_schema.sql) permite
-- UPDATE na própria linha (id = auth.uid()) sem nenhuma restrição de coluna
-- — mesma classe de vulnerabilidade já corrigida pra profiles.role na
-- migration 0031 (prevent_role_self_escalation), pelo mesmo motivo: GRANT
-- UPDATE do Supabase é por tabela inteira, não por coluna. Sem este trigger,
-- qualquer agent poderia se auto-conceder todas as permissões via
-- PATCH /rest/v1/profiles?id=eq.<próprio-id> com {"permissions": {...}}.
--
-- Fix aditivo, mesmo padrão de 0031: bloqueia qualquer UPDATE que mude
-- profiles.permissions a menos que quem faz seja service_role, admin/
-- superadmin (is_admin()), ou owner da MESMA org do perfil sendo alterado.
-- Nenhuma policy existente foi alterada; nenhum outro comportamento muda.
create or replace function public.prevent_permissions_self_escalation()
returns trigger
language plpgsql
as $$
begin
  if new.permissions is distinct from old.permissions
     and coalesce(auth.role(), '') <> 'service_role'
     and not public.is_admin()
     and not (public.auth_role() = 'owner' and new.org_id = public.auth_org_id())
  then
    raise exception 'Apenas dono/admin da organização pode alterar permissões.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_permissions_self_escalation on public.profiles;
create trigger trg_prevent_permissions_self_escalation
  before update on public.profiles
  for each row
  execute function public.prevent_permissions_self_escalation();
