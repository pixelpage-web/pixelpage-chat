-- ==============================================================================
-- PIXELPAGE CHAT — Super Admin: extensões de trial, feature flags, auditoria
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- trial_extensions — histórico de extensões de trial por organização
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trial_extensions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  extended_by     uuid REFERENCES auth.users (id),
  days_added      integer NOT NULL,
  previous_end_at timestamptz,
  new_end_at      timestamptz,
  reason          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trial_extensions_org
  ON public.trial_extensions (org_id, created_at DESC);

ALTER TABLE public.trial_extensions ENABLE ROW LEVEL SECURITY;
-- Somente service_role lê/escreve (painel admin usa service key)
CREATE POLICY "trial_ext: bloqueado para auth" ON public.trial_extensions
  USING (false);

-- Contador de extensões por assinatura
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS trial_extended_count integer NOT NULL DEFAULT 0;

-- ------------------------------------------------------------------------------
-- feature_flags — flags para habilitar/desabilitar funcionalidades por org
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key              text UNIQUE NOT NULL,
  name             text NOT NULL,
  description      text,
  enabled_globally boolean NOT NULL DEFAULT false,
  enabled_for_orgs uuid[]  NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
-- Qualquer usuário autenticado pode LER flags (para checar no cliente)
CREATE POLICY "flags: autenticados leem" ON public.feature_flags
  FOR SELECT USING (true);
-- Escrita exclusiva via service_role (painel admin)
CREATE POLICY "flags: bloqueado para escrita auth" ON public.feature_flags
  FOR ALL USING (false);

-- ------------------------------------------------------------------------------
-- admin_audit_logs — log de ações sensíveis realizadas pelo super admin
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action      text NOT NULL,
  target_type text,
  target_id   uuid,
  target_name text,
  details     jsonb NOT NULL DEFAULT '{}',
  ip_address  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_created
  ON public.admin_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_action
  ON public.admin_audit_logs (action, created_at DESC);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
-- Somente service_role (painel admin nunca expõe via API pública)
CREATE POLICY "admin_audit: bloqueado para auth" ON public.admin_audit_logs
  USING (false);

-- ------------------------------------------------------------------------------
-- Garantir apenas um superadmin na plataforma
-- ------------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_superadmin
  ON public.profiles (role) WHERE role = 'superadmin';

-- ------------------------------------------------------------------------------
-- Seed: feature flags padrão da plataforma
-- ------------------------------------------------------------------------------
INSERT INTO public.feature_flags (key, name, description, enabled_globally) VALUES
  ('campaigns',             'Campanhas',             'Disparos em massa via WhatsApp',                    true),
  ('ai_knowledge_training', 'Treinamento de IA',     'Upload de documentos e URLs para treinar o bot',    true),
  ('api_access',            'Acesso à API',          'API pública /api/v1',                               true),
  ('embedded_signup',       'Embedded Signup Meta',  'Conexão WhatsApp via API Oficial Meta',             false),
  ('help_center',           'Central de Ajuda',      'Base de conhecimento pública',                      false),
  ('dashboard_apps',        'Dashboard Apps',        'Iframes personalizados no painel do agente',        false),
  ('advanced_reports',      'Relatórios Avançados',  'Relatórios detalhados de agentes e etiquetas',      true)
ON CONFLICT (key) DO NOTHING;
