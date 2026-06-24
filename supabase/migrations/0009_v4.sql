-- ==============================================================================
-- PIXELPAGE CHAT v4 — Notificações globais, pedidos de API Oficial, suporte
-- (tickets) e dicas do admin para os clientes.
--
-- Convenções iguais às migrações anteriores:
--   public.auth_org_id()  → org_id do usuário logado
--   public.is_admin()     → true para role 'admin' e 'superadmin'
-- O painel admin acessa via service role (ignora RLS); as policies abaixo
-- protegem o acesso dos CLIENTES (anon/usuário logado).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- system_notifications — popups/banners globais controlados pelo admin
-- (manutenção, alerta, informação, novidade). Aparecem no topo do /app.
-- ------------------------------------------------------------------------------
create table if not exists public.system_notifications (
  id          uuid primary key default gen_random_uuid(),
  type        text not null default 'info'
              check (type in ('maintenance', 'alert', 'info', 'feature')),
  title       text not null,
  message     text not null,
  active      boolean not null default true,
  -- manutenção não pode ser fechada pelo cliente (dismissible=false)
  dismissible boolean not null default true,
  -- 'all' = todos os clientes | um org_id (texto) = somente aquela organização
  target      text not null default 'all',
  -- janela de exibição opcional
  starts_at   timestamptz,
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists idx_system_notifications_active
  on public.system_notifications (active, expires_at);

alter table public.system_notifications enable row level security;

-- Cliente logado lê apenas notificações ativas, dentro da janela e destinadas
-- a ele (todos ou a sua organização). O admin gerencia tudo.
create policy "sysnotif: clientes leem ativas" on public.system_notifications
  for select using (
    auth.uid() is not null
    and active
    and (starts_at is null or starts_at <= now())
    and (expires_at is null or expires_at > now())
    and (target = 'all' or target = public.auth_org_id()::text)
  );
create policy "sysnotif: admin gerencia" on public.system_notifications
  for all using (public.is_admin()) with check (public.is_admin());

-- Banner ao vivo: o cliente recebe novas notificações sem recarregar a página
alter publication supabase_realtime add table public.system_notifications;

-- ------------------------------------------------------------------------------
-- api_oficial_requests — pedidos de número novo com API Oficial da Meta
-- (produto interno: setup + mensalidade). Gera lead para a equipe.
-- ------------------------------------------------------------------------------
create table if not exists public.api_oficial_requests (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid references public.organizations (id) on delete set null,
  company_name    text,
  document        text,            -- CNPJ ou CPF (MEI)
  desired_phone   text,
  contact_name    text,
  contact_email   text,
  contact_whatsapp text,
  status          text not null default 'pending'
                  check (status in ('pending', 'contacted', 'in_progress', 'completed', 'rejected')),
  notes           text not null default '',
  created_at      timestamptz not null default now()
);

create index if not exists idx_api_oficial_requests_status
  on public.api_oficial_requests (status, created_at desc);

alter table public.api_oficial_requests enable row level security;

-- Cliente cria o pedido vinculado à própria organização e enxerga os próprios;
-- admin gerencia (status/notas) — via service role no painel.
create policy "api_req: cliente cria" on public.api_oficial_requests
  for insert with check (
    auth.uid() is not null
    and (org_id is null or org_id = public.auth_org_id() or public.is_admin())
  );
create policy "api_req: cliente lê os seus" on public.api_oficial_requests
  for select using (org_id = public.auth_org_id() or public.is_admin());
create policy "api_req: admin atualiza" on public.api_oficial_requests
  for update using (public.is_admin()) with check (public.is_admin());
create policy "api_req: admin exclui" on public.api_oficial_requests
  for delete using (public.is_admin());

-- ------------------------------------------------------------------------------
-- support_tickets — chamados abertos pelos clientes (botão de suporte flutuante)
-- ------------------------------------------------------------------------------
create table if not exists public.support_tickets (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid references public.organizations (id) on delete set null,
  author_id    uuid references auth.users (id) on delete set null,
  author_name  text not null default '',
  author_email text not null default '',
  subject      text not null default '',
  message      text not null,
  status       text not null default 'open'
               check (status in ('open', 'answered', 'closed')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_support_tickets_status
  on public.support_tickets (status, updated_at desc);
create index if not exists idx_support_tickets_org
  on public.support_tickets (org_id, created_at desc);

alter table public.support_tickets enable row level security;

create policy "tickets: cliente cria" on public.support_tickets
  for insert with check (
    auth.uid() is not null
    and (org_id is null or org_id = public.auth_org_id() or public.is_admin())
  );
create policy "tickets: cliente lê os seus" on public.support_tickets
  for select using (org_id = public.auth_org_id() or public.is_admin());
create policy "tickets: admin atualiza" on public.support_tickets
  for update using (public.is_admin()) with check (public.is_admin());

-- Respostas da conversa do ticket (cliente ↔ equipe)
create table if not exists public.support_ticket_messages (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references public.support_tickets (id) on delete cascade,
  author_id  uuid references auth.users (id) on delete set null,
  from_admin boolean not null default false,
  body       text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_support_ticket_messages_ticket
  on public.support_ticket_messages (ticket_id, created_at);

alter table public.support_ticket_messages enable row level security;

create policy "ticket_msgs: membros leem" on public.support_ticket_messages
  for select using (
    exists (
      select 1 from public.support_tickets ti
      where ti.id = ticket_id
        and (ti.org_id = public.auth_org_id() or public.is_admin())
    )
  );
create policy "ticket_msgs: membros inserem" on public.support_ticket_messages
  for insert with check (
    exists (
      select 1 from public.support_tickets ti
      where ti.id = ticket_id
        and (ti.org_id = public.auth_org_id() or public.is_admin())
    )
  );

-- ------------------------------------------------------------------------------
-- client_tips — dicas/sugestões do admin que aparecem no painel dos clientes
-- ------------------------------------------------------------------------------
create table if not exists public.client_tips (
  id         uuid primary key default gen_random_uuid(),
  emoji      text not null default '💡',
  title      text not null,
  body       text not null,
  cta_label  text,
  cta_href   text,
  -- 'all' = todos | um org_id específico
  target     text not null default 'all',
  active     boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_client_tips_active
  on public.client_tips (active, sort_order);

alter table public.client_tips enable row level security;

create policy "tips: clientes leem ativas" on public.client_tips
  for select using (
    auth.uid() is not null
    and active
    and (target = 'all' or target = public.auth_org_id()::text)
  );
create policy "tips: admin gerencia" on public.client_tips
  for all using (public.is_admin()) with check (public.is_admin());
