-- messages tinha só SELECT e INSERT via RLS — exclusão de mensagem
-- individual (Inbox, mensagens da equipe) não funcionava. Restrita a
-- outbound (equipe/bot) no próprio banco, não só na UI: mensagens do
-- cliente (inbound) nunca podem ser excluídas, nem via API direta.
create policy "messages: membros excluem enviadas" on public.messages
  for delete using (
    direction = 'outbound'
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (c.org_id = public.auth_org_id() or public.is_admin())
    )
  );
