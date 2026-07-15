-- ============================================================================
-- 0041: business_expenses — controle de custos operacionais do próprio
-- negócio (Vercel, Supabase, IA, domínio, ferramentas, marketing...),
-- separado das subscriptions de receita dos clientes. Somente superadmin
-- acessa — mesmo padrão de admin_settings/plans/client_tips (0001/0009):
-- uma única policy `for all using (is_admin()) with check (is_admin())`.
-- ============================================================================

create table public.business_expenses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in (
    'infraestrutura', 'ia', 'pagamento', 'dominio_hospedagem',
    'ferramentas', 'marketing', 'outro'
  )),
  provider text,
  amount_cents integer not null,
  currency text not null default 'BRL',
  billing_cycle text not null check (billing_cycle in (
    'mensal', 'anual', 'unico'
  )),
  next_charge_date date,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.business_expenses enable row level security;

create policy "business_expenses: admin tudo" on public.business_expenses
  for all using (public.is_admin()) with check (public.is_admin());
