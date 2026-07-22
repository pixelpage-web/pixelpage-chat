-- ============================================================================
-- 0045: fecha 3 vazamentos confirmados em auditoria — RLS liberava leitura
-- (e, no caso de external_webhooks, escrita) pra QUALQUER membro da org
-- (role 'agent' incluso), quando deveria valer só pra 'owner'/'admin'.
--
-- 1) external_webhooks / webhook_logs: policy "membros tudo"/"membros leem"
--    não checava role — qualquer agent lendo /app/integrations ou
--    /app/connections/:id/webhook via URL direta via a sessão do usuário
--    (não admin client) via `secret` (usado na assinatura HMAC do payload
--    do n8n) em texto puro, e podia até regenerá-lo (policy era "for all").
-- 2) subscriptions: policy "membros leem" idem — expunha status/plan_id e,
--    mais grave, stripe_customer_id/stripe_subscription_id/
--    asaas_customer_id/asaas_subscription_id pra qualquer agent.
--
-- Consequência colateral que motivou a RPC abaixo: `subscriptions.plan_id/
-- status/trial_ends_at/current_period_end` também são lidos (via sessão do
-- usuário, não admin) em ~9 pontos que TODO agent usa no dia a dia — shell
-- layout (banner de trial, gate de Flows), inbox, envio de mensagem/mídia
-- (bloqueio de "assinatura expirada"), conexões, fluxos, criação de conexão
-- QR/Embedded Signup. Restringir a tabela pra owner/admin sem dar um
-- substituto quebraria esses pontos — e o pior cenário não é só UI vazia:
-- `isSubscriptionBlocked` (lib/billing.ts) trata subscription=null como
-- "não bloqueado" (fail-open), então um agent de uma org com trial vencido
-- continuaria mandando mensagem à vontade. Por isso a RPC abaixo, que nunca
-- expõe os IDs de billing e pode ser chamada por qualquer membro da org.
-- ============================================================================

-- ---------- external_webhooks / webhook_logs: só owner/admin da org (ou staff da plataforma) ----------
drop policy if exists "webhooks: membros tudo" on public.external_webhooks;
create policy "webhooks: owner/admin tudo" on public.external_webhooks
  for all using (
    (org_id = public.auth_org_id() and public.auth_role() in ('owner', 'admin'))
    or public.is_admin()
  )
  with check (
    (org_id = public.auth_org_id() and public.auth_role() in ('owner', 'admin'))
    or public.is_admin()
  );

drop policy if exists "webhook_logs: membros leem" on public.webhook_logs;
create policy "webhook_logs: owner/admin leem" on public.webhook_logs
  for select using (
    exists (
      select 1 from public.external_webhooks w
      where w.id = webhook_id
        and (
          (w.org_id = public.auth_org_id() and public.auth_role() in ('owner', 'admin'))
          or public.is_admin()
        )
    )
  );

-- ---------- subscriptions: leitura da linha inteira só owner/admin ----------
drop policy if exists "subscriptions: membros leem" on public.subscriptions;
create policy "subscriptions: owner/admin leem" on public.subscriptions
  for select using (
    (org_id = public.auth_org_id() and public.auth_role() in ('owner', 'admin'))
    or public.is_admin()
  );

-- Resumo seguro de assinatura: só os campos usados pra gating de feature/UI
-- (plano, status, prazos) — nunca stripe_customer_id/stripe_subscription_id/
-- asaas_*. Chamável por QUALQUER membro autenticado da própria org (não só
-- owner/admin), mesmo padrão de get_org_secrets_status (0028).
create or replace function public.get_org_subscription_summary(p_org_id uuid)
returns table (
  plan_id uuid,
  status text,
  trial_ends_at timestamptz,
  current_period_end timestamptz
)
language plpgsql security definer set search_path = public
as $$
begin
  if not (p_org_id = public.auth_org_id() or public.is_admin()) then
    raise exception 'Não autorizado';
  end if;
  return query
    select s.plan_id, s.status, s.trial_ends_at, s.current_period_end
    from public.subscriptions s
    where s.org_id = p_org_id;
end;
$$;
grant execute on function public.get_org_subscription_summary(uuid) to authenticated;
