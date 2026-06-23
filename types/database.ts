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
export type ConnectionMode = "manual" | "ai_bot" | "external_webhook";
export type ConnectionStatus = "pending" | "connected" | "disconnected";
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
};

export type ProfileRow = {
  id: string;
  org_id: string | null;
  role: Role;
  name: string;
  notification_prefs: Json;
  created_at: string;
};

export type PlanRow = {
  id: string;
  name: string;
  price_cents: number;
  ai_messages_limit: number;
  connections_limit: number;
  team_limit: number | null;
  campaigns_limit: number | null;
  highlight: boolean;
  sort_order: number;
  features: Json;
  active: boolean;
  created_at: string;
};

export type SubscriptionRow = {
  id: string;
  org_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  asaas_subscription_id: string | null;
  asaas_customer_id: string | null;
  trial_ends_at: string | null;
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
  assigned_to: string | null;
  current_flow_id: string | null;
  current_flow_node_id: string | null;
  flow_state: Json;
  csat_sent_at: string | null;
  ai_summary: Json | null;
  last_message_at: string;
  unread_count: number;
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
    };
    Views: Record<string, never>;
    Functions: {
      create_organization: {
        Args: { p_name: string; p_slug: string };
        Returns: string;
      };
      increment_ai_usage: {
        Args: { p_org_id: string };
        Returns: number;
      };
      mark_conversation_read: {
        Args: { p_conversation_id: string };
        Returns: undefined;
      };
      auth_org_id: { Args: Record<string, never>; Returns: string | null };
      auth_role: { Args: Record<string, never>; Returns: string | null };
      is_admin: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
