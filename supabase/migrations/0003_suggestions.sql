-- ==============================================================================
-- ZARI API — Sugestões de melhoria enviadas pelos clientes
-- Aparecem no painel admin (/admin/suggestions) para triagem.
-- ==============================================================================

create table public.suggestions (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid references public.organizations (id) on delete set null,
  author_id   uuid references auth.users (id) on delete set null,
  author_name text not null default '',
  content     text not null,
  status      text not null default 'new' check (status in ('new', 'reviewed', 'done')),
  created_at  timestamptz not null default now()
);

create index idx_suggestions_created on public.suggestions (created_at desc);

alter table public.suggestions enable row level security;

-- Qualquer membro logado envia sugestão (vinculada à própria organização)
create policy "suggestions: membros inserem" on public.suggestions
  for insert with check (
    auth.uid() is not null
    and (org_id = public.auth_org_id() or public.is_admin())
  );

-- O autor vê as próprias sugestões; o admin global vê todas
create policy "suggestions: autor ou admin leem" on public.suggestions
  for select using (author_id = auth.uid() or public.is_admin());

-- Somente admin tria (muda status) e exclui
create policy "suggestions: admin atualiza" on public.suggestions
  for update using (public.is_admin()) with check (public.is_admin());
create policy "suggestions: admin exclui" on public.suggestions
  for delete using (public.is_admin());
