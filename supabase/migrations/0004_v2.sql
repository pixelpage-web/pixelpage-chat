-- ==============================================================================
-- ZARI API v2 — QR Code (Evolution API), campanhas, templates, mídia, contatos
-- ==============================================================================

-- ---------------------------------------------------------------- organizações
alter table public.organizations add column if not exists logo_url text;
alter table public.organizations add column if not exists segment text;

-- ---------------------------------------------------------------- perfis
-- Nova role 'manager' (gerente) + preferências de notificação
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'owner', 'manager', 'agent'));
alter table public.profiles add column if not exists notification_prefs jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------- planos
-- campaigns_limit: null = ilimitado, 0 = sem acesso a campanhas
alter table public.plans add column if not exists campaigns_limit integer;
alter table public.plans add column if not exists highlight boolean not null default false;
alter table public.plans add column if not exists sort_order integer not null default 0;

update public.plans set campaigns_limit = 0,    sort_order = 0                  where name = 'Trial';
update public.plans set campaigns_limit = 500,  sort_order = 1                  where name = 'Starter';
update public.plans set campaigns_limit = 5000, sort_order = 2, highlight = true where name = 'Pro';
update public.plans set campaigns_limit = null, sort_order = 3                  where name = 'Business';

-- ---------------------------------------------------------------- conexões
-- Dois modos de conexão: API oficial Meta ou QR Code via Evolution API
alter table public.whatsapp_connections add column if not exists connection_type text not null default 'meta_api';
alter table public.whatsapp_connections drop constraint if exists whatsapp_connections_connection_type_check;
alter table public.whatsapp_connections add constraint whatsapp_connections_connection_type_check
  check (connection_type in ('meta_api', 'qr_code'));
alter table public.whatsapp_connections add column if not exists evolution_instance_id text;
alter table public.whatsapp_connections add column if not exists evolution_instance_token text;
-- Identificação do tenant no webhook da Evolution API (caminho quente)
create index if not exists idx_connections_evolution
  on public.whatsapp_connections (evolution_instance_id);

-- ---------------------------------------------------------------- conversas
alter table public.conversations drop constraint if exists conversations_status_check;
alter table public.conversations add constraint conversations_status_check
  check (status in ('open', 'resolved', 'pending'));

-- ---------------------------------------------------------------- mensagens
alter table public.messages add column if not exists media_url text;
alter table public.messages add column if not exists read_at timestamptz;
alter table public.messages add column if not exists sender_id uuid;
alter table public.messages drop constraint if exists messages_message_type_check;
alter table public.messages add constraint messages_message_type_check
  check (message_type in ('text', 'image', 'audio', 'video', 'document', 'sticker'));

-- ---------------------------------------------------------------- contatos
alter table public.contacts add column if not exists blocked boolean not null default false;

-- ---------------------------------------------------------------- webhook_logs
-- Payload guardado para reenvio manual pelo admin
alter table public.webhook_logs add column if not exists payload jsonb;

-- ---------------------------------------------------------------- campanhas
create table if not exists public.campaigns (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  connection_id   uuid references public.whatsapp_connections (id) on delete set null,
  name            text not null,
  status          text not null default 'draft'
                  check (status in ('draft', 'scheduled', 'running', 'completed', 'failed')),
  message_text    text not null,
  scheduled_at    timestamptz,
  total_contacts  integer not null default 0,
  sent            integer not null default 0,
  delivered       integer not null default 0,
  failed          integer not null default 0,
  created_at      timestamptz not null default now()
);

create table if not exists public.campaign_contacts (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  contact_id  uuid references public.contacts (id) on delete set null,
  phone       text not null,
  status      text not null default 'pending'
              check (status in ('pending', 'sent', 'delivered', 'failed')),
  error       text,
  sent_at     timestamptz
);

create index if not exists idx_campaigns_org on public.campaigns (org_id, created_at desc);
create index if not exists idx_campaign_contacts on public.campaign_contacts (campaign_id, status);

alter table public.campaigns enable row level security;
alter table public.campaign_contacts enable row level security;

create policy "campaigns: membros tudo" on public.campaigns
  for all using (org_id = public.auth_org_id() or public.is_admin())
  with check (org_id = public.auth_org_id() or public.is_admin());

create policy "campaign_contacts: membros tudo" on public.campaign_contacts
  for all using (
    exists (select 1 from public.campaigns c
      where c.id = campaign_id and (c.org_id = public.auth_org_id() or public.is_admin()))
  )
  with check (
    exists (select 1 from public.campaigns c
      where c.id = campaign_id and (c.org_id = public.auth_org_id() or public.is_admin()))
  );

-- ---------------------------------------------------------------- templates globais
-- Biblioteca do admin por nicho; clientes usam como base (templates rápidos "/")
create table if not exists public.message_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  niche       text not null default 'geral',
  content     text not null,
  language    text not null default 'pt' check (language in ('pt', 'en')),
  meta_status text not null default 'draft'
              check (meta_status in ('draft', 'pending', 'approved', 'rejected')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.message_templates enable row level security;

create policy "templates: autenticados leem ativos" on public.message_templates
  for select using (auth.uid() is not null and (active or public.is_admin()));
create policy "templates: admin gerencia" on public.message_templates
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- storage (logos)
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

create policy "logos: leitura pública" on storage.objects
  for select using (bucket_id = 'logos');
create policy "logos: upload autenticado" on storage.objects
  for insert with check (bucket_id = 'logos' and auth.uid() is not null);
create policy "logos: atualização autenticada" on storage.objects
  for update using (bucket_id = 'logos' and auth.uid() is not null);
