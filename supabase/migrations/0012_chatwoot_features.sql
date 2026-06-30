-- ==============================================================================
-- PIXELPAGE CHAT — Funcionalidades Chatwoot
-- Respostas prontas, etiquetas, notas de contato, notas internas, menções,
-- notificações in-app, filtros salvos, macros, help center, dashboard apps.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- canned_responses — respostas prontas por organização
-- ------------------------------------------------------------------------------
create table if not exists public.canned_responses (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  short_code  text not null,
  content     text not null,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (org_id, short_code)
);

create index if not exists idx_canned_responses_org
  on public.canned_responses (org_id, short_code);

alter table public.canned_responses enable row level security;

create policy "canned: membros leem" on public.canned_responses
  for select using (org_id = public.auth_org_id());
create policy "canned: membros gerenciam" on public.canned_responses
  for all using (org_id = public.auth_org_id())
  with check (org_id = public.auth_org_id());

-- ------------------------------------------------------------------------------
-- labels — etiquetas coloridas de conversa por organização
-- ------------------------------------------------------------------------------
create table if not exists public.labels (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  title           text not null,
  description     text,
  color           text not null default '#1F93FF',
  show_on_sidebar boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (org_id, title)
);

create index if not exists idx_labels_org
  on public.labels (org_id);

alter table public.labels enable row level security;

create policy "labels: membros leem" on public.labels
  for select using (org_id = public.auth_org_id());
create policy "labels: membros gerenciam" on public.labels
  for all using (org_id = public.auth_org_id())
  with check (org_id = public.auth_org_id());

-- ------------------------------------------------------------------------------
-- conversation_labels — etiquetas aplicadas em conversas
-- ------------------------------------------------------------------------------
create table if not exists public.conversation_labels (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  label_id        uuid not null references public.labels (id) on delete cascade,
  primary key (conversation_id, label_id)
);

alter table public.conversation_labels enable row level security;

create policy "conv_labels: membros gerenciam" on public.conversation_labels
  for all using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.org_id = public.auth_org_id()
    )
  )
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.org_id = public.auth_org_id()
    )
  );

-- ------------------------------------------------------------------------------
-- contact_notes — notas timestamped em contatos (substitui contacts.notes)
-- ------------------------------------------------------------------------------
create table if not exists public.contact_notes (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid not null references public.contacts (id) on delete cascade,
  org_id      uuid not null references public.organizations (id) on delete cascade,
  content     text not null,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_contact_notes_contact
  on public.contact_notes (contact_id, created_at desc);

alter table public.contact_notes enable row level security;

create policy "contact_notes: membros gerenciam" on public.contact_notes
  for all using (org_id = public.auth_org_id())
  with check (org_id = public.auth_org_id());

-- ------------------------------------------------------------------------------
-- conversation_notes — notas internas em conversas (só equipe vê, não o cliente)
-- ------------------------------------------------------------------------------
create table if not exists public.conversation_notes (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  org_id          uuid not null references public.organizations (id) on delete cascade,
  content         text not null,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_conversation_notes_conv
  on public.conversation_notes (conversation_id, created_at desc);

alter table public.conversation_notes enable row level security;

create policy "conv_notes: membros gerenciam" on public.conversation_notes
  for all using (org_id = public.auth_org_id())
  with check (org_id = public.auth_org_id());

-- ------------------------------------------------------------------------------
-- mentions — @menções de agentes em notas internas
-- ------------------------------------------------------------------------------
create table if not exists public.mentions (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  note_id         uuid not null references public.conversation_notes (id) on delete cascade,
  mentioned_user  uuid not null references auth.users (id) on delete cascade,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_mentions_user
  on public.mentions (mentioned_user, created_at desc);

alter table public.mentions enable row level security;

create policy "mentions: membros leem próprias" on public.mentions
  for select using (
    mentioned_user = auth.uid()
    or created_by = auth.uid()
    or exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.org_id = public.auth_org_id()
    )
  );
create policy "mentions: membros inserem" on public.mentions
  for insert with check (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.org_id = public.auth_org_id()
    )
  );

-- ------------------------------------------------------------------------------
-- in_app_notifications — notificações in-app por usuário
-- ------------------------------------------------------------------------------
create table if not exists public.in_app_notifications (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations (id) on delete cascade,
  user_id             uuid not null references auth.users (id) on delete cascade,
  -- tipos: conversation_assignment, conversation_mention, conversation_reply,
  --        conversation_creation
  notification_type   text not null,
  conversation_id     uuid references public.conversations (id) on delete cascade,
  actor_id            uuid references auth.users (id) on delete set null,
  body                text not null default '',
  read_at             timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists idx_in_app_notif_user
  on public.in_app_notifications (user_id, read_at, created_at desc);

alter table public.in_app_notifications enable row level security;

create policy "notif: usuário lê as próprias" on public.in_app_notifications
  for select using (user_id = auth.uid());
create policy "notif: usuário marca lidas" on public.in_app_notifications
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy "notif: membros inserem para a org" on public.in_app_notifications
  for insert with check (org_id = public.auth_org_id());

-- Realtime para notificações in-app
alter publication supabase_realtime add table public.in_app_notifications;

-- ------------------------------------------------------------------------------
-- custom_filters — filtros salvos no inbox
-- ------------------------------------------------------------------------------
create table if not exists public.custom_filters (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  created_by  uuid references auth.users (id) on delete set null,
  name        text not null,
  filter_type text not null default 'conversation'
              check (filter_type in ('conversation', 'contact')),
  query       jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists idx_custom_filters_org
  on public.custom_filters (org_id);

alter table public.custom_filters enable row level security;

create policy "filters: membros gerenciam" on public.custom_filters
  for all using (org_id = public.auth_org_id())
  with check (org_id = public.auth_org_id());

-- ------------------------------------------------------------------------------
-- macros — sequência de ações executáveis com 1 clique
-- ------------------------------------------------------------------------------
create table if not exists public.macros (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  created_by  uuid references auth.users (id) on delete set null,
  name        text not null,
  actions     jsonb not null default '[]',
  visibility  text not null default 'public'
              check (visibility in ('private', 'public')),
  created_at  timestamptz not null default now()
);

create index if not exists idx_macros_org
  on public.macros (org_id);

alter table public.macros enable row level security;

create policy "macros: membros leem públicas" on public.macros
  for select using (
    org_id = public.auth_org_id()
    and (visibility = 'public' or created_by = auth.uid())
  );
create policy "macros: membros gerenciam próprias" on public.macros
  for all using (org_id = public.auth_org_id() and created_by = auth.uid())
  with check (org_id = public.auth_org_id());

-- ------------------------------------------------------------------------------
-- portals — portais do centro de ajuda
-- ------------------------------------------------------------------------------
create table if not exists public.portals (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  name          text not null,
  slug          text not null unique,
  color         text not null default '#FF5C00',
  page_title    text,
  homepage_link text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_portals_org
  on public.portals (org_id);

alter table public.portals enable row level security;

create policy "portals: membros gerenciam" on public.portals
  for all using (org_id = public.auth_org_id())
  with check (org_id = public.auth_org_id());
create policy "portals: público lê" on public.portals
  for select using (true);

-- ------------------------------------------------------------------------------
-- help_categories — categorias dos artigos
-- ------------------------------------------------------------------------------
create table if not exists public.help_categories (
  id          uuid primary key default gen_random_uuid(),
  portal_id   uuid not null references public.portals (id) on delete cascade,
  name        text not null,
  description text,
  icon        text,
  position    integer not null default 0
);

create index if not exists idx_help_categories_portal
  on public.help_categories (portal_id, position);

alter table public.help_categories enable row level security;

create policy "help_cat: público lê" on public.help_categories
  for select using (true);
create policy "help_cat: membros gerenciam" on public.help_categories
  for all using (
    exists (
      select 1 from public.portals p
      where p.id = portal_id and p.org_id = public.auth_org_id()
    )
  )
  with check (
    exists (
      select 1 from public.portals p
      where p.id = portal_id and p.org_id = public.auth_org_id()
    )
  );

-- ------------------------------------------------------------------------------
-- help_articles — artigos da base de conhecimento
-- ------------------------------------------------------------------------------
create table if not exists public.help_articles (
  id          uuid primary key default gen_random_uuid(),
  portal_id   uuid not null references public.portals (id) on delete cascade,
  category_id uuid references public.help_categories (id) on delete set null,
  author_id   uuid references auth.users (id) on delete set null,
  title       text not null,
  content     text not null default '',
  status      text not null default 'draft'
              check (status in ('draft', 'published')),
  views       integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_help_articles_portal
  on public.help_articles (portal_id, status, updated_at desc);
create index if not exists idx_help_articles_category
  on public.help_articles (category_id);

alter table public.help_articles enable row level security;

create policy "help_art: público lê publicados" on public.help_articles
  for select using (
    status = 'published'
    or exists (
      select 1 from public.portals p
      where p.id = portal_id and p.org_id = public.auth_org_id()
    )
  );
create policy "help_art: membros gerenciam" on public.help_articles
  for all using (
    exists (
      select 1 from public.portals p
      where p.id = portal_id and p.org_id = public.auth_org_id()
    )
  )
  with check (
    exists (
      select 1 from public.portals p
      where p.id = portal_id and p.org_id = public.auth_org_id()
    )
  );

-- ------------------------------------------------------------------------------
-- dashboard_apps — iframes personalizados no painel do agente
-- ------------------------------------------------------------------------------
create table if not exists public.dashboard_apps (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  title      text not null,
  content    jsonb not null default '[]',
  created_at timestamptz not null default now()
);

alter table public.dashboard_apps enable row level security;

create policy "dash_apps: membros gerenciam" on public.dashboard_apps
  for all using (org_id = public.auth_org_id())
  with check (org_id = public.auth_org_id());

-- ------------------------------------------------------------------------------
-- conversation_participants — agentes inscritos numa conversa
-- ------------------------------------------------------------------------------
create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  primary key (conversation_id, user_id)
);

alter table public.conversation_participants enable row level security;

create policy "participants: membros gerenciam" on public.conversation_participants
  for all using (
    user_id = auth.uid()
    or exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.org_id = public.auth_org_id()
    )
  )
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.org_id = public.auth_org_id()
    )
  );

-- ------------------------------------------------------------------------------
-- ALTER: external_webhooks — adicionar eventos subscritos
-- ------------------------------------------------------------------------------
alter table public.external_webhooks
  add column if not exists subscribed_events text[]
  not null default array['message.received'];

-- ------------------------------------------------------------------------------
-- Índices adicionais para performance
-- ------------------------------------------------------------------------------
create index if not exists idx_conversation_labels_label
  on public.conversation_labels (label_id);
create index if not exists idx_contact_notes_org
  on public.contact_notes (org_id, created_at desc);
create index if not exists idx_conversation_notes_org
  on public.conversation_notes (org_id, created_at desc);
create index if not exists idx_help_articles_search
  on public.help_articles using gin (to_tsvector('portuguese', title || ' ' || content));
