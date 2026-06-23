"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ui/empty-state";
import type { MessageTemplateRow, TemplateMetaStatus } from "@/types/database";

const niches = [
  "geral",
  "clínica",
  "loja",
  "imobiliária",
  "restaurante",
  "serviços",
  "educação",
  "beleza",
];

const metaStatusMeta: Record<
  TemplateMetaStatus,
  { label: string; tone: "neutral" | "amber" | "ok" | "danger" }
> = {
  draft: { label: "Rascunho", tone: "neutral" },
  pending: { label: "Em análise Meta", tone: "amber" },
  approved: { label: "Aprovado Meta", tone: "ok" },
  rejected: { label: "Rejeitado Meta", tone: "danger" },
};

interface Draft {
  id: string | null;
  name: string;
  niche: string;
  content: string;
  meta_status: TemplateMetaStatus;
  active: boolean;
}

function toDraft(tpl: MessageTemplateRow | null): Draft {
  return {
    id: tpl?.id ?? null,
    name: tpl?.name ?? "",
    niche: tpl?.niche ?? "geral",
    content: tpl?.content ?? "",
    meta_status: tpl?.meta_status ?? "draft",
    active: tpl?.active ?? true,
  };
}

export function TemplatesManager({
  initialTemplates,
}: {
  initialTemplates: MessageTemplateRow[];
}) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!draft || !draft.name.trim() || !draft.content.trim()) {
      toast.error("Preencha nome e conteúdo.");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const payload = {
        name: draft.name.trim(),
        niche: draft.niche,
        content: draft.content.trim(),
        meta_status: draft.meta_status,
        active: draft.active,
      };
      if (draft.id) {
        const { error } = await supabase
          .from("message_templates")
          .update(payload)
          .eq("id", draft.id);
        if (error) {
          toast.error("Não foi possível salvar o template.");
          return;
        }
        setTemplates((prev) =>
          prev.map((tp) => (tp.id === draft.id ? { ...tp, ...payload } : tp))
        );
      } else {
        const { data, error } = await supabase
          .from("message_templates")
          .insert(payload)
          .select("*")
          .single();
        if (error || !data) {
          toast.error("Não foi possível criar o template.");
          return;
        }
        setTemplates((prev) => [...prev, data]);
      }
      toast.success("Template salvo!");
      setDraft(null);
    } catch {
      toast.error("Erro de conexão ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(tpl: MessageTemplateRow) {
    if (!window.confirm(`Excluir o template "${tpl.name}"?`)) return;
    const previous = templates;
    setTemplates((prev) => prev.filter((x) => x.id !== tpl.id));
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("message_templates")
        .delete()
        .eq("id", tpl.id);
      if (error) {
        setTemplates(previous);
        toast.error("Não foi possível excluir.");
      }
    } catch {
      setTemplates(previous);
      toast.error("Erro de conexão.");
    }
  }

  const grouped = niches
    .map((niche) => ({
      niche,
      items: templates.filter((tp) => tp.niche === niche),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-lg font-semibold">Templates de mensagem</h1>
          <p className="mt-0.5 text-sm text-txt-mut">
            Biblioteca global por nicho — os clientes usam pelos templates rápidos
            (&quot;/&quot;) do inbox.
          </p>
        </div>
        <Button size="sm" onClick={() => setDraft(toDraft(null))}>
          <Plus className="h-4 w-4" aria-hidden />
          Novo template
        </Button>
      </header>

      {templates.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhum template ainda"
          description="Crie mensagens prontas por nicho (clínica, loja, imobiliária…) para seus clientes usarem como base."
        />
      ) : (
        grouped.map((group) => (
          <section key={group.niche}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-txt-dim">
              {group.niche}
            </h2>
            <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
              {group.items.map((tpl) => {
                const meta = metaStatusMeta[tpl.meta_status];
                return (
                  <li
                    key={tpl.id}
                    className="flex items-center justify-between gap-3 bg-surface px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        /{tpl.name}
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        {!tpl.active && <Badge tone="neutral">inativo</Badge>}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-txt-mut">{tpl.content}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        onClick={() => setDraft(toDraft(tpl))}
                        className="focus-ring rounded-md p-1.5 text-txt-dim hover:bg-surface-hover hover:text-txt"
                        aria-label={`Editar ${tpl.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => void handleDelete(tpl)}
                        className="focus-ring rounded-md p-1.5 text-txt-dim hover:bg-danger-soft hover:text-danger"
                        aria-label={`Excluir ${tpl.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Editar template" : "Novo template"}
      >
        {draft && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="tpl-name" hint="vira o atalho /nome">
                  Nome
                </Label>
                <Input
                  id="tpl-name"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="boas-vindas"
                />
              </div>
              <div>
                <Label htmlFor="tpl-niche">Nicho</Label>
                <Select
                  id="tpl-niche"
                  value={draft.niche}
                  onChange={(e) => setDraft({ ...draft, niche: e.target.value })}
                >
                  {niches.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="tpl-content">Conteúdo</Label>
              <Textarea
                id="tpl-content"
                rows={4}
                value={draft.content}
                onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                placeholder="Olá! Obrigado pelo contato. Como podemos ajudar?"
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <Label htmlFor="tpl-status">Status na Meta</Label>
                <Select
                  id="tpl-status"
                  value={draft.meta_status}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      meta_status: e.target.value as TemplateMetaStatus,
                    })
                  }
                >
                  <option value="draft">Rascunho</option>
                  <option value="pending">Em análise</option>
                  <option value="approved">Aprovado</option>
                  <option value="rejected">Rejeitado</option>
                </Select>
              </div>
              <div className="flex items-center gap-2 pt-5">
                <Switch
                  checked={draft.active}
                  onChange={(v) => setDraft({ ...draft, active: v })}
                  label="Template ativo"
                />
                <span className="text-xs text-txt-mut">
                  {draft.active ? "Visível" : "Oculto"}
                </span>
              </div>
            </div>
            <Button onClick={() => void handleSave()} loading={saving} className="w-full">
              Salvar template
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
