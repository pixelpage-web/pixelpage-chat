"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bell,
  BookOpen,
  Building2,
  Lightbulb,
  ShieldCheck,
  Sun,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { SuggestionForm } from "@/components/suggestion-form";
import { UnitsCard } from "@/components/settings/units-card";
import type { TeamMember } from "@/components/settings/team-card";
import type { Json, Role } from "@/types/database";

const notificationTypes = [
  { key: "new_conversation", label: "Nova conversa recebida" },
  { key: "unread_1h", label: "Mensagem sem resposta há mais de 1 hora" },
  { key: "bot_error", label: "Erro no bot IA" },
] as const;

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const LOGO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function SettingsView({
  userId,
  userEmail,
  profileName,
  role,
  orgId,
  orgName,
  orgLogoUrl,
  showProFeatures = true,
  members: initialMembers,
  notificationPrefs,
}: {
  userId: string;
  userEmail: string;
  profileName: string;
  role: Role;
  orgId: string;
  orgName: string;
  orgLogoUrl: string | null;
  /** false = plano básico (Free/Starter) — some Unidades e White-label */
  showProFeatures?: boolean;
  members: TeamMember[];
  notificationPrefs: Record<string, boolean>;
}) {
  const t = useT();
  const [name, setName] = useState(profileName);
  const [newPassword, setNewPassword] = useState("");
  const [prefs, setPrefs] = useState<Record<string, boolean>>(notificationPrefs);
  const [company, setCompany] = useState(orgName);
  const [logoUrl, setLogoUrl] = useState(orgLogoUrl);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [removingLogo, setRemovingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [members] = useState(initialMembers);
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

  async function saveDisplayName() {
    const trimmed = company.trim();
    if (trimmed.length < 2 || trimmed.length > 50) {
      toast.error(t("O nome precisa ter entre 2 e 50 caracteres."));
      return;
    }
    setSaving("displayName");
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("organizations")
        .update({ name: trimmed })
        .eq("id", orgId);
      if (error) {
        toast.error(t("Não foi possível atualizar o nome."));
        return;
      }
      toast.success(t("Nome atualizado."));
    } catch {
      toast.error(t("Erro de conexão."));
    } finally {
      setSaving(null);
    }
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      toast.error(t("Formato inválido. Use JPEG, PNG ou WebP."));
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error(t("A imagem precisa ter no máximo 2MB."));
      return;
    }

    setUploadingLogo(true);
    try {
      const supabase = createClient();
      const ext = LOGO_EXT[file.type];
      const path = `${orgId}/logo.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("logos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) {
        toast.error(t("Não foi possível enviar a logo."));
        return;
      }
      const { data: pub } = supabase.storage.from("logos").getPublicUrl(path);
      const { error: updateError } = await supabase
        .from("organizations")
        .update({ logo_url: pub.publicUrl })
        .eq("id", orgId);
      if (updateError) {
        toast.error(t("Não foi possível salvar a logo."));
        return;
      }
      setLogoUrl(pub.publicUrl);
      toast.success(t("Logo atualizada."));
    } catch {
      toast.error(t("Erro de conexão."));
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleRemoveLogo() {
    if (!logoUrl) return;
    setRemovingLogo(true);
    try {
      const supabase = createClient();
      // Extrai o caminho dentro do bucket a partir da URL pública salva.
      const marker = "/object/public/logos/";
      const idx = logoUrl.indexOf(marker);
      if (idx !== -1) {
        const path = logoUrl.slice(idx + marker.length);
        await supabase.storage.from("logos").remove([path]);
      }
      const { error } = await supabase
        .from("organizations")
        .update({ logo_url: null })
        .eq("id", orgId);
      if (error) {
        toast.error(t("Não foi possível remover a logo."));
        return;
      }
      setLogoUrl(null);
      toast.success(t("Logo removida."));
    } catch {
      toast.error(t("Erro de conexão."));
    } finally {
      setRemovingLogo(false);
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
          <h1 className="font-display text-xl font-semibold">{t("Configurações")}</h1>
          <p className="mt-0.5 text-sm text-txt-mut">
            {t("Sua conta, sua empresa e sua equipe.")}
          </p>
        </header>

        {/* Aparência */}
        <Card>
          <div className="flex items-start gap-3">
            <Sun className="mt-0.5 h-5 w-5 text-txt-dim" aria-hidden />
            <div className="flex-1">
              <CardTitle>{t("Aparência")}</CardTitle>
              <CardDescription>
                {t("Personalize a identidade visual e escolha o tema.")}
              </CardDescription>

              {isOwner && !showProFeatures && (
                <p className="mt-4 text-xs text-txt-dim">
                  {t("Logo e nome exibido: disponível no plano Pro.")}{" "}
                  <Link href="/app/billing" className="text-txt underline">
                    {t("Fazer upgrade")}
                  </Link>
                </p>
              )}

              {isOwner && showProFeatures && (
                <>
                  {/* Logo da empresa */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-sm text-txt-mut">{t("Logo da empresa")}</span>
                    <div className="flex items-center gap-3">
                      {logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={logoUrl}
                          alt={t("Logo da empresa")}
                          className="h-16 w-16 shrink-0 rounded-xl border border-line object-cover"
                        />
                      ) : (
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-raised font-display text-xl font-bold text-txt-mut">
                          {(company.trim().charAt(0) || "?").toUpperCase()}
                        </div>
                      )}
                      <div className="flex flex-col gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          loading={uploadingLogo}
                          onClick={() => logoInputRef.current?.click()}
                        >
                          {t("Alterar logo")}
                        </Button>
                        {logoUrl && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            loading={removingLogo}
                            onClick={() => void handleRemoveLogo()}
                          >
                            {t("Remover logo")}
                          </Button>
                        )}
                      </div>
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => void handleLogoChange(e)}
                      />
                    </div>
                  </div>

                  {/* Nome exibido */}
                  <div className="mt-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-sm text-txt-mut">{t("Nome exibido")}</span>
                      <div className="flex flex-1 gap-2 sm:max-w-xs">
                        <Input
                          value={company}
                          onChange={(e) => setCompany(e.target.value)}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          loading={saving === "displayName"}
                          onClick={() => void saveDisplayName()}
                        >
                          {t("Salvar")}
                        </Button>
                      </div>
                    </div>
                    <p className="mt-1.5 text-xs text-txt-dim">
                      {t("Este nome aparece na sua área de trabalho.")}
                    </p>
                  </div>
                </>
              )}

              {/* Tema */}
              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="text-sm text-txt-mut">{t("Tema")}</span>
                <ThemeToggle />
              </div>
            </div>
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

        {/* Unidades (roteamento de conversas por local) */}
        {isOwner && showProFeatures && <UnitsCard orgId={orgId} members={members} />}

        {/* Ajuda e sugestões */}
        <Card>
          <div className="flex items-start gap-3">
            <Lightbulb className="mt-0.5 h-5 w-5 text-txt-mut" aria-hidden />
            <div className="flex-1">
              <CardTitle>{t("Ajuda e sugestões")}</CardTitle>
              <CardDescription>
                {t("Dúvidas sobre como algo funciona? Veja a Central de Ajuda. Tem uma ideia? Manda pra gente!")}
              </CardDescription>
              <Link
                href="/app/help"
                className="focus-ring mt-3 inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-medium text-txt-mut transition-colors hover:border-line-strong hover:text-txt"
              >
                <BookOpen className="h-3.5 w-3.5" aria-hidden />
                {t("Abrir Central de Ajuda")}
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
