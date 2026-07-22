/**
 * Tipos do banco Supabase (espelham supabase/migrations/0001_schema.sql).
 * Mantidos à mão para o client tipado do supabase-js.
 * Importante: usar type aliases (não interfaces) — o supabase-js exige
 * index signature implícita (Record<string, unknown>) nos Rows.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Role = "superadmin" | "admin" | "owner" | "manager" | "agent";
export type SubscriptionStatus = "trial" | "active" | "past_due" | "canceled";
export type PaymentProvider = "stripe";
export type ConnectionMode = "manual" | "ai_bot" | "external_webhook";
export type ConnectionStatus = "pending" | "connected" | "disconnected" | "error";
export type ConnectionType = "meta_api" | "qr_code";
export type TonePreset = "vendedor" | "suporte" | "formal" | "casual";
export type ConversationStatus = "open" | "resolved" | "pending";
export type MessageDirection = "inbound" | "outbound";
export type SenderType = "contact" | "human" | "ai_bot" | "external";
export type MessageType =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "sticker";
export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "running"
  | "completed"
  | "failed";
export type CampaignContactStatus = "pending" | "sent" | "delivered" | "failed";
export type TemplateMetaStatus = "draft" | "pending" | "approved" | "rejected";
export type FlowStatus = "draft" | "published";
export type KnowledgeSourceType = "file" | "url";
export type KnowledgeStatus = "processing" | "ready" | "error";
export type AutomationTriggerType =
  | "message_received"
  | "keyword_match"
  | "no_response"
  | "outside_hours"
  | "new_conversation"
  | "conversation_resolved";
export type ScheduledJobType = "csat_send" | "flow_resume" | "automation_check";
export type ScheduledJobStatus = "pending" | "done" | "error" | "canceled";
export type ReferralStatus = "pending" | "activated" | "rewarded" | "canceled";
export type RewardType = "discount_20" | "discount_50" | "free_month" | "free_3months";
export type RewardStatus = "pending" | "applied" | "expired";
export type ReferralMilestone = 3 | 7 | 10 | 20;
export type ReferralNotificationType =
  | "referral_pending"
  | "referral_activated"
  | "reward_ready"
  | "reward_applied";

export type AiMode = "managed" | "byok" | "disabled";
export type AiProvider = "anthropic" | "openai";
export type ExpenseCategory =
  | "infraestrutura"
  | "ia"
  | "pagamento"
  | "dominio_hospedagem"
  | "ferramentas"
  | "marketing"
  | "outro";
export type ExpenseBillingCycle = "mensal" | "anual" | "unico";

export type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  suspended: boolean;
  logo_url: string | null;
  segment: string | null;
  phone: string | null;
  created_at: string;
  // 0028 — BYOK de IA por organização
  ai_mode: string;
  ai_provider: string | null;
  ai_byok_verified_at: string | null;
};

export type ProfileRow = {
  id: string;
  org_id: string | null;
  role: Role;
  name: string;
  notification_prefs: Json;
  created_at: string;
  cpf: string | null;
  phone: string | null;
  terms_accepted_at: string | null;
};

export type PlanRow = {
  id: string;
  name: string;
  price_cents: number;
  ai_messages_limit: number;
  connections_limit: number | null;
  team_limit: number | null;
  campaigns_limit: number | null;
  highlight: boolean;
  sort_order: number;
  features: Json;
  active: boolean;
  created_at: string;
  max_ai_cost_usd_monthly: number | null;
  allow_official_api: boolean;
  stripe_price_id: string | null;
};

export type SubscriptionRow = {
  id: string;
  org_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  payment_provider: PaymentProvider;
  cakto_subscription_id: string | null;
  stripe_subscription_id: string | null;
  trial_ends_at: string | null;
  trial_extended_count: number;
  current_period_end: string | null;
  created_at: string;
};

export type WhatsappConnectionRow = {
  id: string;
  org_id: string;
  label: string;
  connection_type: ConnectionType;
  waba_id: string | null;
  phone_number_id: string | null;
  phone_display: string | null;
  evolution_instance_id: string | null;
  evolution_instance_token: string | null;
  mode: ConnectionMode;
  status: ConnectionStatus;
  csat_enabled: boolean;
  csat_message: string | null;
  csat_delay_minutes: number;
  connected_at: string | null;
  error_detail: string | null;
  created_at: string;
};

export type AgentRow = {
  id: string;
  org_id: string;
  connection_id: string | null;
  name: string;
  system_prompt: string;
  tone_preset: TonePreset;
  welcome_message: string;
  away_message: string;
  business_hours: Json;
  handoff_keywords: string[];
  active: boolean;
  created_at: string;
};

export type AgentFaqRow = {
  id: string;
  agent_id: string;
  question: string;
  answer: string;
  position: number;
};

export type ExternalWebhookRow = {
  id: string;
  org_id: string;
  connection_id: string | null;
  url: string;
  secret: string;
  active: boolean;
  last_status: number | null;
  failures_count: number;
  // n8n: usar o workflow pronto da plataforma em vez do n8n próprio do cliente
  use_platform_workflow: boolean;
  platform_workflow_id: string | null;
  webhook_doc_accepted: boolean;
  webhook_doc_accepted_at: string | null;
  subscribed_events: string[];
  created_at: string;
};

export type WebhookLogRow = {
  id: string;
  webhook_id: string;
  event: string;
  status_code: number | null;
  response_ms: number | null;
  error: string | null;
  payload: Json | null;
  created_at: string;
};

export type ContactRow = {
  id: string;
  org_id: string;
  phone: string;
  name: string | null;
  /** true quando Patrick editou o nome manualmente — nunca sobrescrever com pushName */
  name_manually_set: boolean;
  email: string | null;
  birth_date: string | null;
  avatar_url: string | null;
  profile_photo_status: 'available' | 'private' | 'unknown' | null;
  notes: string;
  tags: string[];
  blocked: boolean;
  created_at: string;
};

export type ConversationRow = {
  id: string;
  org_id: string;
  connection_id: string | null;
  contact_id: string;
  status: ConversationStatus;
  bot_paused: boolean;
  /** true quando a conexão foi desconectada/removida — não aparece no inbox principal */
  archived: boolean;
  assigned_to: string | null;
  current_flow_id: string | null;
  current_flow_node_id: string | null;
  flow_state: Json;
  csat_sent_at: string | null;
  ai_summary: Json | null;
  last_message_at: string;
  unread_count: number;
  unit_id: string | null;
  created_at: string;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  direction: MessageDirection;
  sender_type: SenderType;
  sender_id: string | null;
  content: string;
  message_type: MessageType;
  media_url: string | null;
  meta_message_id: string | null;
  read_at: string | null;
  created_at: string;
};

export type ApiKeyRow = {
  id: string;
  org_id: string;
  key_hash: string;
  label: string;
  last_used_at: string | null;
  created_at: string;
};

export type UsageCounterRow = {
  id: string;
  org_id: string;
  period_start: string;
  ai_messages_used: number;
};

export type AdminSettingRow = {
  key: string;
  value: Json;
  updated_at: string;
};

export type AuditLogRow = {
  id: string;
  org_id: string | null;
  actor_id: string | null;
  action: string;
  metadata: Json;
  created_at: string;
};

export type SuggestionStatus = "new" | "reviewed" | "done";

export type SuggestionRow = {
  id: string;
  org_id: string | null;
  author_id: string | null;
  author_name: string;
  content: string;
  status: SuggestionStatus;
  created_at: string;
};

export type CampaignRow = {
  id: string;
  org_id: string;
  connection_id: string | null;
  name: string;
  status: CampaignStatus;
  message_text: string;
  scheduled_at: string | null;
  total_contacts: number;
  sent: number;
  delivered: number;
  failed: number;
  created_at: string;
};

export type CampaignContactRow = {
  id: string;
  campaign_id: string;
  contact_id: string | null;
  phone: string;
  status: CampaignContactStatus;
  error: string | null;
  sent_at: string | null;
};

export type FlowRow = {
  id: string;
  org_id: string;
  connection_id: string | null;
  name: string;
  status: FlowStatus;
  canvas_data: Json;
  created_at: string;
  updated_at: string;
};

export type AgentKnowledgeRow = {
  id: string;
  agent_id: string;
  source_type: KnowledgeSourceType;
  source_name: string;
  content: string;
  status: KnowledgeStatus;
  error_message: string | null;
  storage_path: string | null;
  meta: Json;
  created_at: string;
};

export type CsatResponseRow = {
  id: string;
  org_id: string;
  conversation_id: string | null;
  contact_id: string | null;
  agent_id: string | null;
  unit_id: string | null;
  score: number;
  created_at: string;
};

export type AutomationRuleRow = {
  id: string;
  org_id: string;
  connection_id: string | null;
  name: string;
  trigger_type: AutomationTriggerType;
  trigger_config: Json;
  actions: Json;
  active: boolean;
  created_at: string;
};

export type ScheduledJobRow = {
  id: string;
  org_id: string | null;
  job_type: ScheduledJobType;
  payload: Json;
  run_at: string;
  status: ScheduledJobStatus;
  error: string | null;
  created_at: string;
};

export type MessageTemplateRow = {
  id: string;
  name: string;
  niche: string;
  content: string;
  language: "pt" | "en";
  meta_status: TemplateMetaStatus;
  active: boolean;
  created_at: string;
};

// ----------------------------------------------------------------------------
// v4 — notificações globais, pedidos de API Oficial, suporte e dicas
// ----------------------------------------------------------------------------
export type NotificationType = "maintenance" | "alert" | "info" | "feature";

export type SystemNotificationRow = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  active: boolean;
  dismissible: boolean;
  target: string;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
};

export type ApiOficialStatus =
  | "pending"
  | "contacted"
  | "in_progress"
  | "completed"
  | "rejected";

export type ApiOficialRequestRow = {
  id: string;
  org_id: string | null;
  company_name: string | null;
  document: string | null;
  desired_phone: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_whatsapp: string | null;
  status: ApiOficialStatus;
  notes: string;
  created_at: string;
};

export type SupportTicketStatus = "open" | "answered" | "closed";

export type SupportTicketRow = {
  id: string;
  org_id: string | null;
  author_id: string | null;
  author_name: string;
  author_email: string;
  subject: string;
  message: string;
  status: SupportTicketStatus;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SupportTicketMessageRow = {
  id: string;
  ticket_id: string;
  author_id: string | null;
  from_admin: boolean;
  body: string;
  created_at: string;
};

export type ClientTipRow = {
  id: string;
  emoji: string;
  title: string;
  body: string;
  cta_label: string | null;
  cta_href: string | null;
  target: string;
  active: boolean;
  sort_order: number;
  created_at: string;
};

// ----------------------------------------------------------------------------
// 0012 — Funcionalidades Chatwoot (respostas prontas, etiquetas, notas, etc.)
// ----------------------------------------------------------------------------

export type CannedResponseRow = {
  id: string;
  org_id: string;
  short_code: string;
  content: string;
  created_by: string | null;
  created_at: string;
};

export type LabelRow = {
  id: string;
  org_id: string;
  title: string;
  description: string | null;
  color: string;
  show_on_sidebar: boolean;
  created_at: string;
};

export type ConversationLabelRow = {
  conversation_id: string;
  label_id: string;
};

export type ContactNoteRow = {
  id: string;
  contact_id: string;
  org_id: string;
  content: string;
  created_by: string | null;
  created_at: string;
};

export type ConversationNoteRow = {
  id: string;
  conversation_id: string;
  org_id: string;
  content: string;
  created_by: string | null;
  created_at: string;
};

export type MentionRow = {
  id: string;
  conversation_id: string;
  note_id: string;
  mentioned_user: string;
  created_by: string | null;
  created_at: string;
};

export type InAppNotificationRow = {
  id: string;
  org_id: string;
  user_id: string;
  notification_type: string;
  conversation_id: string | null;
  actor_id: string | null;
  body: string;
  read_at: string | null;
  created_at: string;
};

export type CustomFilterRow = {
  id: string;
  org_id: string;
  created_by: string | null;
  name: string;
  filter_type: string;
  query: Json;
  created_at: string;
};

export type MacroRow = {
  id: string;
  org_id: string;
  created_by: string | null;
  name: string;
  actions: Json;
  visibility: "private" | "public";
  created_at: string;
};

export type PortalRow = {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  color: string;
  page_title: string | null;
  homepage_link: string | null;
  created_at: string;
};

export type HelpCategoryRow = {
  id: string;
  portal_id: string;
  name: string;
  description: string | null;
  icon: string | null;
  position: number;
};

export type HelpArticleRow = {
  id: string;
  portal_id: string;
  category_id: string | null;
  author_id: string | null;
  title: string;
  content: string;
  status: "draft" | "published";
  views: number;
  created_at: string;
  updated_at: string;
};

export type DashboardAppRow = {
  id: string;
  org_id: string;
  title: string;
  content: Json;
  created_at: string;
};

export type ConversationParticipantRow = {
  conversation_id: string;
  user_id: string;
};

// ----------------------------------------------------------------------------
// 0013 — Super Admin: trial extensions, feature flags, admin audit log
// ----------------------------------------------------------------------------

export type TrialExtensionRow = {
  id: string;
  org_id: string;
  extended_by: string | null;
  days_added: number;
  previous_end_at: string | null;
  new_end_at: string | null;
  reason: string | null;
  created_at: string;
};

export type FeatureFlagRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  enabled_globally: boolean;
  enabled_for_orgs: string[];
  created_at: string;
};

export type AdminAuditLogRow = {
  id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_name: string | null;
  details: Json;
  ip_address: string | null;
  created_at: string;
};

// ----------------------------------------------------------------------------
// 0016 — Sistema de Funcionários (equipe, convites, permissões granulares)
// ----------------------------------------------------------------------------

export type TeamMemberStatus = 'invited' | 'active' | 'disabled';
export type TeamRoleTemplate = 'admin' | 'agent' | 'viewer' | 'custom';

export type TeamMemberRow = {
  id: string;
  org_id: string;
  user_id: string | null;
  email: string;
  name: string;
  status: TeamMemberStatus;
  role_template: TeamRoleTemplate;
  created_by: string | null;
  invited_at: string;
  activated_at: string | null;
  max_conversations: number | null;
};

export type TeamMemberPermissionsRow = {
  team_member_id: string;
  can_view_inbox: boolean;
  can_view_contacts: boolean;
  can_view_campaigns: boolean;
  can_view_agent_ai: boolean;
  can_view_flows: boolean;
  can_view_automations: boolean;
  can_view_connections: boolean;
  can_view_integrations: boolean;
  can_view_reports: boolean;
  can_view_settings: boolean;
  can_view_billing: boolean;
  can_reply_messages: boolean;
  can_pause_bot: boolean;
  can_assign_conversation: boolean;
  can_resolve_conversation: boolean;
  can_archive_conversation: boolean;
  can_add_remove_labels: boolean;
  can_add_internal_notes: boolean;
  can_view_others_notes: boolean;
  can_export_conversation: boolean;
  can_block_contact: boolean;
  inbox_scope: 'all' | 'assigned_only';
  can_edit_contacts: boolean;
  can_delete_contacts: boolean;
  can_import_contacts: boolean;
  can_export_contacts: boolean;
};

export type TeamInviteRow = {
  id: string;
  team_member_id: string;
  token: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
};

// ----------------------------------------------------------------------------
// 0033 — Unidades/filiais (roteamento de conversas por local)
// ----------------------------------------------------------------------------

export type OrgUnitRow = {
  id: string;
  org_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
};

export type TeamMemberUnitRow = {
  profile_id: string;
  unit_id: string;
  created_at: string;
};

// ----------------------------------------------------------------------------
// 0022 — Sistema de Indicações
// ----------------------------------------------------------------------------

export type ReferralLinkRow = {
  id: string;
  org_id: string;
  code: string;
  enabled: boolean;
  clicks: number;
  created_at: string;
};

export type ReferralRow = {
  id: string;
  referrer_org_id: string;
  referred_org_id: string;
  link_id: string;
  status: ReferralStatus;
  activated_at: string | null;
  deleted_at: string | null;
  created_at: string;
};

export type ReferralRewardRow = {
  id: string;
  referral_id: string;
  org_id: string;
  reward_type: RewardType;
  milestone: ReferralMilestone;
  status: RewardStatus;
  expires_at: string | null;
  notes: string | null;
  applied_at: string | null;
  created_at: string;
};

export type ReferralNotificationRow = {
  id: string;
  org_id: string;
  type: ReferralNotificationType;
  referral_id: string | null;
  read: boolean;
  data: Json;
  created_at: string;
};

// 0027 — rastreamento de custo real de IA
export type AiUsageSource = "bot_reply" | "flow" | "summary" | "ai_note" | "simulate";
export type OrgUsageStatus = "ok" | "warning" | "exceeded" | "blocked";

export type AiModelPricingRow = {
  model: string;
  provider: string;
  input_per_mtok: number;
  output_per_mtok: number;
  updated_at: string;
};

export type AiUsageLogRow = {
  id: string;
  org_id: string;
  agent_id: string | null;
  conversation_id: string | null;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  response_time_ms: number | null;
  source: string;
  is_byok: boolean;
  created_at: string;
};

// 0028 — segredos por organização (BYOK de IA + auth do n8n do cliente).
// SEMPRE cifrados (ver lib/crypto.ts). Tabela sem policy para `authenticated` —
// só service_role e a RPC get_org_secrets_status (que nunca expõe o valor cifrado).
export type OrgSecretsRow = {
  org_id: string;
  ai_byok_key_encrypted: string | null;
  n8n_api_key_encrypted: string | null;
  created_at: string;
  updated_at: string;
};

export type OrgUsageMonthlyRow = {
  id: string;
  org_id: string;
  month: string;
  total_messages: number;
  total_ai_messages: number;
  total_human_messages: number;
  total_ai_cost_usd: number;
  plan_limit_messages: number | null;
  plan_limit_ai_cost_usd: number | null;
  status: string;
  updated_at: string;
};

// 0041 — custos operacionais do próprio negócio (Vercel, Supabase, IA,
// domínio, ferramentas...), separado das subscriptions de receita dos
// clientes. Só superadmin acessa (RLS).
export type BusinessExpenseRow = {
  id: string;
  name: string;
  category: ExpenseCategory;
  provider: string | null;
  amount_cents: number;
  currency: string;
  billing_cycle: ExpenseBillingCycle;
  next_charge_date: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

// Insert/Update usam Partial<Row>: o banco preenche id/created_at/defaults,
// e a checagem de obrigatórios fica nas constraints SQL.
type TableShape<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      organizations: TableShape<OrganizationRow>;
      profiles: TableShape<ProfileRow>;
      plans: TableShape<PlanRow>;
      subscriptions: TableShape<SubscriptionRow>;
      whatsapp_connections: TableShape<WhatsappConnectionRow>;
      agents: TableShape<AgentRow>;
      agent_faqs: TableShape<AgentFaqRow>;
      external_webhooks: TableShape<ExternalWebhookRow>;
      webhook_logs: TableShape<WebhookLogRow>;
      contacts: TableShape<ContactRow>;
      conversations: TableShape<ConversationRow>;
      messages: TableShape<MessageRow>;
      api_keys: TableShape<ApiKeyRow>;
      usage_counters: TableShape<UsageCounterRow>;
      admin_settings: TableShape<AdminSettingRow>;
      audit_logs: TableShape<AuditLogRow>;
      suggestions: TableShape<SuggestionRow>;
      campaigns: TableShape<CampaignRow>;
      campaign_contacts: TableShape<CampaignContactRow>;
      message_templates: TableShape<MessageTemplateRow>;
      flows: TableShape<FlowRow>;
      agent_knowledge: TableShape<AgentKnowledgeRow>;
      csat_responses: TableShape<CsatResponseRow>;
      automation_rules: TableShape<AutomationRuleRow>;
      scheduled_jobs: TableShape<ScheduledJobRow>;
      system_notifications: TableShape<SystemNotificationRow>;
      api_oficial_requests: TableShape<ApiOficialRequestRow>;
      support_tickets: TableShape<SupportTicketRow>;
      support_ticket_messages: TableShape<SupportTicketMessageRow>;
      client_tips: TableShape<ClientTipRow>;
      // 0012
      canned_responses: TableShape<CannedResponseRow>;
      labels: TableShape<LabelRow>;
      conversation_labels: TableShape<ConversationLabelRow>;
      contact_notes: TableShape<ContactNoteRow>;
      conversation_notes: TableShape<ConversationNoteRow>;
      mentions: TableShape<MentionRow>;
      in_app_notifications: TableShape<InAppNotificationRow>;
      custom_filters: TableShape<CustomFilterRow>;
      macros: TableShape<MacroRow>;
      portals: TableShape<PortalRow>;
      help_categories: TableShape<HelpCategoryRow>;
      help_articles: TableShape<HelpArticleRow>;
      dashboard_apps: TableShape<DashboardAppRow>;
      conversation_participants: TableShape<ConversationParticipantRow>;
      // 0013
      trial_extensions: TableShape<TrialExtensionRow>;
      feature_flags: TableShape<FeatureFlagRow>;
      admin_audit_logs: TableShape<AdminAuditLogRow>;
      // 0016
      team_members: TableShape<TeamMemberRow>;
      team_member_permissions: TableShape<TeamMemberPermissionsRow>;
      team_invites: TableShape<TeamInviteRow>;
      // 0033
      org_units: TableShape<OrgUnitRow>;
      team_member_units: TableShape<TeamMemberUnitRow>;
      // 0022
      referral_links: TableShape<ReferralLinkRow>;
      referrals: TableShape<ReferralRow>;
      referral_rewards: TableShape<ReferralRewardRow>;
      referral_notifications: TableShape<ReferralNotificationRow>;
      // 0027
      ai_model_pricing: TableShape<AiModelPricingRow>;
      ai_usage_logs: TableShape<AiUsageLogRow>;
      org_usage_monthly: TableShape<OrgUsageMonthlyRow>;
      // 0028
      org_secrets: TableShape<OrgSecretsRow>;
      // 0041
      business_expenses: TableShape<BusinessExpenseRow>;
    };
    Views: Record<string, never>;
    Functions: {
      create_organization: {
        Args: { p_name: string; p_slug: string };
        Returns: string;
      };
      publish_flow: {
        Args: { p_flow_id: string; p_name: string; p_canvas_data: Json };
        Returns: FlowRow;
      };
      check_cpf_available: {
        Args: { p_cpf: string };
        Returns: boolean;
      };
      increment_ai_usage: {
        Args: { p_org_id: string };
        Returns: number;
      };
      mark_conversation_read: {
        Args: { p_conversation_id: string };
        Returns: undefined;
      };
      increment_article_views: {
        Args: { p_article_id: string };
        Returns: undefined;
      };
      auth_org_id: { Args: Record<string, never>; Returns: string | null };
      auth_role: { Args: Record<string, never>; Returns: string | null };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      record_ai_usage: {
        Args: {
          p_org_id: string;
          p_agent_id: string | null;
          p_conversation_id: string | null;
          p_provider: string;
          p_model: string;
          p_input_tokens: number;
          p_output_tokens: number;
          p_cost_usd: number;
          p_response_time_ms: number | null;
          p_source: string;
          p_is_byok?: boolean;
        };
        Returns: {
          previous_status: string;
          new_status: string;
          total_ai_cost_usd: number;
          plan_limit_ai_cost_usd: number | null;
        }[];
      };
      get_org_usage_status: {
        Args: { p_org_id: string };
        Returns: string;
      };
      get_org_secrets_status: {
        Args: { p_org_id: string };
        Returns: { has_ai_key: boolean; has_n8n_key: boolean }[];
      };
      // 0045 — resumo seguro de assinatura (sem IDs de billing); qualquer
      // membro da org pode chamar, mesmo com subscriptions restrita a owner/admin.
      get_org_subscription_summary: {
        Args: { p_org_id: string };
        Returns: {
          plan_id: string;
          status: SubscriptionStatus;
          trial_ends_at: string | null;
          current_period_end: string | null;
        }[];
      };
      // 0029 — dashboard financeiro do Super Admin (leitura; guarda is_admin() interna)
      get_admin_financial_dashboard: {
        Args: { p_month: string };
        Returns: {
          org_id: string;
          org_name: string;
          plan_id: string;
          plan_name: string;
          mrr_usd: number;
          subscription_status: string;
          ai_mode: string;
          ai_cost_usd: number;
          ai_cost_limit_usd: number | null;
          usage_status: string;
          margin_usd: number;
          negative_margin_since: string | null;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
