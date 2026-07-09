-- Auditoria de segurança (Parte 6 / item Médio, aprovado nesta rodada):
-- "audit_logs: membros leem" liberava SELECT para QUALQUER membro da
-- organização (owner/manager/agent), sem checar papel — mesmo espírito do
-- ALTO-2 (exclusão de conexão restrita a owner/admin). audit_logs registra
-- ações sensíveis (mudança de plano, exclusão, configuração de BYOK etc.),
-- então passa a ser owner (dono da própria org) OU is_admin() (staff da
-- plataforma) — "manager"/"agent" deixam de ver a trilha de auditoria.
-- Não muda a policy de INSERT (continua igual, usada só pelo backend).
alter policy "audit: membros leem" on public.audit_logs
  using (((org_id = auth_org_id()) and (auth_role() = 'owner')) or is_admin());
