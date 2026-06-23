-- ==============================================================================
-- ZARI API v3 — Builder de fluxos, conhecimento da IA, CSAT, automações e
-- jobs agendados (CSAT com atraso, bloco "Aguardar" e checagens de automação)
-- ==============================================================================

-- ---------------------------------------------------------------- fluxos (builder visual)
create table if not exists public.flows (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  connection_id uuid references public.whatsapp_connections (id) on delete set null,
  name          text not null default 'Novo fluxo',
  status        text not null default 'draft' check (status in ('draft', 'published')),
  -- canvas_data: { nodes: [{id, type, position:{x,y}, data:{...campos do bloco}}],
  --               edges: [{id, source, target, sourceHandle, targetHandle}] }
  canvas_data   jsonb not null default '{"nodes":[],"edges":[]}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_flows_org on public.flows (org_id, updated_at desc);
-- Caminho quente do pipeline: fluxo publicado da conexão
create index if not exists idx_flows_connection
  on public.flows (connection_id) where status = 'published';

alter table public.flows enable row level security;
create policy "flows: membros tudo" on public.flows
  for all using (org_id = public.auth_org_id() or public.is_admin())
  with check (org_id = public.auth_org_id() or public.is_admin());

-- ---------------------------------------------------------------- conversas: estado do fluxo
alter table public.conversations add column if not exists current_flow_id uuid references public.flows (id) on delete set null;
alter table public.conversations add column if not exists current_flow_node_id text;
alter table public.conversations add column if not exists flow_state jsonb not null default '{}'::jsonb;
-- CSAT: quando a pesquisa foi enviada nesta conversa (evita envio duplicado)
alter table public.conversations add column if not exists csat_sent_at timestamptz;
-- Resumo gerado por IA exibido fixado no topo da conversa no inbox
alter table public.conversations add column if not exists ai_summary jsonb;

-- ---------------------------------------------------------------- conhecimento da IA
create table if not exists public.agent_knowledge (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid not null references public.agents (id) on delete cascade,
  source_type   text not null check (source_type in ('file', 'url')),
  source_name   text not null,
  content       text not null default '',
  status        text not null default 'processing' check (status in ('processing', 'ready', 'error')),
  error_message text,
  -- Caminho no Supabase Storage (bucket "knowledge") para exclusão do arquivo
  storage_path  text,
  -- Metadados (tamanho do arquivo, nº de páginas lidas da URL, etc.)
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_agent_knowledge_agent on public.agent_knowledge (agent_id, created_at desc);

alter table public.agent_knowledge enable row level security;
create policy "knowledge: membros tudo" on public.agent_knowledge
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

-- Bucket privado para os arquivos de treinamento da IA
insert into storage.buckets (id, name, public)
values ('knowledge', 'knowledge', false)
on conflict (id) do nothing;

create policy "knowledge: upload autenticado" on storage.objects
  for insert with check (bucket_id = 'knowledge' and auth.uid() is not null);
create policy "knowledge: leitura autenticada" on storage.objects
  for select using (bucket_id = 'knowledge' and auth.uid() is not null);
create policy "knowledge: exclusão autenticada" on storage.objects
  for delete using (bucket_id = 'knowledge' and auth.uid() is not null);

-- ---------------------------------------------------------------- CSAT
alter table public.whatsapp_connections add column if not exists csat_enabled boolean not null default false;
alter table public.whatsapp_connections add column if not exists csat_message text;
alter table public.whatsapp_connections add column if not exists csat_delay_minutes integer not null default 5;

create table if not exists public.csat_responses (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  contact_id      uuid references public.contacts (id) on delete set null,
  -- Agente responsável pela conversa no momento da avaliação
  agent_id        uuid references public.profiles (id) on delete set null,
  score           integer not null check (score between 1 and 5),
  created_at      timestamptz not null default now()
);

create index if not exists idx_csat_org on public.csat_responses (org_id, created_at desc);
create index if not exists idx_csat_conversation on public.csat_responses (conversation_id);
create index if not exists idx_csat_contact on public.csat_responses (contact_id);

alter table public.csat_responses enable row level security;
-- Escrita acontece pelo pipeline (service role); membros só leem
create policy "csat: membros leem" on public.csat_responses
  for select using (org_id = public.auth_org_id() or public.is_admin());

-- ---------------------------------------------------------------- automações (se → então)
create table if not exists public.automation_rules (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  connection_id  uuid references public.whatsapp_connections (id) on delete set null,
  name           text not null,
  trigger_type   text not null check (trigger_type in (
    'message_received', 'keyword_match', 'no_response', 'outside_hours',
    'new_conversation', 'conversation_resolved'
  )),
  trigger_config jsonb not null default '{}'::jsonb,
  -- [{ type: 'send_message'|'assign_agent'|'add_tag'|'start_flow'
  --        |'notify_email'|'pause_bot'|'send_csat', ...config }]
  actions        jsonb not null default '[]'::jsonb,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

create index if not exists idx_automation_rules_org on public.automation_rules (org_id);

alter table public.automation_rules enable row level security;
create policy "automations: membros tudo" on public.automation_rules
  for all using (org_id = public.auth_org_id() or public.is_admin())
  with check (org_id = public.auth_org_id() or public.is_admin());

-- ---------------------------------------------------------------- jobs agendados
-- Processados pelo cron GET /api/jobs/run (a cada minuto):
--   csat_send        → envia a pesquisa CSAT após o atraso configurado
--   flow_resume      → retoma o fluxo após o bloco "Aguardar"
--   automation_check → checagens adiadas ("sem resposta há X horas", resolvida)
create table if not exists public.scheduled_jobs (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid references public.organizations (id) on delete cascade,
  job_type   text not null check (job_type in ('csat_send', 'flow_resume', 'automation_check')),
  payload    jsonb not null default '{}'::jsonb,
  run_at     timestamptz not null,
  status     text not null default 'pending' check (status in ('pending', 'done', 'error', 'canceled')),
  error      text,
  created_at timestamptz not null default now()
);

create index if not exists idx_scheduled_jobs_due on public.scheduled_jobs (status, run_at);

-- Somente o servidor (service role) acessa — RLS ativo sem policies
alter table public.scheduled_jobs enable row level security;

-- ---------------------------------------------------------------- trigger: conversa resolvida
-- Agenda o envio de CSAT (com o atraso da conexão) e a checagem de automações
-- "conversa resolvida". Cobre todos os caminhos (inbox, API pública, bot).
create or replace function public.on_conversation_resolved()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_csat_enabled boolean;
  v_csat_delay integer;
begin
  if new.status = 'resolved' and old.status is distinct from 'resolved' then
    -- CSAT habilitado na conexão e ainda não enviado nesta conversa
    if new.connection_id is not null and new.csat_sent_at is null then
      select csat_enabled, csat_delay_minutes
        into v_csat_enabled, v_csat_delay
        from public.whatsapp_connections
       where id = new.connection_id;
      if coalesce(v_csat_enabled, false) then
        insert into public.scheduled_jobs (org_id, job_type, payload, run_at)
        values (
          new.org_id,
          'csat_send',
          jsonb_build_object('conversation_id', new.id),
          now() + make_interval(mins => greatest(coalesce(v_csat_delay, 5), 0))
        );
      end if;
    end if;

    -- Automações com gatilho "conversa resolvida"
    if exists (
      select 1 from public.automation_rules
      where org_id = new.org_id and active and trigger_type = 'conversation_resolved'
    ) then
      insert into public.scheduled_jobs (org_id, job_type, payload, run_at)
      values (
        new.org_id,
        'automation_check',
        jsonb_build_object('trigger', 'conversation_resolved', 'conversation_id', new.id),
        now()
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_conversation_resolved on public.conversations;
create trigger trg_conversation_resolved
  after update on public.conversations
  for each row execute function public.on_conversation_resolved();
