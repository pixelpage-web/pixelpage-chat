"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { AlertTriangle, SlidersHorizontal, Star, Trash2, UserPlus, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import { isOwnerRole, type PermissionDefaults } from "@/lib/permissions";
import { PermissionsPanel } from "@/components/equipe/permissions-panel";
import type { Role, TeamRoleTemplate } from "@/types/database";

export interface TeamMember {
  id: string;
  name: string;
  role: Role;
  created_at: string;
  /** granular (0046); ausente nas telas que não precisam (ex.: Configurações/Unidades) */
  permissions?: PermissionDefaults | null;
}

interface MemberStats {
  assigned: number;
  resolved: number;
  csatAvg: number | null;
  csatCount: number;
  lastActivity: string | null;
}

/**
 * Card de gestão de equipe (convite/remoção), baseado em `profiles` — usado
 * em /app/equipe. Substitui o sistema legado `team_members`/`team_invites`
 * (RLS sem policies, nunca teve dado real em produção).
 *
 * Métricas por membro reaproveitam as mesmas queries de reports/agents
 * (conversas atribuídas/resolvidas) e reports/csat (nota média por agente).
 * "Última atividade" é derivada de messages.sender_id — só é confiável a
 * partir da correção que passou a gravar sender_id também nas respostas de
 * texto do inbox (antes só mídia gravava).
 */
export function TeamCard({
  userId,
  orgId,
  isOwner,
  members,
  setMembers,
}: {
  userId: string;
  orgId: string;
  isOwner: boolean;
  members: TeamMember[];
  setMembers: Dispatch<SetStateAction<TeamMember[]>>;
}) {
  const t = useT();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"agent" | "owner">("agent");
  const [inviteRoleTemplate, setInviteRoleTemplate] =
    useState<TeamRoleTemplate>("agent");
  const [saving, setSaving] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null);
  const [permissionsTarget, setPermissionsTarget] = useState<TeamMember | null>(null);
  const [stats, setStats] = useState<Record<string, MemberStats>>({});
  const [statsLoading, setStatsLoading] = useState(true);

  const memberIds = useMemo(
    () => members.map((m) => m.id).sort().join(","),
    [members]
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const ids = memberIds ? memberIds.split(",") : [];
      if (ids.length === 0) {
        setStatsLoading(false);
        return;
      }
      setStatsLoading(true);
      const supabase = createClient();

      // Agent só vê a própria linha (page.tsx já filtra `members` pra
      // conter só o próprio perfil) — restringe a query em si, não só o
      // que é renderizado, pra não trafegar dado de colega pro client.
      let convQuery = supabase
        .from("conversations")
        .select("assigned_to, status")
        .eq("org_id", orgId)
        .not("assigned_to", "is", null);
      let csatQuery = supabase
        .from("csat_responses")
        .select("agent_id, score")
        .eq("org_id", orgId)
        .not("agent_id", "is", null);
      if (!isOwner) {
        convQuery = convQuery.eq("assigned_to", userId);
        csatQuery = csatQuery.eq("agent_id", userId);
      }

      const [convRes, csatRes, lastMsgRes] = await Promise.all([
        convQuery,
        csatQuery,
        Promise.all(
          ids.map((id) =>
            supabase
              .from("messages")
              .select("created_at")
              .eq("sender_id", id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle()
          )
        ),
      ]);

      if (cancelled) return;

      const next: Record<string, MemberStats> = {};
      ids.forEach((id, i) => {
        const convs = (convRes.data ?? []).filter((c) => c.assigned_to === id);
        const csats = (csatRes.data ?? []).filter((c) => c.agent_id === id);
        next[id] = {
          assigned: convs.length,
          resolved: convs.filter((c) => c.status === "resolved").length,
          csatAvg:
            csats.length > 0
              ? csats.reduce((sum, c) => sum + c.score, 0) / csats.length
              : null,
          csatCount: csats.length,
          lastActivity: lastMsgRes[i]?.data?.created_at ?? null,
        };
      });
      setStats(next);
      setStatsLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [orgId, memberIds, isOwner, userId]);

  async function invite() {
    if (!inviteEmail.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
          roleTemplate: inviteRole === "agent" ? inviteRoleTemplate : undefined,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        member?: TeamMember;
        error?: string;
      };
      if (!res.ok || !json.member) {
        toast.error(json.error ?? t("Não foi possível convidar."));
        return;
      }
      setMembers((prev) => [
        ...prev,
        { ...json.member!, created_at: new Date().toISOString() },
      ]);
      setInviteEmail("");
      toast.success(`${t("Convite enviado para")} ${inviteEmail.trim()}.`);
    } catch {
      toast.error(t("Erro de conexão ao convidar."));
    } finally {
      setSaving(false);
    }
  }

  async function removeMember(member: TeamMember) {
    const previous = members;
    setMembers((prev) => prev.filter((m) => m.id !== member.id));
    try {
      const supabase = createClient();
      const { error } = await supabase.from("profiles").delete().eq("id", member.id);
      if (error) {
        setMembers(previous);
        toast.error(t("Não foi possível remover o membro."));
      } else {
        toast.success(t("Membro removido."));
      }
    } catch {
      setMembers(previous);
      toast.error(t("Erro de conexão."));
    }
  }

  async function changeRole(member: TeamMember, newRole: "agent" | "owner") {
    if (newRole === member.role) return;
    const previous = members;
    setMembers((prev) =>
      prev.map((m) => (m.id === member.id ? { ...m, role: newRole } : m))
    );
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({ role: newRole })
        .eq("id", member.id);
      if (error) {
        setMembers(previous);
        toast.error(t("Não foi possível alterar a função."));
      } else {
        toast.success(t("Função atualizada."));
      }
    } catch {
      setMembers(previous);
      toast.error(t("Erro de conexão."));
    }
  }

  return (
    <Card>
      <div className="flex items-start gap-3">
        <Users className="mt-0.5 h-5 w-5 text-txt-dim" aria-hidden />
        <div>
          <CardTitle>{isOwner ? t("Equipe") : t("Meu desempenho")}</CardTitle>
          <CardDescription>
            {isOwner
              ? t("Membros respondem pelo inbox. Donos também gerenciam plano, bot e integrações.")
              : t("Suas métricas de atendimento.")}
          </CardDescription>
        </div>
      </div>

      <ul className="mt-4 divide-y divide-line overflow-hidden rounded-lg border border-line">
        {members.map((member) => {
          const stat = stats[member.id];
          const canManage = isOwner && member.id !== userId && member.role !== "admin";
          const canEditRole =
            canManage && (member.role === "agent" || member.role === "owner");
          // Permissões granulares só fazem sentido pra quem não é owner/admin
          // (owner/admin já têm acesso total via isOwnerRole).
          const canEditPermissions = canManage && !isOwnerRole(member.role);

          return (
            <li
              key={member.id}
              className="flex flex-col gap-2 bg-ink px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar name={member.name} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {member.name || t("Sem nome")}
                    {member.id === userId && (
                      <span className="ml-1.5 text-xs text-txt-dim">({t("você")})</span>
                    )}
                  </p>
                  <p className="text-[11px] text-txt-dim">
                    {t("entrou")} {timeAgo(member.created_at)}
                  </p>
                  {statsLoading ? (
                    <div className="mt-1 h-3 w-40 animate-pulse rounded bg-surface-raised" />
                  ) : stat ? (
                    <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-txt-dim">
                      <span>
                        {stat.assigned} {t("conversas")} ({stat.resolved} {t("resolvidas")})
                      </span>
                      {stat.csatCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-txt">
                          <Star className="h-3 w-3 fill-txt-mut" aria-hidden />
                          {stat.csatAvg!.toFixed(1)} ({stat.csatCount})
                        </span>
                      )}
                      {stat.lastActivity && (
                        <span>
                          {t("última resposta")} {timeAgo(stat.lastActivity)}
                        </span>
                      )}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {canEditRole ? (
                  <Select
                    value={member.role}
                    onChange={(e) =>
                      void changeRole(member, e.target.value === "owner" ? "owner" : "agent")
                    }
                    className="sm:w-32"
                    aria-label={`${t("Função de")} ${member.name}`}
                  >
                    <option value="agent">{t("Agente")}</option>
                    <option value="owner">{t("Dono")}</option>
                  </Select>
                ) : (
                  <Badge tone={member.role === "agent" ? "neutral" : "lime"}>
                    {member.role === "owner"
                      ? t("dono")
                      : member.role === "admin"
                        ? "admin"
                        : t("agente")}
                  </Badge>
                )}
                {canEditPermissions && (
                  <button
                    onClick={() => setPermissionsTarget(member)}
                    className="focus-ring rounded-md p-1.5 text-txt-dim hover:bg-surface-hover hover:text-txt"
                    aria-label={`${t("Permissões de")} ${member.name}`}
                    title={t("Permissões")}
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                  </button>
                )}
                {canManage && (
                  <button
                    onClick={() => setRemoveTarget(member)}
                    className="focus-ring rounded-md p-1.5 text-txt-dim hover:bg-danger-soft hover:text-danger"
                    aria-label={`${t("Remover")} ${member.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {isOwner && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="email@colega.com.br"
            className="flex-1"
          />
          <Select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value === "owner" ? "owner" : "agent")}
            className="sm:w-32"
          >
            <option value="agent">{t("Agente")}</option>
            <option value="owner">{t("Dono")}</option>
          </Select>
          {inviteRole === "agent" && (
            <Select
              value={inviteRoleTemplate}
              onChange={(e) => setInviteRoleTemplate(e.target.value as TeamRoleTemplate)}
              className="sm:w-44"
              aria-label={t("Modelo de permissões")}
            >
              <option value="agent">{t("Agente (padrão)")}</option>
              <option value="admin">{t("Admin (acesso total)")}</option>
              <option value="viewer">{t("Visualizador (só leitura)")}</option>
              <option value="custom">{t("Customizado")}</option>
            </Select>
          )}
          <Button
            onClick={() => void invite()}
            loading={saving}
            variant="secondary"
            disabled={!inviteEmail.trim()}
          >
            <UserPlus className="h-4 w-4" aria-hidden />
            {t("Convidar")}
          </Button>
        </div>
      )}

      <Modal
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        title={t("Remover membro")}
      >
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden />
          <p className="text-sm leading-relaxed text-txt-mut">
            {t("Isso remove")} {removeTarget?.name || t("este membro")}{" "}
            {t("da equipe imediatamente. Esta ação não pode ser desfeita.")}
          </p>
        </div>
        <div className="mt-4 flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => setRemoveTarget(null)}
          >
            {t("Cancelar")}
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            onClick={() => {
              const target = removeTarget;
              setRemoveTarget(null);
              if (target) void removeMember(target);
            }}
          >
            {t("Remover permanentemente")}
          </Button>
        </div>
      </Modal>

      {permissionsTarget && (
        <PermissionsPanel
          key={permissionsTarget.id}
          open
          onClose={() => setPermissionsTarget(null)}
          memberId={permissionsTarget.id}
          memberName={permissionsTarget.name || t("Sem nome")}
          initialPermissions={permissionsTarget.permissions ?? null}
          onSaved={(permissions) => {
            setMembers((prev) =>
              prev.map((m) => (m.id === permissionsTarget.id ? { ...m, permissions } : m))
            );
            setPermissionsTarget(null);
          }}
        />
      )}
    </Card>
  );
}
