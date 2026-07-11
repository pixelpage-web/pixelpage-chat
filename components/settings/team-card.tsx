"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { Trash2, UserPlus, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import type { Role } from "@/types/database";

export interface TeamMember {
  id: string;
  name: string;
  role: Role;
  created_at: string;
}

/**
 * Card de gestão de equipe (convite/remoção), baseado em `profiles` — usado em
 * Configurações e em /app/equipe. Substitui o sistema legado `team_members`/
 * `team_invites` (RLS sem policies, nunca teve dado real em produção).
 */
export function TeamCard({
  userId,
  isOwner,
  members,
  setMembers,
}: {
  userId: string;
  isOwner: boolean;
  members: TeamMember[];
  setMembers: Dispatch<SetStateAction<TeamMember[]>>;
}) {
  const t = useT();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"agent" | "owner">("agent");
  const [saving, setSaving] = useState(false);

  async function invite() {
    if (!inviteEmail.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
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

  return (
    <Card>
      <div className="flex items-start gap-3">
        <Users className="mt-0.5 h-5 w-5 text-txt-dim" aria-hidden />
        <div>
          <CardTitle>{t("Equipe")}</CardTitle>
          <CardDescription>
            {t("Membros respondem pelo inbox. Donos também gerenciam plano, bot e integrações.")}
          </CardDescription>
        </div>
      </div>

      <ul className="mt-4 divide-y divide-line overflow-hidden rounded-lg border border-line">
        {members.map((member) => (
          <li
            key={member.id}
            className="flex items-center justify-between gap-3 bg-ink px-3 py-2.5"
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
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge tone={member.role === "agent" ? "neutral" : "lime"}>
                {member.role === "owner"
                  ? t("dono")
                  : member.role === "admin"
                    ? "admin"
                    : t("agente")}
              </Badge>
              {isOwner && member.id !== userId && member.role !== "admin" && (
                <button
                  onClick={() => void removeMember(member)}
                  className="focus-ring rounded-md p-1.5 text-txt-dim hover:bg-danger-soft hover:text-danger"
                  aria-label={`${t("Remover")} ${member.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </li>
        ))}
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
    </Card>
  );
}
