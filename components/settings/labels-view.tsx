"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";

export interface LabelRow {
  id: string;
  title: string;
  description: string | null;
  color: string;
  show_on_sidebar: boolean;
}

const PRESET_COLORS = [
  "#1F93FF", "#FF5C00", "#3DD68C", "#F0B429",
  "#EF4444", "#A855F7", "#EC4899", "#14B8A6",
  "#F97316", "#6366F1", "#84CC16", "#06B6D4",
];

export function LabelsView({ orgId }: { orgId: string }) {
  const t = useT();
  const supabase = createClient();

  const [items, setItems] = useState<LabelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<LabelRow | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [showOnSidebar, setShowOnSidebar] = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("labels")
      .select("id, title, description, color, show_on_sidebar")
      .eq("org_id", orgId)
      .order("title");
    setItems(data ?? []);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [orgId]); // eslint-disable-line

  function openCreate() {
    setEditing(null);
    setTitle("");
    setDescription("");
    setColor(PRESET_COLORS[0]);
    setShowOnSidebar(true);
    setModalOpen(true);
  }

  function openEdit(item: LabelRow) {
    setEditing(item);
    setTitle(item.title);
    setDescription(item.description ?? "");
    setColor(item.color);
    setShowOnSidebar(item.show_on_sidebar);
    setModalOpen(true);
  }

  async function handleSave() {
    const t_title = title.trim();
    if (!t_title) { toast.error(t("Preencha o nome da etiqueta.")); return; }
    setSaving(true);
    try {
      const payload = { title: t_title, description: description.trim() || null, color, show_on_sidebar: showOnSidebar };
      if (editing) {
        const { error } = await supabase.from("labels").update(payload).eq("id", editing.id);
        if (error) { toast.error(error.code === "23505" ? t("Já existe uma etiqueta com esse nome.") : t("Não foi possível salvar.")); return; }
        setItems((prev) => prev.map((i) => i.id === editing.id ? { ...i, ...payload } : i));
        toast.success(t("Etiqueta atualizada."));
      } else {
        const { data, error } = await supabase
          .from("labels")
          .insert({ org_id: orgId, ...payload })
          .select("id, title, description, color, show_on_sidebar")
          .single();
        if (error) { toast.error(error.code === "23505" ? t("Já existe uma etiqueta com esse nome.") : t("Não foi possível criar.")); return; }
        setItems((prev) => [...prev, data].sort((a, b) => a.title.localeCompare(b.title)));
        toast.success(t("Etiqueta criada."));
      }
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("labels").delete().eq("id", id);
    if (error) { toast.error(t("Não foi possível excluir.")); return; }
    setItems((prev) => prev.filter((i) => i.id !== id));
    toast.success(t("Etiqueta removida."));
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-display font-semibold">{t("Etiquetas")}</h1>
          <p className="mt-1 text-sm text-txt-mut">
            {t("Organize conversas com etiquetas coloridas. Filtre o inbox por etiqueta.")}
          </p>
        </div>
        <Button onClick={openCreate} size="sm" className="shrink-0">
          <Plus className="h-4 w-4" />
          {t("Nova etiqueta")}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (<div key={i} className="h-14 animate-pulse rounded-lg bg-surface" />))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Tag}
          title={t("Nenhuma etiqueta")}
          description={t("Crie etiquetas para categorizar suas conversas.")}
          action={<Button onClick={openCreate} size="sm"><Plus className="h-4 w-4" />{t("Criar etiqueta")}</Button>}
        />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 rounded-lg border border-line bg-surface p-4">
              <span
                className="h-4 w-4 shrink-0 rounded-full ring-2 ring-white/10"
                style={{ backgroundColor: item.color }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{item.title}</p>
                {item.description && (
                  <p className="truncate text-xs text-txt-dim">{item.description}</p>
                )}
              </div>
              {!item.show_on_sidebar && (
                <span className="rounded border border-line px-1.5 py-0.5 text-[10px] text-txt-dim">{t("Oculta")}</span>
              )}
              <div className="flex gap-1">
                <button onClick={() => openEdit(item)} className="focus-ring rounded-md p-1.5 text-txt-dim hover:bg-surface-hover hover:text-txt" aria-label={t("Editar")}>
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => void handleDelete(item.id)} className="focus-ring rounded-md p-1.5 text-txt-dim hover:bg-danger-soft hover:text-danger" aria-label={t("Excluir")}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? t("Editar etiqueta") : t("Nova etiqueta")}>
        <div className="space-y-4">
          <div>
            <Label htmlFor="label_title">{t("Nome")}</Label>
            <Input id="label_title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("ex: Urgente")} />
          </div>
          <div>
            <Label htmlFor="label_desc">{t("Descrição")} <span className="text-txt-dim">{t("(opcional)")}</span></Label>
            <Input id="label_desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("Quando usar esta etiqueta…")} />
          </div>
          <div>
            <Label>{t("Cor")}</Label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="h-7 w-7 rounded-full transition-transform hover:scale-110 focus-ring"
                  style={{ backgroundColor: c, outline: color === c ? `3px solid ${c}` : undefined, outlineOffset: color === c ? "2px" : undefined }}
                  aria-label={c}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-7 w-7 cursor-pointer rounded-full border-0 bg-transparent p-0"
                title={t("Cor personalizada")}
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-line p-3">
            <div>
              <p className="text-sm font-medium">{t("Mostrar na sidebar")}</p>
              <p className="text-xs text-txt-dim">{t("Aparece como filtro rápido na lista de conversas.")}</p>
            </div>
            <Switch checked={showOnSidebar} onChange={setShowOnSidebar} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>{t("Cancelar")}</Button>
            <Button onClick={() => void handleSave()} loading={saving}>{t("Salvar")}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
