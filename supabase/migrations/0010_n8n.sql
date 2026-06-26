-- ==============================================================================
-- PIXELPAGE CHAT — Integração n8n
-- Suporte ao "workflow pronto da plataforma" (1 clique) além do webhook do
-- n8n próprio do cliente, na mesma tabela external_webhooks.
-- ==============================================================================

-- use_platform_workflow: cliente usa o workflow hospedado pela plataforma
--   (pixelpage.app.n8n.cloud) em vez de apontar para o n8n dele.
-- platform_workflow_id: identificador do workflow ativado (para rastreio).
-- webhook_doc_accepted: confirmação de que o cliente leu a doc de configuração.
alter table public.external_webhooks
  add column if not exists use_platform_workflow boolean not null default false,
  add column if not exists platform_workflow_id text,
  add column if not exists webhook_doc_accepted boolean not null default false,
  add column if not exists webhook_doc_accepted_at timestamptz;
