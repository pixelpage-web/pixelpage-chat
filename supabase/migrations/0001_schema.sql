-- ==============================================================================
-- ZARI API — Migração inicial: schema completo, RLS, funções e realtime
-- Execute no SQL Editor do Supabase (ou via CLI: supabase db push)
-- ==============================================================================

-- gen_random_uuid() já vem habilitado no Supabase via pgcrypto
create extension if not exists pgcrypto;

-- ==============================================================================
-- TABELAS
-- ==============================================================================

-- Organizações (tenants)
create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  owner_id   uuid not null references auth.users (id) on delete restrict,
  -- Suspensão manual pelo admin (organização suspensa não processa mensagens)
  suspended  boolean not null default false,
  created_at timestamptz not null default now()
);

-- Perfis (1:1 com auth.users) — role 'admin' é global (equipe Zari)
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  org_id     uuid references public.organizations (id) on delete set null,
  role       text not null default 'agent' check (role in ('admin', 'owner', 'agent')),
  name       text not null default '',
  created_at timestamptz not null default now()
);

-- Planos (editáveis pelo admin sem mexer em código)
create table public.plans (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null unique,
  price_cents        integer not null default 0,
  ai_messages_limit  integer not null default 0,
  connections_limit  integer not null default 1,
  -- null = equipe ilimitada
  team_limit         integer,
  features           jsonb not null default '{}'::jsonb,
  active             boolean not null default true,
  created_at         timestamptz not null default now()
);

-- Assinaturas (uma por organização)
create table public.subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null unique references public.organizations (id) on delete cascade,
  plan_id               uuid not null references public.plans (id) on delete restrict,
  status                text not null default 'trial'
                        check (status in ('trial', 'active', 'past_due', 'canceled')),
  asaas_subscription_id text,
  asaas_customer_id     text,
  trial_ends_at         timestamptz,
  current_period_end    timestamptz,
  created_at            timestamptz not null default now()
);

-- Conexões WhatsApp (números conectados via Embedded Signup)
create table public.whatsapp_connections (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  label           text not null default 'Principal',
  waba_id         text,
  phone_number_id text,
  phone_display   text,
  mode            text not null default 'manual'
                  check (mode in ('manual', 'ai_bot', 'external_webhook')),
  status          text not null default 'pending'
                  check (status in ('pending', 'connected', 'disconnected')),
  connected_at    timestamptz,
  created_at      timestamptz not null default now()
);

-- Agentes IA (bot nativo) — connection_id null permite configurar/testar
-- o bot ANTES do WhatsApp estar conectado (simulador)
create table public.agents (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id) on delete cascade,
  connection_id     uuid references public.whatsapp_connections (id) on delete set null,
  name              text not null default 'Assistente',
  system_prompt     text not null default '',
  tone_preset       text not null default 'suporte'
                    check (tone_preset in ('vendedor', 'suporte', 'formal', 'casual')),
  welcome_message   text not null default '',
  away_message      text not null default '',
  business_hours    jsonb not null default '{}'::jsonb,
  handoff_keywords  text[] not null default '{}',
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

-- FAQs do agente (entram no system prompt do bot)
create table public.agent_faqs (
  id        uuid primary key default gen_random_uuid(),
  agent_id  uuid not null references public.agents (id) on delete cascade,
  question  text not null,
  answer    text not null,
  position  integer not null default 0
);

-- Webhooks externos (n8n do cliente)
create table public.external_webhooks (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  connection_id  uuid references public.whatsapp_connections (id) on delete set null,
  url            text not null,
  -- Secret usado na assinatura HMAC SHA-256 do payload (X-Zari-Signature)
  secret         text not null,
  active         boolean not null default true,
  last_status    integer,
  failures_count integer not null default 0,
  created_at     timestamptz not null default now()
);

-- Log dos disparos de webhook externo
create table public.webhook_logs (
  id          uuid primary key default gen_random_uuid(),
  webhook_id  uuid not null references public.external_webhooks (id) on delete cascade,
  event       text not null,
  status_code integer,
  response_ms integer,
  error       text,
  created_at  timestamptz not null default now()
);

-- Contatos (clientes finais que mandam mensagem no WhatsApp da empresa)
create table public.contacts (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  phone      text not null,
  name       text,
  notes      text not null default '',
  tags       text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (org_id, phone)
);

-- Conversas do inbox
create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  connection_id   uuid references public.whatsapp_connections (id) on delete set null,
  contact_id      uuid not null references public.contacts (id) on delete cascade,
  status          text not null default 'open' check (status in ('open', 'resolved')),
  -- bot pausado nesta conversa (humano assumiu / handoff)
  bot_paused      boolean not null default false,
  assigned_to     uuid references public.profiles (id) on delete set null,
  last_message_at timestamptz not null default now(),
  unread_count    integer not null default 0,
  created_at      timestamptz not null default now()
);

-- Mensagens
create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  direction       text not null check (direction in ('inbound', 'outbound')),
  sender_type     text not null check (sender_type in ('contact', 'human', 'ai_bot', 'external')),
  content         text not null default '',
  message_type    text not null default 'text'
                  check (message_type in ('text', 'image', 'audio', 'document')),
  -- id da mensagem na Meta (wamid) — usado para deduplicar retries do webhook
  meta_message_id text,
  created_at      timestamptz not null default now()
);

-- API keys da organização (armazenadas como hash SHA-256, nunca em claro)
create table public.api_keys (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  key_hash     text not null unique,
  label        text not null default 'Padrão',
  last_used_at timestamptz,
  created_at   timestamptz not null default now()
);

-- Contadores de uso (mensagens IA por mês)
create table public.usage_counters (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  period_start     date not null,
  ai_messages_used integer not null default 0,
  unique (org_id, period_start)
);

-- Configurações globais do admin (valores em env têm prioridade no app)
create table public.admin_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Trilha de auditoria
create table public.audit_logs (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid references public.organizations (id) on delete cascade,
  actor_id   uuid references auth.users (id) on delete set null,
  action     text not null,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ==============================================================================
-- ÍNDICES
-- ==============================================================================

create index idx_profiles_org on public.profiles (org_id);
create index idx_subscriptions_org on public.subscriptions (org_id);
create index idx_connections_org on public.whatsapp_connections (org_id);
-- Identificação do tenant pelo phone_number_id no webhook da Meta (caminho quente)
create index idx_connections_phone_number_id on public.whatsapp_connections (phone_number_id);
create index idx_agents_org on public.agents (org_id);
create index idx_agent_faqs_agent on public.agent_faqs (agent_id, position);
create index idx_external_webhooks_org on public.external_webhooks (org_id);
create index idx_webhook_logs_webhook on public.webhook_logs (webhook_id, created_at desc);
create index idx_contacts_org on public.contacts (org_id);
create index idx_conversations_org on public.conversations (org_id, last_message_at desc);
create index idx_conversations_contact on public.conversations (contact_id);
create index idx_messages_conversation on public.messages (conversation_id, created_at);
-- Dedup de retries do webhook da Meta
create unique index idx_messages_meta_id on public.messages (meta_message_id)
  where meta_message_id is not null;
create index idx_api_keys_org on public.api_keys (org_id);
create index idx_usage_counters_org on public.usage_counters (org_id);
create index idx_audit_logs_org on public.audit_logs (org_id, created_at desc);

-- ==============================================================================
-- FUNÇÕES AUXILIARES DE RLS
-- (SECURITY DEFINER para evitar recursão nas policies de profiles)
-- ==============================================================================

create or replace function public.auth_org_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select org_id from public.profiles where id = auth.uid();
$$;

create or replace function public.auth_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'admin' from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ==============================================================================
-- RLS — cada organização só acessa os próprios dados; admin global vê tudo
-- ==============================================================================

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.whatsapp_connections enable row level security;
alter table public.agents enable row level security;
alter table public.agent_faqs enable row level security;
alter table public.external_webhooks enable row level security;
alter table public.webhook_logs enable row level security;
alter table public.contacts enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.api_keys enable row level security;
alter table public.usage_counters enable row level security;
alter table public.admin_settings enable row level security;
alter table public.audit_logs enable row level security;

-- ---------- organizations ----------
create policy "org: membros leem" on public.organizations
  for select using (id = public.auth_org_id() or public.is_admin());
create policy "org: dono atualiza" on public.organizations
  for update using (
    (id = public.auth_org_id() and public.auth_role() = 'owner') or public.is_admin()
  );
create policy "org: admin gerencia" on public.organizations
  for delete using (public.is_admin());
create policy "org: admin insere" on public.organizations
  for insert with check (public.is_admin());

-- ---------- profiles ----------
create policy "profiles: ver a si e à equipe" on public.profiles
  for select using (
    id = auth.uid() or org_id = public.auth_org_id() or public.is_admin()
  );
create policy "profiles: atualizar próprio" on public.profiles
  for update using (
    id = auth.uid()
    or public.is_admin()
    or (public.auth_role() = 'owner' and org_id = public.auth_org_id())
  );
create policy "profiles: dono remove membro" on public.profiles
  for delete using (
    public.is_admin()
    or (public.auth_role() = 'owner' and org_id = public.auth_org_id() and id <> auth.uid())
  );
create policy "profiles: admin insere" on public.profiles
  for insert with check (public.is_admin());

-- ---------- plans (catálogo visível a todos os autenticados) ----------
create policy "plans: autenticados leem ativos" on public.plans
  for select using (auth.uid() is not null and (active or public.is_admin()));
create policy "plans: admin gerencia" on public.plans
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- subscriptions ----------
create policy "subscriptions: membros leem" on public.subscriptions
  for select using (org_id = public.auth_org_id() or public.is_admin());
create policy "subscriptions: admin gerencia" on public.subscriptions
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- whatsapp_connections ----------
create policy "connections: membros tudo" on public.whatsapp_connections
  for all using (org_id = public.auth_org_id() or public.is_admin())
  with check (org_id = public.auth_org_id() or public.is_admin());

-- ---------- agents ----------
create policy "agents: membros tudo" on public.agents
  for all using (org_id = public.auth_org_id() or public.is_admin())
  with check (org_id = public.auth_org_id() or public.is_admin());

-- ---------- agent_faqs (via agente) ----------
create policy "faqs: membros tudo" on public.agent_faqs
  for all using (
    exists (
      select 1 from public.agents a
      where a.id = agent_id and (a.org_id = public.auth_org_id() or public.is_admin())
    )
  )
  with check (
    exists (
      select 1 from public.agents a
      where a.id = agent_id and (a.org_id = public.auth_org_id() or public.is_admin())
    )
  );

-- ---------- external_webhooks ----------
create policy "webhooks: membros tudo" on public.external_webhooks
  for all using (org_id = public.auth_org_id() or public.is_admin())
  with check (org_id = public.auth_org_id() or public.is_admin());

-- ---------- webhook_logs (somente leitura; escrita via service role) ----------
create policy "webhook_logs: membros leem" on public.webhook_logs
  for select using (
    exists (
      select 1 from public.external_webhooks w
      where w.id = webhook_id and (w.org_id = public.auth_org_id() or public.is_admin())
    )
  );

-- ---------- contacts ----------
create policy "contacts: membros tudo" on public.contacts
  for all using (org_id = public.auth_org_id() or public.is_admin())
  with check (org_id = public.auth_org_id() or public.is_admin());

-- ---------- conversations ----------
create policy "conversations: membros tudo" on public.conversations
  for all using (org_id = public.auth_org_id() or public.is_admin())
  with check (org_id = public.auth_org_id() or public.is_admin());

-- ---------- messages (via conversa) ----------
create policy "messages: membros leem" on public.messages
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (c.org_id = public.auth_org_id() or public.is_admin())
    )
  );
create policy "messages: membros inserem" on public.messages
  for insert with check (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (c.org_id = public.auth_org_id() or public.is_admin())
    )
  );

-- ---------- api_keys (somente o dono da org gerencia) ----------
create policy "api_keys: dono tudo" on public.api_keys
  for all using (
    (org_id = public.auth_org_id() and public.auth_role() = 'owner') or public.is_admin()
  )
  with check (
    (org_id = public.auth_org_id() and public.auth_role() = 'owner') or public.is_admin()
  );

-- ---------- usage_counters (leitura; escrita via service role) ----------
create policy "usage: membros leem" on public.usage_counters
  for select using (org_id = public.auth_org_id() or public.is_admin());

-- ---------- admin_settings (somente admin) ----------
create policy "settings: admin tudo" on public.admin_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- audit_logs ----------
create policy "audit: membros leem" on public.audit_logs
  for select using (org_id = public.auth_org_id() or public.is_admin());
create policy "audit: membros inserem" on public.audit_logs
  for insert with check (org_id = public.auth_org_id() or public.is_admin());

-- ==============================================================================
-- TRIGGERS
-- ==============================================================================

-- Ao inserir mensagem: atualiza last_message_at da conversa, incrementa não
-- lidas para inbound e reabre conversa resolvida quando o contato responde
create or replace function public.on_message_inserted()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  update public.conversations
  set
    last_message_at = new.created_at,
    unread_count = case
      when new.direction = 'inbound' then unread_count + 1
      else unread_count
    end,
    status = case
      when new.direction = 'inbound' then 'open'
      else status
    end
  where id = new.conversation_id;
  return new;
end;
$$;

create trigger trg_message_inserted
  after insert on public.messages
  for each row execute function public.on_message_inserted();

-- ==============================================================================
-- RPCs
-- ==============================================================================

-- Cria a organização do usuário logado (onboarding passo 1):
-- organização + perfil de dono + assinatura trial de 7 dias no plano Trial
create or replace function public.create_organization(p_name text, p_slug text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_plan uuid;
  v_slug text;
  v_user_name text;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;

  if exists (select 1 from public.profiles where id = auth.uid() and org_id is not null) then
    raise exception 'Usuário já pertence a uma organização';
  end if;

  -- Garante slug único com sufixo aleatório
  v_slug := left(coalesce(nullif(p_slug, ''), 'org'), 40) || '-' || substr(md5(random()::text), 1, 6);

  insert into public.organizations (name, slug, owner_id)
  values (p_name, v_slug, auth.uid())
  returning id into v_org;

  v_user_name := coalesce(
    (select raw_user_meta_data ->> 'name' from auth.users where id = auth.uid()),
    (select raw_user_meta_data ->> 'full_name' from auth.users where id = auth.uid()),
    split_part((select email from auth.users where id = auth.uid()), '@', 1)
  );

  -- Admin global mantém a role 'admin' mesmo ao criar a própria organização
  insert into public.profiles (id, org_id, role, name)
  values (auth.uid(), v_org, 'owner', coalesce(v_user_name, ''))
  on conflict (id) do update
    set org_id = excluded.org_id,
        role = case when public.profiles.role = 'admin' then 'admin' else 'owner' end;

  select id into v_plan from public.plans where name = 'Trial' limit 1;
  if v_plan is not null then
    insert into public.subscriptions (org_id, plan_id, status, trial_ends_at)
    values (v_org, v_plan, 'trial', now() + interval '7 days');
  end if;

  insert into public.audit_logs (org_id, actor_id, action, metadata)
  values (v_org, auth.uid(), 'organization.created', jsonb_build_object('name', p_name));

  return v_org;
end;
$$;

-- Incremento atômico do contador de mensagens IA do mês corrente.
-- Chamado pelo servidor (service role) a cada resposta do bot.
create or replace function public.increment_ai_usage(p_org_id uuid)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_used integer;
begin
  insert into public.usage_counters (org_id, period_start, ai_messages_used)
  values (p_org_id, date_trunc('month', now())::date, 1)
  on conflict (org_id, period_start)
  do update set ai_messages_used = public.usage_counters.ai_messages_used + 1
  returning ai_messages_used into v_used;
  return v_used;
end;
$$;

-- Zera o contador de não lidas ao abrir a conversa no inbox
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  update public.conversations
  set unread_count = 0
  where id = p_conversation_id
    and (org_id = public.auth_org_id() or public.is_admin());
end;
$$;

-- ==============================================================================
-- REALTIME — inbox ao vivo (respeita RLS nas assinaturas postgres_changes)
-- ==============================================================================

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;
