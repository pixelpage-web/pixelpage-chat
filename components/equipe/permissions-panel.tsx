"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ROLE_DEFAULTS, type PermissionDefaults } from "@/lib/permissions";
import type { TeamRoleTemplate } from "@/types/database";

type BooleanKey = Exclude<keyof PermissionDefaults, "inbox_scope">;

const GROUPS: { title: string; keys: BooleanKey[] }[] = [
  {
    title: "Visibilidade (menu)",
    keys: [
      "can_view_inbox", "can_view_contacts", "can_view_campaigns", "can_view_agent_ai",
      "can_view_flows", "can_view_automations", "can_view_connections", "can_view_integrations",
      "can_view_reports", "can_view_settings", "can_view_billing",
    ],
  },
  {
    title: "Atendimento",
    keys: [
      "can_reply_messages", "can_pause_bot", "can_assign_conversation", "can_resolve_conversation",
      "can_archive_conversation", "can_add_remove_labels", "can_add_internal_notes",
      "can_view_others_notes", "can_export_conversation", "can_block_contact",
    ],
  },
  {
    title: "Contatos",
    keys: ["can_edit_contacts", "can_delete_contacts", "can_import_contacts", "can_export_contacts"],
  },
];

const LABELS: Record<BooleanKey, string> = {
  can_view_inbox: "Ver Inbox",
  can_view_contacts: "Ver Contatos",
  can_view_campaigns: "Ver Campanhas",
  can_view_agent_ai: "Ver Agente IA",
  can_view_flows: "Ver Fluxos",
  can_view_automations: "Ver Automações",
  can_view_connections: "Ver Conexões",
  can_view_integrations: "Ver Integrações",
  can_view_reports: "Ver Relatórios",
  can_view_settings: "Ver Configurações",
  can_view_billing: "Ver Assinatura",
  can_reply_messages: "Responder mensagens",
  can_pause_bot: "Pausar o bot",
  can_assign_conversation: "Atribuir conversa",
  can_resolve_conversation: "Resolver conversa",
  can_archive_conversation: "Arquivar conversa",
  can_add_remove_labels: "Adicionar/remover etiquetas",
  can_add_internal_notes: "Adicionar notas internas",
  can_view_others_notes: "Ver notas de colegas",
  can_export_conversation: "Exportar conversa",
  can_block_contact: "Bloquear contato",
  can_edit_contacts: "Editar contatos",
  can_delete_contacts: "Excluir contatos",
  can_import_contacts: "Importar contatos",
  can_export_contacts: "Exportar contatos",
};

const TEMPLATE_LABELS: Record<TeamRoleTemplate, string> = {
  admin: "Admin (acesso total)",
  agent: "Agente (padrão)",
  viewer: "Visualizador (só leitura)",
  custom: "Customizado",
};

/**
 * Editor de permissões granulares de um membro (0046 — Fase 4). Só "Ver X"
 * (grupo Visibilidade) é de fato enforced hoje, via NAV_PERMISSION_MAP no
 * nav (components/app-shell.tsx) e nos guards de rota (ver lib/permissions.ts
 * canViewNavRoute). As flags de Atendimento/Contatos ficam salvas no jsonb
 * pra já existir o dado completo (mesmo shape de ROLE_DEFAULTS) — a
 * aplicação delas no inbox/contatos é escopo de uma fase futura.
 */
export function PermissionsPanel({
  open,
  onClose,
  memberId,
  memberName,
  initialPermissions,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  memberId: string;
  memberName: string;
  initialPermissions: PermissionDefaults | null;
  onSaved: (permissions: PermissionDefaults) => void;
}) {
  const t = useT();
  const [permissions, setPermissions] = useState<PermissionDefaults>(
    initialPermissions ?? ROLE_DEFAULTS.agent
  );
  const [saving, setSaving] = useState(false);

  function applyTemplate(template: TeamRoleTemplate) {
    setPermissions(ROLE_DEFAULTS[template]);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/team/permissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, permissions }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? t("Não foi possível salvar as permissões."));
        return;
      }
      toast.success(t("Permissões atualizadas."));
      onSaved(permissions);
    } catch {
      toast.error(t("Erro de conexão."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${t("Permissões de")} ${memberName}`}
      className="max-w-xl"
    >
      <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-1">
        <div>
          <p className="mb-2 text-xs font-medium text-txt-mut">{t("Preset rápido")}</p>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(TEMPLATE_LABELS) as TeamRoleTemplate[]).map((template) => (
              <button
                key={template}
                type="button"
                onClick={() => applyTemplate(template)}
                className="focus-ring rounded-md border border-line px-2.5 py-1 text-xs text-txt-mut transition-colors hover:border-line-strong hover:bg-surface-hover hover:text-txt"
              >
                {t(TEMPLATE_LABELS[template])}
              </button>
            ))}
          </div>
        </div>

        {GROUPS.map((group) => (
          <div key={group.title}>
            <p className="mb-2 text-xs font-medium text-txt-mut">{t(group.title)}</p>
            <ul className="space-y-2.5">
              {group.keys.map((key) => (
                <li key={key} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-txt">{t(LABELS[key])}</span>
                  <Switch
                    checked={permissions[key]}
                    onChange={(checked) =>
                      setPermissions((prev) => ({ ...prev, [key]: checked }))
                    }
                    label={LABELS[key]}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div>
          <p className="mb-2 text-xs font-medium text-txt-mut">{t("Escopo do inbox")}</p>
          <Select
            value={permissions.inbox_scope}
            onChange={(e) =>
              setPermissions((prev) => ({
                ...prev,
                inbox_scope: e.target.value === "assigned_only" ? "assigned_only" : "all",
              }))
            }
          >
            <option value="all">{t("Ver todas as conversas")}</option>
            <option value="assigned_only">{t("Só conversas atribuídas a mim")}</option>
          </Select>
        </div>
      </div>

      <div className="mt-5 flex gap-2 border-t border-line pt-4">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          {t("Cancelar")}
        </Button>
        <Button className="flex-1" loading={saving} onClick={() => void save()}>
          {t("Salvar")}
        </Button>
      </div>
    </Modal>
  );
}
