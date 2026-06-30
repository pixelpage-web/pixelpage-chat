"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MessageSquarePlus, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";

interface CannedResponse {
  id: string;
  short_code: string;
  content: string;
  created_at: string;
}

export function CannedResponsesView({ orgId }: { orgId: string }) {
  const t = useT();
  const supabase = createClient();

  const [items, setItems] = useState<CannedResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CannedResponse | null>(null);
  const [saving, setSaving] = useState(false);

  const [shortCode, setShortCode] = useState("");
  const [content, setContent] = useState("");

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("canned_responses")
      .select("id, short_code, content, created_at")
      .eq("org_id", orgId)
      .order("short_code");
    setItems(data ?? []);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [orgId]); // eslint-disable-line

  function openCreate() {
    setEditing(null);
    setShortCode("");
    setContent("");
    setModalOpen(true);
  }

  function openEdit(item: CannedResponse) {
    setEditing(item);
    setShortCode(item.short_code);
    setContent(item.content);
    setModalOpen(true);
  }

  async function handleSave() {
    const code = shortCode.trim().replace(/\s+/g, "_").toLowerCase();
    const text = content.trim();
    if (!code || !text) {
      toast.error(t("Preencha o atalho e o conteúdo."));
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase
          .from("canned_responses")
          .update({ short_code: code, content: text })
          .eq("id", editing.id);
        if (error) {
          toast.error(error.code === "23505" ? t("Esse atalho já existe.") : t("Não foi possível salvar."));
          return;
        }
        setItems((prev) => prev.map((i) => i.id === editing.id ? { ...i, short_code: code, content: text } : i));
        toast.success(t("Resposta atualizada."));
      } else {
        const { data, error } = await supabase
          .from("canned_responses")
          .insert({ org_id: orgId, short_code: code, content: text })
          .select("id, short_code, content, created_at")
          .single();
        if (error) {
          toast.error(error.code === "23505" ? t("Esse atalho já existe.") : t("Não foi possível criar."));
          return;
        }
        setItems((prev) => [...prev, data].sort((a, b) => a.short_code.localeCompare(b.short_code)));
        toast.success(t("Resposta criada."));
      }
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("canned_responses").delete().eq("id", id);
    if (error) { toast.error(t("Não foi possível excluir.")); return; }
    setItems((prev) => prev.filter((i) => i.id !== id));
    toast.success(t("Resposta removida."));
  }

  const filtered = items.filter(
    (i) => i.short_code.includes(search.toLowerCase()) || i.content.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-display font-semibold">{t("Respostas Prontas")}</h1>
        <p className="mt-1 text-sm text-txt-mut">
          {t("Crie atalhos de texto que os agentes usam digitando")} <kbd className="rounded border border-line bg-surface px-1 py-0.5 text-xs font-mono">/atalho</kbd> {t("no inbox.")}
        </p>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-txt-dim" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Buscar por atalho ou conteúdo…")}
            className="focus-ring h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm placeholder:text-txt-dim"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-txt-dim hover:text-txt">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4" />
          {t("Nova resposta")}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={MessageSquarePlus}
          title={search ? t("Nenhuma resposta encontrada") : t("Nenhuma resposta criada")}
          description={search ? t("Tente outro termo de busca.") : t("Crie atalhos de texto para agilizar o atendimento.")}
          action={!search ? <Button onClick={openCreate} size="sm"><Plus className="h-4 w-4" />{t("Criar primeira resposta")}</Button> : undefined}
        />
      ) : (
        <ul className="space-y-2">
          {filtered.map((item) => (
            <li key={item.id} className="flex items-start gap-3 rounded-lg border border-line bg-surface p-4 transition-colors hover:border-line-strong">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-lime-soft px-1.5 py-0.5 font-mono text-xs font-semibold text-lime">/{item.short_code}</span>
                </div>
                <p className="mt-1.5 line-clamp-2 text-sm text-txt-mut">{item.content}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => openEdit(item)}
                  className="focus-ring rounded-md p-1.5 text-txt-dim transition-colors hover:bg-surface-hover hover:text-txt"
                  aria-label={t("Editar")}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => void handleDelete(item.id)}
                  className="focus-ring rounded-md p-1.5 text-txt-dim transition-colors hover:bg-danger-soft hover:text-danger"
                  aria-label={t("Excluir")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? t("Editar resposta") : t("Nova resposta pronta")}
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="short_code">{t("Atalho")}</Label>
            <p className="mb-1.5 text-xs text-txt-dim">{t("Palavra-chave que ativa a resposta. Sem espaços — use _ para separar.")}</p>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-txt-dim">/</span>
              <Input
                id="short_code"
                value={shortCode}
                onChange={(e) => setShortCode(e.target.value.replace(/\s/g, "_"))}
                placeholder="saudacao_inicial"
                className="pl-7 font-mono"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="content">{t("Conteúdo")}</Label>
            <p className="mb-1.5 text-xs text-txt-dim">{t("Texto completo que será inserido no campo de resposta.")}</p>
            <textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              placeholder={t("Olá! Como posso te ajudar hoje?")}
              className="focus-ring w-full resize-none rounded-lg border border-line bg-ink px-3 py-2.5 text-sm placeholder:text-txt-dim"
            />
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
