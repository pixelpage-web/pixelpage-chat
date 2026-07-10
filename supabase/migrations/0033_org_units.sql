-- Unidades/filiais: permite rotear conversas de um único número de WhatsApp
-- compartilhado para equipes diferentes por local. Aditivo e retrocompatível:
-- conversas sem unit_id continuam visíveis para todo mundo, exatamente como
-- hoje (nenhum comportamento existente muda para quem não usa a feature).

create table if not exists public.org_units (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  name       text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- Vínculo membro (profiles) <-> unidade. Um membro sem nenhuma linha aqui não
-- é "vinculado a uma unidade" e continua enxergando todas as conversas da org
-- (comportamento atual, preservado).
create table if not exists public.team_member_units (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  unit_id    uuid not null references public.org_units (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, unit_id)
);

alter table public.conversations
  add column if not exists unit_id uuid references public.org_units (id) on delete set null;

-- Permite filtrar o relatório de CSAT por unidade (Parte 3). Copiado da
-- conversa no momento da resposta — se a conversa mudar de unidade depois,
-- a nota já registrada continua refletindo a unidade de quando foi dada.
alter table public.csat_responses
  add column if not exists unit_id uuid references public.org_units (id) on delete set null;

create index if not exists idx_org_units_org on public.org_units (org_id);
create index if not exists idx_team_member_units_unit on public.team_member_units (unit_id);
create index if not exists idx_conversations_unit on public.conversations (unit_id);
create index if not exists idx_csat_responses_unit on public.csat_responses (unit_id);

alter table public.org_units enable row level security;
alter table public.team_member_units enable row level security;

-- ---------------------------------------------------------------- org_units
create policy "org_units: membros leem" on public.org_units
  for select using (org_id = public.auth_org_id() or public.is_admin());

create policy "org_units: owner/admin criam" on public.org_units
  for insert with check (
    (org_id = public.auth_org_id() and public.auth_role() in ('owner', 'admin'))
    or public.is_admin()
  );

create policy "org_units: owner/admin atualizam" on public.org_units
  for update using (
    (org_id = public.auth_org_id() and public.auth_role() in ('owner', 'admin'))
    or public.is_admin()
  )
  with check (
    (org_id = public.auth_org_id() and public.auth_role() in ('owner', 'admin'))
    or public.is_admin()
  );

create policy "org_units: owner/admin apagam" on public.org_units
  for delete using (
    (org_id = public.auth_org_id() and public.auth_role() in ('owner', 'admin'))
    or public.is_admin()
  );

-- ---------------------------------------------------------- team_member_units
create policy "team_member_units: membros leem" on public.team_member_units
  for select using (
    exists (
      select 1 from public.org_units u
      where u.id = team_member_units.unit_id
        and (u.org_id = public.auth_org_id() or public.is_admin())
    )
  );

create policy "team_member_units: owner/admin escrevem" on public.team_member_units
  for insert with check (
    exists (
      select 1 from public.org_units u
      where u.id = team_member_units.unit_id
        and (
          (u.org_id = public.auth_org_id() and public.auth_role() in ('owner', 'admin'))
          or public.is_admin()
        )
    )
  );

create policy "team_member_units: owner/admin apagam" on public.team_member_units
  for delete using (
    exists (
      select 1 from public.org_units u
      where u.id = team_member_units.unit_id
        and (
          (u.org_id = public.auth_org_id() and public.auth_role() in ('owner', 'admin'))
          or public.is_admin()
        )
    )
  );

-- ------------------------------------------------------ escopo por unidade
-- Unidades às quais o usuário atual está vinculado. Array vazio = sem
-- vínculo de unidade nenhum = sem restrição (vê tudo, igual hoje).
create or replace function public.auth_unit_ids()
returns uuid[]
language sql stable security definer
set search_path = public
as $$
  select coalesce(array_agg(unit_id), '{}')
  from public.team_member_units
  where profile_id = auth.uid();
$$;

-- Amplia a policy existente de conversations: dono/admin continuam vendo
-- tudo; quem não tem nenhuma unidade atribuída continua vendo tudo (mesmo
-- comportamento de hoje); conversas sem unidade continuam visíveis pra
-- todo mundo; só passa a restringir quem TEM unidade(s) atribuída(s) E a
-- conversa TEM unidade definida e não é uma das suas.
alter policy "conversations: membros tudo" on public.conversations
  using (
    (
      org_id = public.auth_org_id() and (
        public.auth_role() in ('owner', 'admin')
        or unit_id is null
        or array_length(public.auth_unit_ids(), 1) is null
        or unit_id = any (public.auth_unit_ids())
      )
    )
    or public.is_admin()
  )
  with check (
    (
      org_id = public.auth_org_id() and (
        public.auth_role() in ('owner', 'admin')
        or unit_id is null
        or array_length(public.auth_unit_ids(), 1) is null
        or unit_id = any (public.auth_unit_ids())
      )
    )
    or public.is_admin()
  );
