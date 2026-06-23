"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bell,
  BookOpen,
  Building2,
  Languages,
  Lightbulb,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SuggestionForm } from "@/components/suggestion-form";
import type { Json, Role } from "@/types/database";

const notificationTypes = [
  { key: "new_conversation", label: "Nova conversa recebida" },
  { key: "unread_1h", label: "Mensagem sem resposta há mais de 1 hora" },
  { key: "bot_error", label: "Erro no bot IA" },
] as const;

interface Member {
  id: string;
  name: string;
  role: Role;
  created_at: string;
}

export function SettingsView({
  userId,
  userEmail,
  profileName,
  role,
  orgId,
  orgName,
  members: initialMembers,
  notificationPrefs,
}: {
  userId: string;
  userEmail: string;
  profileName: string;
  role: Role;
  orgId: string;
  orgName: string;
  members: Member[];
  notificationPrefs: Record<string, boolean>;
}) {
  const t = useT();
  const [name, setName] = useState(profileName);
  const [newPassword, setNewPassword] = useState("");
  const [prefs, setPrefs] = useState<Record<string, boolean>>(notificationPrefs);
  const [company, setCompany] = useState(orgName);
  const [members, setMembers] = useState(initialMembers);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"agent" | "owner">("agent");
  const [saving, setSaving] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const isOwner = role === "owner" || role === "admin";

  async function saveProfile() {
    setSaving("profile");
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({ name: name.trim() })
        .eq("id", userId);
      if (error) {
        toast.error(t("Não foi possível salvar seu nome."));
        return;
      }
      toast.success(t("Dados salvos."));
    } catch {
      toast.error(t("Erro de conexão."));
    } finally {
      setSaving(null);
    }
  }

  async function saveCompany() {
    setSaving("company");
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("organizations")
        .update({ name: company.trim() })
        .eq("id", orgId);
      if (error) {
        toast.error(t("Não foi possível renomear a empresa."));
        return;
      }
      toast.success(t("Empresa renomeada."));
    } catch {
      toast.error(t("Erro de conexão."));
    } finally {
      setSaving(null);
    }
  }

  async function invite() {
    if (!inviteEmail.trim()) return;
    setSaving("invite");
    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        member?: Member;
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
      setSaving(null);
    }
  }

  async function removeMember(member: Member) {
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

  async function changePassword() {
    if (newPassword.length < 8) {
      toast.error(t("A senha precisa ter pelo menos 8 caracteres."));
      return;
    }
    setSaving("password");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        toast.error(t("Não foi possível alterar a senha."));
        return;
      }
      setNewPassword("");
      toast.success(t("Senha alterada com sucesso."));
    } catch {
      toast.error(t("Erro de conexão."));
    } finally {
      setSaving(null);
    }
  }

  async function togglePref(key: string, value: boolean) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({ notification_prefs: next as Json })
        .eq("id", userId);
      if (error) {
        setPrefs(prefs);
        toast.error(t("Não foi possível salvar a preferência."));
      }
    } catch {
      setPrefs(prefs);
      toast.error(t("Erro de conexão."));
    }
  }

  async function deleteAccount() {
    setSaving("delete");
    try {
      const res = await fetch("/api/org/delete", { method: "DELETE" });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(json?.error ?? t("Não foi possível excluir a conta."));
        return;
      }
      const supabase = createClient();
      await supabase.auth.signOut();
      window.location.href = "/register";
    } catch {
      toast.error(t("Erro de conexão ao excluir."));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
        <header>
          <h1 className="font-display text-lg font-semibold">{t("Configurações")}</h1>
          <p className="mt-0.5 text-sm text-txt-mut">
            {t("Sua conta, sua empresa e sua equipe.")}
          </p>
        </header>

        {/* Idioma */}
        <Card>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Languages className="mt-0.5 h-5 w-5 text-txt-dim" aria-hidden />
              <div>
                <CardTitle>{t("Idioma")}</CardTitle>
                <CardDescription>
                  {t("Escolha o idioma da interface.")}
                </CardDescription>
              </div>
            </div>
            <LanguageSwitcher />
          </div>
        </Card>

        {/* Conta */}
        <Card>
          <CardTitle>{t("Sua conta")}</CardTitle>
          <div className="mt-4 space-y-4">
            <div>
              <Label htmlFor="acc-name">{t("Seu nome")}</Label>
              <Input
                id="acc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={userEmail} disabled />
            </div>
            <Button
              onClick={() => void saveProfile()}
              loading={saving === "profile"}
              variant="secondary"
              size="sm"
            >
              {t("Salvar")}
            </Button>
          </div>
        </Card>

        {/* Segurança */}
        <Card>
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-txt-dim" aria-hidden />
            <div className="flex-1">
              <CardTitle>{t("Segurança")}</CardTitle>
              <CardDescription>{t("Altere sua senha de acesso.")}</CardDescription>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t("Nova senha (mínimo 8 caracteres)")}
                  autoComplete="new-password"
                  className="flex-1"
                />
                <Button
                  onClick={() => void changePassword()}
                  loading={saving === "password"}
                  variant="secondary"
                  disabled={newPassword.length < 8}
                >
                  {t("Alterar senha")}
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Notificações */}
        <Card>
          <div className="flex items-start gap-3">
            <Bell className="mt-0.5 h-5 w-5 text-txt-dim" aria-hidden />
            <div className="flex-1">
              <CardTitle>{t("Notificações")}</CardTitle>
              <CardDescription>
                {t("Escolha sobre o que você quer ser avisado (alertas no painel; email em breve).")}
              </CardDescription>
              <ul className="mt-4 space-y-3">
                {notificationTypes.map((nt) => (
                  <li key={nt.key} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-txt-mut">{t(nt.label)}</span>
                    <Switch
                      checked={prefs[nt.key] !== false}
                      onChange={(v) => void togglePref(nt.key, v)}
                      label={t(nt.label)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>

        {/* Empresa */}
        {isOwner && (
          <Card>
            <div className="flex items-start gap-3">
              <Building2 className="mt-0.5 h-5 w-5 text-txt-dim" aria-hidden />
              <div className="flex-1">
                <CardTitle>{t("Empresa")}</CardTitle>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    onClick={() => void saveCompany()}
                    loading={saving === "company"}
                    variant="secondary"
                    disabled={!company.trim() || company.trim() === orgName}
                  >
                    {t("Renomear")}
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Equipe */}
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
                loading={saving === "invite"}
                variant="secondary"
                disabled={!inviteEmail.trim()}
              >
                <UserPlus className="h-4 w-4" aria-hidden />
                {t("Convidar")}
              </Button>
            </div>
          )}
        </Card>

        {/* Ajuda e sugestões */}
        <Card>
          <div className="flex items-start gap-3">
            <Lightbulb className="mt-0.5 h-5 w-5 text-lime" aria-hidden />
            <div className="flex-1">
              <CardTitle>{t("Ajuda e sugestões")}</CardTitle>
              <CardDescription>
                {t("Dúvidas sobre como algo funciona? Veja a documentação. Tem uma ideia? Manda pra gente!")}
              </CardDescription>
              <Link
                href="/app/docs"
                className="focus-ring mt-3 inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-medium text-txt-mut transition-colors hover:border-lime/40 hover:text-lime"
              >
                <BookOpen className="h-3.5 w-3.5" aria-hidden />
                {t("Abrir documentação")}
              </Link>
              <div className="mt-4">
                <SuggestionForm orgId={orgId} authorName={name || profileName} />
              </div>
            </div>
          </div>
        </Card>

        {/* Zona de perigo */}
        {role === "owner" && (
          <Card className="border-danger/30">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-danger" aria-hidden />
              <div className="flex-1">
                <CardTitle className="text-danger">{t("Excluir conta")}</CardTitle>
                <CardDescription>
                  {t("Remove a empresa, todas as conversas, conexões e integrações. Esta ação é irreversível.")}
                </CardDescription>
                <Button
                  onClick={() => setDeleteOpen(true)}
                  variant="danger"
                  size="sm"
                  className="mt-4"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                  {t("Excluir minha conta")}
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Confirmação de exclusão */}
      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={t("Excluir conta — irreversível")}
      >
        <p className="text-sm leading-relaxed text-txt-mut">
          {t("Todas as conversas, contatos, conexões WhatsApp e integrações de")}{" "}
          <strong className="text-txt">{orgName}</strong>{" "}
          {t("serão apagados permanentemente. Para confirmar, digite o nome da empresa:")}
        </p>
        <Input
          value={deleteConfirm}
          onChange={(e) => setDeleteConfirm(e.target.value)}
          placeholder={orgName}
          className="mt-4"
        />
        <Button
          onClick={() => void deleteAccount()}
          loading={saving === "delete"}
          variant="danger"
          disabled={deleteConfirm !== orgName}
          className="mt-4 w-full"
        >
          {t("Excluir tudo permanentemente")}
        </Button>
      </Modal>
    </div>
  );
}
