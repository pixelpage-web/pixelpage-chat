"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Plus, RefreshCw, UserX } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ROLE_DEFAULTS } from "@/lib/permissions";
import type { TeamMemberRow, TeamMemberPermissionsRow, TeamRoleTemplate } from "@/types/database";

type MemberWithPerms = TeamMemberRow & {
  team_member_permissions: TeamMemberPermissionsRow[] | null;
};

const ROLE_LABELS: Record<TeamRoleTemplate, string> = {
  admin: "Admin",
  agent: "Agente",
  viewer: "Visualizador",
  custom: "Personalizado",
};

const STATUS_STYLES: Record<string, string> = {
  invited: "bg-amber/15 text-amber",
  active: "bg-lime-soft text-lime",
  disabled: "bg-surface-hover text-txt-dim",
};

const STATUS_LABELS: Record<string, string> = {
  invited: "Convidado",
  active: "Ativo",
  disabled: "Desativado",
};

const PERM_SECTIONS = [
  {
    label: "Visibilidade de seções",
    keys: [
      ["can_view_inbox", "Ver Inbox"],
      ["can_view_contacts", "Ver Contatos"],
      ["can_view_campaigns", "Ver Campanhas"],
      ["can_view_agent_ai", "Ver Agente IA"],
      ["can_view_flows", "Ver Fluxos"],
      ["can_view_automations", "Ver Automações"],
      ["can_view_connections", "Ver Conexões"],
      ["can_view_integrations", "Ver Integrações"],
      ["can_view_reports", "Ver Relatórios"],
      ["can_view_settings", "Ver Configurações"],
      ["can_view_billing", "Ver Assinatura"],
    ] as [keyof typeof ROLE_DEFAULTS.agent, string][],
  },
  {
    label: "Conversas",
    keys: [
      ["can_reply_messages", "Responder mensagens"],
      ["can_pause_bot", "Pausar bot"],
      ["can_assign_conversation", "Atribuir conversa"],
      ["can_resolve_conversation", "Resolver conversa"],
      ["can_archive_conversation", "Arquivar conversa"],
      ["can_add_remove_labels", "Adicionar/remover etiquetas"],
      ["can_add_internal_notes", "Notas internas"],
      ["can_view_others_notes", "Ver notas de outros"],
      ["can_export_conversation", "Exportar conversa"],
      ["can_block_contact", "Bloquear contato"],
    ] as [keyof typeof ROLE_DEFAULTS.agent, string][],
  },
  {
    label: "Contatos",
    keys: [
      ["can_edit_contacts", "Editar contatos"],
      ["can_delete_contacts", "Excluir contatos"],
      ["can_import_contacts", "Importar contatos"],
      ["can_export_contacts", "Exportar contatos"],
    ] as [keyof typeof ROLE_DEFAULTS.agent, string][],
  },
];

function InviteForm({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [roleTemplate, setRoleTemplate] = useState<TeamRoleTemplate>("agent");
  const [customPerms, setCustomPerms] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);

  function handleRoleChange(role: TeamRoleTemplate) {
    setRoleTemplate(role);
    setCustomPerms({});
  }

  function togglePerm(key: string) {
    const base = ROLE_DEFAULTS[roleTemplate] as Record<string, unknown>;
    const current = key in customPerms ? customPerms[key] : (base[key] as boolean);
    setCustomPerms((prev) => ({ ...prev, [key]: !current }));
  }

  function permValue(key: string): boolean {
    if (key in customPerms) return customPerms[key];
    const base = ROLE_DEFAULTS[roleTemplate] as Record<string, unknown>;
    return base[key] as boolean;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !name) return;
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { email, name, role_template: roleTemplate };
      if (roleTemplate === "custom" || Object.keys(customPerms).length > 0) {
        body.permissions = customPerms;
      }
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? "Não foi possível enviar o convite.");
        return;
      }
      toast.success(`Convite enviado para ${email}`);
      setEmail("");
      setName("");
      setRoleTemplate("agent");
      setCustomPerms({});
      onSuccess();
    } catch {
      toast.error("Erro de conexão. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-line bg-surface p-5">
      <h2 className="font-semibold">Convidar membro</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="inv-email">Email</Label>
          <Input
            id="inv-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="agente@empresa.com"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="inv-name">Nome</Label>
          <Input
            id="inv-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Maria Souza"
            className="mt-1"
          />
        </div>
      </div>

      <div>
        <Label>Perfil de acesso</Label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {(["admin", "agent", "viewer", "custom"] as TeamRoleTemplate[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => handleRoleChange(r)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                roleTemplate === r
                  ? "bg-lime text-black"
                  : "bg-surface-hover text-txt-mut hover:text-txt"
              }`}
            >
              {ROLE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {PERM_SECTIONS.map((section) => (
          <details key={section.label} className="group">
            <summary className="cursor-pointer select-none text-xs font-medium text-txt-mut group-open:text-txt">
              {section.label}
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 pl-2 sm:grid-cols-3">
              {section.keys.map(([key, label]) => (
                <label key={key} className="flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={permValue(key)}
                    onChange={() => togglePerm(key)}
                    className="accent-lime"
                  />
                  {label}
                </label>
              ))}
            </div>
          </details>
        ))}
      </div>

      <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
        {submitting ? "Enviando…" : "Enviar convite"}
      </Button>
    </form>
  );
}

function MemberRow({
  member,
  onUpdate,
}: {
  member: MemberWithPerms;
  onUpdate: () => void;
}) {
  const [open, setOpen] = useState(false);

  async function handleDisable() {
    const res = await fetch(`/api/team/${member.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Membro desativado.");
      onUpdate();
    } else {
      toast.error("Não foi possível desativar o membro.");
    }
    setOpen(false);
  }

  async function handleReactivate() {
    const res = await fetch(`/api/team/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });
    if (res.ok) {
      toast.success("Membro reativado.");
      onUpdate();
    } else {
      toast.error("Não foi possível reativar o membro.");
    }
    setOpen(false);
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3">
      <Avatar name={member.name} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{member.name}</p>
        <p className="truncate text-xs text-txt-dim">{member.email}</p>
      </div>
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[member.status] ?? ""}`}>
        {STATUS_LABELS[member.status] ?? member.status}
      </span>
      <span className="hidden text-xs text-txt-dim sm:block">{ROLE_LABELS[member.role_template]}</span>
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex h-7 w-7 items-center justify-center rounded text-txt-dim hover:bg-surface-hover hover:text-txt"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {open && (
          <div className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-line bg-surface shadow-lg">
            {member.status === "disabled" ? (
              <button
                onClick={() => void handleReactivate()}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-surface-hover"
              >
                <RefreshCw className="h-4 w-4" />
                Reativar
              </button>
            ) : (
              <button
                onClick={() => void handleDisable()}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-danger-soft"
              >
                <UserX className="h-4 w-4" />
                Desativar
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function EquipePage() {
  const [members, setMembers] = useState<MemberWithPerms[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/team");
      if (res.ok) {
        const data = (await res.json()) as MemberWithPerms[];
        setMembers(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const active = members.filter((m) => m.status === "active");
  const invited = members.filter((m) => m.status === "invited");
  const disabled = members.filter((m) => m.status === "disabled");

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Equipe</h1>
          <p className="mt-0.5 text-sm text-txt-dim">
            {active.length} membro{active.length !== 1 ? "s" : ""} ativo{active.length !== 1 ? "s" : ""}
            {invited.length > 0 ? ` · ${invited.length} convite${invited.length !== 1 ? "s" : ""} pendente${invited.length !== 1 ? "s" : ""}` : ""}
          </p>
        </div>
        <Button onClick={() => setShowInvite((v) => !v)} className="gap-2">
          <Plus className="h-4 w-4" />
          Convidar
        </Button>
      </div>

      {showInvite && (
        <InviteForm
          onSuccess={() => {
            setShowInvite(false);
            void load();
          }}
        />
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-txt-dim">Carregando…</div>
      ) : members.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line py-12 text-center text-sm text-txt-dim">
          Nenhum membro na equipe ainda. Convide alguém para começar.
        </div>
      ) : (
        <div className="space-y-2">
          {[...active, ...invited, ...disabled].map((m) => (
            <MemberRow key={m.id} member={m} onUpdate={() => void load()} />
          ))}
        </div>
      )}
    </div>
  );
}
