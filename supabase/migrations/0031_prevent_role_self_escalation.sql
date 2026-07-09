-- CRÍTICO (auditoria de segurança): a policy "profiles: atualizar próprio"
-- permite que qualquer usuário autenticado atualize sua PRÓPRIA linha em
-- profiles (id = auth.uid()), e a policy de "owner" permite que o dono de
-- uma org atualize qualquer perfil DENTRO da própria org — mas nenhuma das
-- duas restringe QUAL coluna pode mudar. Como authenticated tem GRANT UPDATE
-- de tabela inteira (padrão do Supabase, sem restrição por coluna) e
-- is_admin() só verifica profiles.role IN ('admin','superadmin') (sem checar
-- e-mail nem qualquer outro fator), isso permitia que QUALQUER usuário
-- recém-cadastrado se auto-promovesse a role='admin' via
-- PATCH /rest/v1/profiles?id=eq.<próprio-id> — o que, por sua vez, fazia
-- is_admin() retornar true e liberava leitura/escrita cross-tenant em toda
-- tabela cuja policy usa "org_id = auth_org_id() OR is_admin()" (contacts,
-- conversations, agents, flows, campaigns, api_keys, subscriptions etc.).
--
-- Confirmado ao vivo em ambiente de teste (conta descartável, org própria
-- sem nenhum contato) durante a auditoria: PATCH retornou 200, role virou
-- 'admin', e uma leitura subsequente de contacts trouxe registros de OUTRA
-- organização real. 'superadmin' era bloqueado só por acidente, pelo índice
-- único idx_single_superadmin (Patrick já ocupa a única vaga) — não por
-- nenhum controle de segurança deliberado.
--
-- Fix aditivo: trigger que bloqueia qualquer UPDATE que mude profiles.role
-- para 'admin'/'superadmin' a menos que a requisição seja feita com
-- service_role (que é o único caminho legítimo hoje — ver o bootstrap em
-- lib/auth.ts, que já usa createAdminClient()/service_role para promover
-- pelo e-mail configurado em ADMIN_EMAIL/SUPERADMIN_EMAIL). Nenhuma policy
-- existente foi alterada; nenhum outro comportamento muda.
create or replace function public.prevent_role_self_escalation()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role
     and new.role in ('admin', 'superadmin')
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Apenas o backend (service_role) pode promover a admin/superadmin.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_role_self_escalation on public.profiles;
create trigger trg_prevent_role_self_escalation
  before update on public.profiles
  for each row
  execute function public.prevent_role_self_escalation();
