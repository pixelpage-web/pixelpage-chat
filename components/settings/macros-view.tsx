"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { GripVertical, Pencil, Play, Plus, Trash2, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";

type ActionName =
  | "send_message"
  | "assign_agent"
  | "add_label"
  | "resolve_conversation"
  | "reopen_conversation";

interface MacroAction {
  action_name: ActionName;
  action_params: string[];
}

interface MacroRow {
  id: string;
  name: string;
  actions: MacroAction[];
  visibility: "public" | "private";
  created_at: string;
}

const ACTION_LABELS: Record<ActionName, string> = {
  send_message: "Enviar mensagem",
  assign_agent: "Atribuir a agente",
  add_label: "Adicionar etiqueta",
  resolve_conversation: "Resolver conversa",
  reopen_conversation: "Reabrir conversa",
};

const ACTIONS_WITH_PARAM: ActionName[] = ["send_message", "assign_agent", "add_label"];

export function MacrosView({ orgId }: { orgId: string }) {
  const t = useT();
  const supabase = createClient();

  const [macros, setMacros] = useState<MacroRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MacroRow | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [actions, setActions] = useState<MacroAction[]>([{ action_name: "send_message", action_params: [""] }]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("macros")
      .select("id, name, actions, visibility, created_at")
      .eq("org_id", orgId)
      .order("name");
    setMacros((data ?? []) as unknown as MacroRow[]);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [orgId]); // eslint-disable-line

  function openCreate() {
    setEditing(null);
    setName("");
    setVisibility("public");
    setActions([{ action_name: "send_message", action_params: [""] }]);
    setModalOpen(true);
  }

  function openEdit(macro: MacroRow) {
    setEditing(macro);
    setName(macro.name);
    setVisibility(macro.visibility);
    setActions(macro.actions.length > 0 ? macro.actions : [{ action_name: "send_message", action_params: [""] }]);
    setModalOpen(true);
  }

  function addAction() {
    setActions((prev) => [...prev, { action_name: "send_message", action_params: [""] }]);
  }

  function removeAction(idx: number) {
    setActions((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateAction(idx: number, field: keyof MacroAction, value: string) {
    setActions((prev) =>
      prev.map((a, i) =>
        i === idx
          ? field === "action_name"
            ? { action_name: value as ActionName, action_params: [""] }
            : { ...a, action_params: [value] }
          : a
      )
    );
  }

  async function handleSave() {
    if (!name.trim()) { toast.error(t("Dê um nome à macro.")); return; }
    if (actions.length === 0) { toast.error(t("Adicione pelo menos uma ação.")); return; }
    setSaving(true);
    try {
      const payload = { name: name.trim(), actions: actions as unknown as import("@/types/database").Json, visibility };
      if (editing) {
        const { error } = await supabase.from("macros").update(payload).eq("id", editing.id);
        if (error) { toast.error(t("Não foi possível salvar.")); return; }
        setMacros((prev) => prev.map((m) => m.id === editing.id ? { ...m, name: name.trim(), actions, visibility } : m));
        toast.success(t("Macro atualizada."));
      } else {
        const { data, error } = await supabase
          .from("macros")
          .insert({ org_id: orgId, ...payload })
          .select("id, name, actions, visibility, created_at")
          .single();
        if (error) { toast.error(t("Não foi possível criar.")); return; }
        setMacros((prev) => [...prev, data as unknown as MacroRow].sort((a, b) => a.name.localeCompare(b.name)));
        toast.success(t("Macro criada."));
      }
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("macros").delete().eq("id", id);
    if (error) { toast.error(t("Não foi possível excluir.")); return; }
    setMacros((prev) => prev.filter((m) => m.id !== id));
    toast.success(t("Macro removida."));
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-display font-semibold">{t("Macros")}</h1>
          <p className="mt-1 text-sm text-txt-mut">
            {t("Sequências de ações que você executa com 1 clique numa conversa.")}
          </p>
        </div>
        <Button onClick={openCreate} size="sm" className="shrink-0">
          <Plus className="h-4 w-4" />
          {t("Nova macro")}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-surface" />)}
        </div>
      ) : macros.length === 0 ? (
        <EmptyState
          icon={Zap}
          title={t("Nenhuma macro")}
          description={t("Crie sequências de ações para automatizar tarefas repetitivas.")}
          action={<Button onClick={openCreate} size="sm"><Plus className="h-4 w-4" />{t("Criar macro")}</Button>}
        />
      ) : (
        <ul className="space-y-2">
          {macros.map((macro) => (
            <li key={macro.id} className="flex items-start gap-3 rounded-lg border border-line bg-surface p-4">
              <Zap className="mt-0.5 h-4 w-4 shrink-0 text-lime" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{macro.name}</p>
                  {macro.visibility === "private" && (
                    <span className="rounded border border-line px-1.5 py-0.5 text-[10px] text-txt-dim">{t("Privada")}</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-txt-dim">
                  {macro.actions.map((a) => t(ACTION_LABELS[a.action_name] ?? a.action_name)).join(" → ")}
                </p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEdit(macro)} className="focus-ring rounded-md p-1.5 text-txt-dim hover:bg-surface-hover hover:text-txt" aria-label={t("Editar")}>
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => void handleDelete(macro.id)} className="focus-ring rounded-md p-1.5 text-txt-dim hover:bg-danger-soft hover:text-danger" aria-label={t("Excluir")}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? t("Editar macro") : t("Nova macro")} className="max-w-lg">
        <div className="space-y-4">
          <div>
            <Label htmlFor="macro_name">{t("Nome")}</Label>
            <Input id="macro_name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("ex: Resolver e agradecer")} />
          </div>

          <div>
            <Label>{t("Visibilidade")}</Label>
            <div className="mt-1.5 flex gap-2">
              {(["public", "private"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setVisibility(v)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${visibility === v ? "border-lime bg-lime-soft text-lime" : "border-line text-txt-dim hover:border-line-strong"}`}
                >
                  {v === "public" ? t("Pública (toda equipe)") : t("Privada (só eu)")}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>{t("Ações")}</Label>
            <p className="mb-2 text-xs text-txt-dim">{t("Executadas nesta ordem quando você acionar a macro.")}</p>
            <div className="space-y-2">
              {actions.map((action, idx) => (
                <div key={idx} className="flex items-start gap-2 rounded-lg border border-line bg-ink p-3">
                  <GripVertical className="mt-1 h-4 w-4 shrink-0 text-txt-dim" />
                  <div className="flex-1 space-y-2">
                    <select
                      value={action.action_name}
                      onChange={(e) => updateAction(idx, "action_name", e.target.value)}
                      className="focus-ring h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-sm"
                    >
                      {(Object.entries(ACTION_LABELS) as [ActionName, string][]).map(([k, label]) => (
                        <option key={k} value={k}>{t(label)}</option>
                      ))}
                    </select>
                    {ACTIONS_WITH_PARAM.includes(action.action_name) && (
                      <Input
                        value={action.action_params[0] ?? ""}
                        onChange={(e) => updateAction(idx, "action_params", e.target.value)}
                        placeholder={
                          action.action_name === "send_message" ? t("Texto da mensagem…") :
                          action.action_name === "assign_agent" ? t("ID do agente") :
                          t("Nome da etiqueta")
                        }
                      />
                    )}
                  </div>
                  <button
                    onClick={() => removeAction(idx)}
                    disabled={actions.length === 1}
                    className="focus-ring rounded-md p-1.5 text-txt-dim hover:text-danger disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={addAction}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line py-2 text-xs text-txt-dim transition-colors hover:border-line-strong hover:text-txt"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("Adicionar ação")}
            </button>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>{t("Cancelar")}</Button>
            <Button onClick={() => void handleSave()} loading={saving}>{t("Salvar macro")}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
