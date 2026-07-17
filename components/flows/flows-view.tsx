"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { GitBranch, Pencil, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { cn, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { flowTemplates } from "@/lib/flow-templates";
import type { FlowRow, Json } from "@/types/database";

/**
 * Página /app/flows — lista de fluxos + galeria de templates por nicho.
 */

export interface FlowConnectionOption {
  id: string;
  label: string;
  phone_display: string | null;
}

export function FlowsView({
  initialFlows,
  connections,
}: {
  initialFlows: FlowRow[];
  connections: FlowConnectionOption[];
}) {
  const t = useT();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [flows, setFlows] = useState(initialFlows);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [connectionId, setConnectionId] = useState<string>(connections[0]?.id ?? "");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const connectionLabel = (id: string | null) => {
    if (!id) return t("Todas as conexões");
    const conn = connections.find((c) => c.id === id);
    if (!conn) return t("Conexão removida");
    return conn.phone_display ? `${conn.label} (${conn.phone_display})` : conn.label;
  };

  async function handleCreate() {
    const template = flowTemplates.find((tp) => tp.id === selectedTemplate);
    if (!template) return;
    setCreating(true);
    try {
      const { data: profile } = await supabase.auth.getUser();
      const { data: me } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", profile.user?.id ?? "")
        .maybeSingle();
      if (!me?.org_id) {
        toast.error(t("Não foi possível identificar sua organização."));
        return;
      }
      const { data: created, error } = await supabase
        .from("flows")
        .insert({
          org_id: me.org_id,
          connection_id: connectionId || null,
          name: template.id === "blank" ? "Novo fluxo" : template.name,
          status: "draft",
          canvas_data: template.definition as unknown as Json,
        })
        .select("*")
        .single();
      if (error || !created) {
        toast.error(t("Não foi possível criar o fluxo."));
        return;
      }
      router.push(`/app/flows/${created.id}/edit`);
    } catch {
      toast.error(t("Erro de conexão ao criar o fluxo."));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(flow: FlowRow) {
    if (
      !window.confirm(
        t("Excluir este fluxo? Conversas em andamento nele voltam para o modo da conexão.")
      )
    ) {
      return;
    }
    setDeletingId(flow.id);
    try {
      const { error } = await supabase.from("flows").delete().eq("id", flow.id);
      if (error) {
        toast.error(t("Não foi possível excluir o fluxo."));
        return;
      }
      setFlows((prev) => prev.filter((f) => f.id !== flow.id));
      toast.success(t("Fluxo excluído."));
    } catch {
      toast.error(t("Erro de conexão."));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-lg font-semibold">{t("Fluxos")}</h1>
            <p className="mt-0.5 text-sm text-txt-mut">
              {t("Monte o atendimento do bot arrastando blocos — sem programar nada.")}
            </p>
          </div>
          <Button onClick={() => setGalleryOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            {t("Criar novo fluxo")}
          </Button>
        </header>

        {flows.length === 0 ? (
          <EmptyState
            icon={GitBranch}
            title={t("Nenhum fluxo ainda")}
            description={t("Crie seu primeiro fluxo a partir de um template pronto para o seu nicho e publique em minutos.")}
            action={
              <Button onClick={() => setGalleryOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden />
                {t("Criar novo fluxo")}
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {flows.map((flow) => (
              <Card key={flow.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-raised">
                      <GitBranch className="h-5 w-5 text-txt-mut" aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{flow.name}</p>
                      <p className="truncate text-xs text-txt-dim">
                        {connectionLabel(flow.connection_id)} · {t("editado")}{" "}
                        {timeAgo(flow.updated_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={flow.status === "published" ? "ok" : "amber"}>
                      {flow.status === "published" ? t("Publicado") : t("Rascunho")}
                    </Badge>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => router.push(`/app/flows/${flow.id}/edit`)}
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                      {t("Editar")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-txt-dim hover:text-danger"
                      loading={deletingId === flow.id}
                      onClick={() => void handleDelete(flow)}
                      aria-label={t("Excluir fluxo")}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Galeria de templates */}
      <Modal
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        title={t("Escolha um template para começar")}
        className="max-h-[85dvh] max-w-2xl overflow-y-auto"
      >
        <div className="grid gap-2.5 sm:grid-cols-2">
          {flowTemplates.map((template) => (
            <button
              key={template.id}
              onClick={() => setSelectedTemplate(template.id)}
              className={cn(
                "focus-ring rounded-lg border p-3.5 text-left transition-colors",
                selectedTemplate === template.id
                  ? "border-line-strong bg-surface-raised"
                  : "border-line bg-surface-raised hover:border-line-strong"
              )}
            >
              <p className="text-lg" aria-hidden>
                {template.emoji}
              </p>
              <p className="mt-1 text-sm font-semibold text-txt">
                {t(template.name)}
              </p>
              <p className="mt-0.5 text-xs leading-snug text-txt-dim">
                {t(template.description)}
              </p>
            </button>
          ))}
        </div>

        {connections.length > 0 && (
          <div className="mt-4">
            <Label>{t("Conexão WhatsApp deste fluxo")}</Label>
            <p className="-mt-0.5 mb-1.5 text-[11px] text-txt-dim">
              {t("O fluxo publicado responde as mensagens que chegarem nesta conexão.")}
            </p>
            <Select value={connectionId} onChange={(e) => setConnectionId(e.target.value)}>
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.phone_display ? `${c.label} (${c.phone_display})` : c.label}
                </option>
              ))}
            </Select>
          </div>
        )}
        {connections.length === 0 && (
          <p className="mt-4 rounded-lg border border-amber/25 bg-amber-soft px-3 py-2 text-xs text-amber">
            {t("Você ainda não tem conexão WhatsApp — dá para montar e testar o fluxo mesmo assim, e conectar depois.")}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setGalleryOpen(false)}>
            {t("Cancelar")}
          </Button>
          <Button
            onClick={() => void handleCreate()}
            disabled={!selectedTemplate}
            loading={creating}
          >
            {t("Criar fluxo")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
