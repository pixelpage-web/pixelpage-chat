"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Clock, Plus, Sparkles, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ContactNote {
  id: string;
  content: string;
  created_at: string;
}

export function ContactNotes({
  contactId,
  orgId,
  conversationId,
}: {
  contactId: string;
  orgId: string;
  conversationId: string;
}) {
  const t = useT();
  const supabase = createClient();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("contact_notes")
      .select("id, content, created_at")
      .eq("contact_id", contactId)
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    setNotes(data ?? []);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [contactId, orgId]); // eslint-disable-line

  async function handleAdd() {
    const text = draft.trim();
    if (!text) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("contact_notes")
        .insert({ contact_id: contactId, org_id: orgId, content: text })
        .select("id, content, created_at")
        .single();
      if (error) { toast.error(t("Não foi possível salvar a nota.")); return; }
      setNotes((prev) => [data, ...prev]);
      setDraft("");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("contact_notes").delete().eq("id", id);
    if (error) { toast.error(t("Não foi possível excluir a nota.")); return; }
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }

  async function handleGenerateNote() {
    setGenerating(true);
    try {
      const res = await fetch("/api/inbox/ai-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId }),
      });
      const json = (await res.json()) as { note?: string; error?: string };
      if (!res.ok || !json.note) {
        toast.error(json.error ?? t("Não foi possível gerar a nota."));
        return;
      }
      setDraft(json.note);
      textareaRef.current?.focus();
      toast.success(t("Nota gerada! Revise e clique em salvar."));
    } catch {
      toast.error(t("Erro de conexão ao gerar a nota."));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-txt-dim">
          {t("Notas")}
        </h3>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-[11px] text-lime hover:bg-lime-soft"
          loading={generating}
          onClick={() => void handleGenerateNote()}
          title={t("A IA resume a conversa numa nota")}
        >
          <Sparkles className="h-3 w-3" aria-hidden />
          {t("Gerar com IA")}
        </Button>
      </div>

      {/* Nova nota */}
      <div className="mt-2">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void handleAdd();
            }
          }}
          rows={3}
          placeholder={t("Anotação interna… (Ctrl+Enter salva)")}
          className="focus-ring w-full resize-none rounded-lg border border-line bg-ink px-3 py-2.5 text-xs leading-relaxed placeholder:text-txt-dim"
        />
        {draft.trim() && (
          <Button size="sm" className="mt-1.5 w-full" onClick={() => void handleAdd()} loading={saving}>
            <Plus className="h-3.5 w-3.5" />
            {t("Adicionar nota")}
          </Button>
        )}
      </div>

      {/* Lista de notas */}
      {loading ? (
        <div className="mt-3 space-y-2">
          {[...Array(2)].map((_, i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-surface" />)}
        </div>
      ) : notes.length === 0 ? (
        <p className="mt-3 text-xs text-txt-dim">{t("Nenhuma nota ainda.")}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {notes.map((note) => (
            <li key={note.id} className="group relative rounded-lg border border-line bg-surface p-3">
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-txt">{note.content}</p>
              <div className="mt-2 flex items-center justify-between">
                <span className="flex items-center gap-1 text-[10px] text-txt-dim">
                  <Clock className="h-3 w-3" />
                  {timeAgo(note.created_at)}
                </span>
                <button
                  onClick={() => void handleDelete(note.id)}
                  className="focus-ring hidden rounded-md p-1 text-txt-dim hover:text-danger group-hover:flex"
                  aria-label={t("Excluir nota")}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
