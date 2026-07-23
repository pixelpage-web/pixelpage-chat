import type { Json, Role, TeamMemberPermissionsRow, TeamRoleTemplate } from "@/types/database";

/**
 * Fonte única pra "essa rota/UI é só pra dono da org": usada tanto no filtro
 * de nav (components/app-shell.tsx) quanto no guard de rota (redirect) das
 * páginas de billing/integrations/equipe/webhook por conexão. Substitui os
 * `role === "owner" || role === "admin"` soltos e inconsistentes que cada
 * página fazia por conta própria (alguns esqueciam 'superadmin').
 *
 * Nota de escopo: NÃO reconecta o sistema granular ROLE_DEFAULTS/
 * NAV_PERMISSION_MAP abaixo (que viria de `team_members`, legado e
 * desligado — ver comentário em app/app/(shell)/layout.tsx). Ligar aquele
 * mapa completo esconderia Relatórios/Conexões/Campanhas/Configurações/
 * Automações/Agente IA/Fluxos do agent — nenhuma dessas rotas foi
 * identificada como vazamento; seria uma mudança de produto bem maior que
 * o escopo desta correção (billing/integrations/equipe).
 */
export function isOwnerRole(role: Role): boolean {
  return role === "owner" || role === "admin" || role === "superadmin";
}

export type PermissionDefaults = Omit<TeamMemberPermissionsRow, 'team_member_id'>;

export const ROLE_DEFAULTS: Record<TeamRoleTemplate, PermissionDefaults> = {
  admin: {
    can_view_inbox: true, can_view_contacts: true, can_view_campaigns: true,
    can_view_agent_ai: true, can_view_flows: true, can_view_automations: true,
    can_view_connections: true, can_view_integrations: true, can_view_reports: true,
    can_view_settings: true, can_view_billing: true,
    can_reply_messages: true, can_pause_bot: true, can_assign_conversation: true,
    can_resolve_conversation: true, can_archive_conversation: true,
    can_add_remove_labels: true, can_add_internal_notes: true, can_view_others_notes: true,
    can_export_conversation: true, can_block_contact: true, inbox_scope: 'all',
    can_edit_contacts: true, can_delete_contacts: true,
    can_import_contacts: true, can_export_contacts: true,
  },
  agent: {
    can_view_inbox: true, can_view_contacts: true, can_view_campaigns: false,
    can_view_agent_ai: false, can_view_flows: false, can_view_automations: false,
    can_view_connections: false, can_view_integrations: false, can_view_reports: false,
    can_view_settings: false, can_view_billing: false,
    can_reply_messages: true, can_pause_bot: true, can_assign_conversation: true,
    can_resolve_conversation: true, can_archive_conversation: true,
    can_add_remove_labels: true, can_add_internal_notes: true, can_view_others_notes: true,
    can_export_conversation: false, can_block_contact: false, inbox_scope: 'all',
    can_edit_contacts: true, can_delete_contacts: false,
    can_import_contacts: false, can_export_contacts: false,
  },
  viewer: {
    can_view_inbox: true, can_view_contacts: true, can_view_campaigns: false,
    can_view_agent_ai: false, can_view_flows: false, can_view_automations: false,
    can_view_connections: false, can_view_integrations: false, can_view_reports: true,
    can_view_settings: false, can_view_billing: false,
    can_reply_messages: false, can_pause_bot: false, can_assign_conversation: false,
    can_resolve_conversation: false, can_archive_conversation: false,
    can_add_remove_labels: false, can_add_internal_notes: false, can_view_others_notes: true,
    can_export_conversation: false, can_block_contact: false, inbox_scope: 'all',
    can_edit_contacts: false, can_delete_contacts: false,
    can_import_contacts: false, can_export_contacts: false,
  },
  custom: {
    // defaults para custom = agent (editável depois)
    can_view_inbox: true, can_view_contacts: true, can_view_campaigns: false,
    can_view_agent_ai: false, can_view_flows: false, can_view_automations: false,
    can_view_connections: false, can_view_integrations: false, can_view_reports: false,
    can_view_settings: false, can_view_billing: false,
    can_reply_messages: true, can_pause_bot: true, can_assign_conversation: true,
    can_resolve_conversation: true, can_archive_conversation: true,
    can_add_remove_labels: true, can_add_internal_notes: true, can_view_others_notes: true,
    can_export_conversation: false, can_block_contact: false, inbox_scope: 'all',
    can_edit_contacts: true, can_delete_contacts: false,
    can_import_contacts: false, can_export_contacts: false,
  },
};

/** Mapa de permissão de visibilidade para cada rota do nav */
export const NAV_PERMISSION_MAP: Partial<Record<string, keyof PermissionDefaults>> = {
  "/app/inbox": "can_view_inbox",
  "/app/contacts": "can_view_contacts",
  "/app/campaigns": "can_view_campaigns",
  "/app/agent": "can_view_agent_ai",
  "/app/flows": "can_view_flows",
  "/app/automations": "can_view_automations",
  "/app/connections": "can_view_connections",
  "/app/integrations": "can_view_integrations",
  "/app/reports": "can_view_reports",
  "/app/billing": "can_view_billing",
  "/app/settings": "can_view_settings",
};

/**
 * Guard de rota (servidor) equivalente ao isItemVisible do nav
 * (components/app-shell.tsx) — mesma fonte de verdade, pra que uma rota
 * escondida do menu também não seja acessível via URL direta. `permissions`
 * é o jsonb cru de `profiles.permissions`; `null` = sem granularidade
 * definida (legado ou owner/admin) = acesso total, mesmo fallback do nav.
 */
export function canViewNavRoute(permissions: Json | null, href: string): boolean {
  if (!permissions) return true;
  const permKey = NAV_PERMISSION_MAP[href];
  if (!permKey) return true;
  return (permissions as Record<string, unknown>)[permKey] === true;
}
