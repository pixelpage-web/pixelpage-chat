"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  BookOpen, ChevronRight, Eye, FileText, FolderOpen,
  Pencil, Plus, Save, Trash2, X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";

interface Portal {
  id: string;
  name: string;
  slug: string;
  color: string;
}

interface Category {
  id: string;
  portal_id: string;
  name: string;
  description: string | null;
  icon: string | null;
  position: number;
}

interface Article {
  id: string;
  portal_id: string;
  category_id: string | null;
  title: string;
  content: string;
  status: "draft" | "published";
  views: number;
  created_at: string;
  updated_at: string;
}

type View = "portals" | "categories" | "article";

export function HelpCenterView({ orgId }: { orgId: string }) {
  const t = useT();
  const supabase = createClient();

  const [view, setView] = useState<View>("portals");
  const [portals, setPortals] = useState<Portal[]>([]);
  const [selectedPortal, setSelectedPortal] = useState<Portal | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Modal states
  const [portalModal, setPortalModal] = useState(false);
  const [categoryModal, setCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  // Portal form
  const [portalName, setPortalName] = useState("");
  const [portalSlug, setPortalSlug] = useState("");

  // Category form
  const [catName, setCatName] = useState("");
  const [catDescription, setCatDescription] = useState("");
  const [catIcon, setCatIcon] = useState("📁");

  async function loadPortals() {
    setLoading(true);
    const { data } = await supabase
      .from("portals")
      .select("id, name, slug, color")
      .eq("org_id", orgId)
      .order("name");
    setPortals(data ?? []);
    setLoading(false);
  }

  async function loadPortalData(portal: Portal) {
    const [catRes, artRes] = await Promise.all([
      supabase.from("help_categories").select("*").eq("portal_id", portal.id).order("position"),
      supabase.from("help_articles").select("id, portal_id, category_id, title, content, status, views, created_at, updated_at").eq("portal_id", portal.id).order("updated_at", { ascending: false }),
    ]);
    setCategories(catRes.data ?? []);
    setArticles((artRes.data ?? []) as Article[]);
  }

  useEffect(() => { void loadPortals(); }, [orgId]); // eslint-disable-line

  async function createPortal() {
    if (!portalName.trim() || !portalSlug.trim()) { toast.error(t("Preencha nome e slug.")); return; }
    setSaving(true);
    const { data, error } = await supabase
      .from("portals")
      .insert({ org_id: orgId, name: portalName.trim(), slug: portalSlug.trim().toLowerCase().replace(/\s+/g, "-") })
      .select("id, name, slug, color")
      .single();
    setSaving(false);
    if (error) { toast.error(error.code === "23505" ? t("Slug já em uso. Escolha outro.") : t("Não foi possível criar.")); return; }
    setPortals((p) => [...p, data]);
    setPortalModal(false);
    setPortalName(""); setPortalSlug("");
    toast.success(t("Portal criado."));
  }

  async function deletePortal(id: string) {
    await supabase.from("portals").delete().eq("id", id);
    setPortals((p) => p.filter((x) => x.id !== id));
    toast.success(t("Portal removido."));
  }

  function openPortal(portal: Portal) {
    setSelectedPortal(portal);
    void loadPortalData(portal);
    setView("categories");
  }

  async function saveCategory() {
    if (!catName.trim() || !selectedPortal) { toast.error(t("Preencha o nome.")); return; }
    setSaving(true);
    if (editingCategory) {
      const { error } = await supabase
        .from("help_categories")
        .update({ name: catName.trim(), description: catDescription || null, icon: catIcon || null })
        .eq("id", editingCategory.id);
      if (!error) {
        setCategories((prev) => prev.map((c) => c.id === editingCategory.id ? { ...c, name: catName.trim(), description: catDescription || null, icon: catIcon || null } : c));
        toast.success(t("Categoria atualizada."));
      }
    } else {
      const { data, error } = await supabase
        .from("help_categories")
        .insert({ portal_id: selectedPortal.id, name: catName.trim(), description: catDescription || null, icon: catIcon || null, position: categories.length })
        .select("*")
        .single();
      if (!error && data) {
        setCategories((prev) => [...prev, data as Category]);
        toast.success(t("Categoria criada."));
      }
    }
    setSaving(false);
    setCategoryModal(false);
    setCatName(""); setCatDescription(""); setCatIcon("📁");
    setEditingCategory(null);
  }

  async function deleteCategory(id: string) {
    await supabase.from("help_categories").delete().eq("id", id);
    setCategories((prev) => prev.filter((c) => c.id !== id));
  }

  async function createArticle(categoryId?: string) {
    if (!selectedPortal) return;
    const { data, error } = await supabase
      .from("help_articles")
      .insert({ portal_id: selectedPortal.id, category_id: categoryId ?? null, title: t("Novo artigo"), content: "" })
      .select("id, portal_id, category_id, title, content, status, views, created_at, updated_at")
      .single();
    if (error) { toast.error(t("Não foi possível criar o artigo.")); return; }
    const art = data as Article;
    setArticles((prev) => [art, ...prev]);
    setSelectedArticle(art);
    setView("article");
  }

  async function saveArticle(article: Article) {
    setSaving(true);
    const { error } = await supabase
      .from("help_articles")
      .update({ title: article.title, content: article.content, status: article.status, updated_at: new Date().toISOString() })
      .eq("id", article.id);
    setSaving(false);
    if (error) { toast.error(t("Não foi possível salvar.")); return; }
    setArticles((prev) => prev.map((a) => a.id === article.id ? article : a));
    toast.success(t("Artigo salvo."));
  }

  async function deleteArticle(id: string) {
    await supabase.from("help_articles").delete().eq("id", id);
    setArticles((prev) => prev.filter((a) => a.id !== id));
    if (selectedArticle?.id === id) { setSelectedArticle(null); setView("categories"); }
  }

  // Article editor
  if (view === "article" && selectedArticle) {
    return (
      <ArticleEditor
        article={selectedArticle}
        categories={categories}
        saving={saving}
        onBack={() => { setView("categories"); setSelectedArticle(null); }}
        onSave={(art) => { setSelectedArticle(art); void saveArticle(art); }}
        onDelete={() => void deleteArticle(selectedArticle.id)}
        onPublish={() => { const updated = { ...selectedArticle, status: selectedArticle.status === "published" ? "draft" : "published" as "draft" | "published" }; setSelectedArticle(updated); void saveArticle(updated); }}
      />
    );
  }

  // Categories & articles view
  if (view === "categories" && selectedPortal) {
    const uncategorized = articles.filter((a) => !a.category_id);
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => { setView("portals"); setSelectedPortal(null); }} className="text-sm text-txt-dim hover:text-txt">{t("Portais")}</button>
          <ChevronRight className="h-4 w-4 text-txt-dim" />
          <span className="text-sm font-medium">{selectedPortal.name}</span>
          <span className="ml-auto">
            <a
              href={`/hc/${selectedPortal.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-txt hover:underline"
            >
              <Eye className="h-3.5 w-3.5" />
              {t("Ver público")}
            </a>
          </span>
        </div>

        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => { setEditingCategory(null); setCatName(""); setCatDescription(""); setCatIcon("📁"); setCategoryModal(true); }}>
            <FolderOpen className="h-4 w-4" />
            {t("Nova categoria")}
          </Button>
          <Button size="sm" onClick={() => void createArticle()}>
            <Plus className="h-4 w-4" />
            {t("Novo artigo")}
          </Button>
        </div>

        {categories.map((cat) => (
          <div key={cat.id} className="rounded-lg border border-line">
            <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3">
              <span>{cat.icon ?? "📁"}</span>
              <p className="flex-1 text-sm font-medium">{cat.name}</p>
              <button onClick={() => { setEditingCategory(cat); setCatName(cat.name); setCatDescription(cat.description ?? ""); setCatIcon(cat.icon ?? "📁"); setCategoryModal(true); }} className="text-txt-dim hover:text-txt"><Pencil className="h-3.5 w-3.5" /></button>
              <button onClick={() => void deleteCategory(cat.id)} className="text-txt-dim hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
            {articles.filter((a) => a.category_id === cat.id).map((art) => (
              <ArticleRow key={art.id} article={art} onEdit={() => { setSelectedArticle(art); setView("article"); }} onDelete={() => void deleteArticle(art.id)} />
            ))}
            <button
              onClick={() => void createArticle(cat.id)}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-xs text-txt-dim hover:bg-surface hover:text-txt"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("Adicionar artigo")}
            </button>
          </div>
        ))}

        {uncategorized.length > 0 && (
          <div className="rounded-lg border border-line">
            <div className="border-b border-line bg-surface px-4 py-3">
              <p className="text-sm font-medium text-txt-dim">{t("Sem categoria")}</p>
            </div>
            {uncategorized.map((art) => (
              <ArticleRow key={art.id} article={art} onEdit={() => { setSelectedArticle(art); setView("article"); }} onDelete={() => void deleteArticle(art.id)} />
            ))}
          </div>
        )}

        <Modal open={categoryModal} onClose={() => setCategoryModal(false)} title={editingCategory ? t("Editar categoria") : t("Nova categoria")}>
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="w-16">
                <Label>{t("Ícone")}</Label>
                <Input value={catIcon} onChange={(e) => setCatIcon(e.target.value)} className="text-center text-xl" maxLength={2} />
              </div>
              <div className="flex-1">
                <Label>{t("Nome")}</Label>
                <Input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder={t("ex: Primeiros passos")} />
              </div>
            </div>
            <div>
              <Label>{t("Descrição")} <span className="text-txt-dim">{t("(opcional)")}</span></Label>
              <Input value={catDescription} onChange={(e) => setCatDescription(e.target.value)} placeholder={t("Breve descrição desta categoria")} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setCategoryModal(false)}>{t("Cancelar")}</Button>
              <Button onClick={() => void saveCategory()} loading={saving}>{t("Salvar")}</Button>
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  // Portals list
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-display font-semibold">{t("Centro de Ajuda")}</h1>
          <p className="mt-1 text-sm text-txt-mut">{t("Base de conhecimento pública para seus clientes.")}</p>
        </div>
        <Button size="sm" onClick={() => setPortalModal(true)} className="shrink-0">
          <Plus className="h-4 w-4" />
          {t("Novo portal")}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(2)].map((_, i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-surface" />)}</div>
      ) : portals.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={t("Nenhum portal")}
          description={t("Crie um portal para publicar artigos e documentação para seus clientes.")}
          action={<Button size="sm" onClick={() => setPortalModal(true)}><Plus className="h-4 w-4" />{t("Criar portal")}</Button>}
        />
      ) : (
        <ul className="space-y-3">
          {portals.map((portal) => (
            <li key={portal.id} className="flex items-center gap-4 rounded-lg border border-line bg-surface p-5 transition-colors hover:border-line-strong">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${portal.color}20` }}>
                <BookOpen className="h-5 w-5" style={{ color: portal.color }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{portal.name}</p>
                <p className="mt-0.5 text-xs text-txt-dim">/hc/{portal.slug}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => openPortal(portal)}>
                  <FileText className="h-3.5 w-3.5" />
                  {t("Editar artigos")}
                </Button>
                <button onClick={() => void deletePortal(portal.id)} className="focus-ring rounded-md p-2 text-txt-dim hover:bg-danger-soft hover:text-danger">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal open={portalModal} onClose={() => setPortalModal(false)} title={t("Novo portal")}>
        <div className="space-y-4">
          <div>
            <Label>{t("Nome do portal")}</Label>
            <Input value={portalName} onChange={(e) => { setPortalName(e.target.value); setPortalSlug(e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")); }} placeholder={t("Central de Ajuda")} />
          </div>
          <div>
            <Label>{t("Slug")} <span className="text-xs text-txt-dim">({t("URL pública")})</span></Label>
            <div className="flex items-center gap-1">
              <span className="text-xs text-txt-dim">/hc/</span>
              <Input value={portalSlug} onChange={(e) => setPortalSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="central-ajuda" className="font-mono" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPortalModal(false)}>{t("Cancelar")}</Button>
            <Button onClick={() => void createPortal()} loading={saving}>{t("Criar portal")}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ArticleRow({ article, onEdit, onDelete }: { article: Article; onEdit: () => void; onDelete: () => void }) {
  const t = useT();
  return (
    <div className="flex items-center gap-3 border-b border-line/50 px-4 py-3 last:border-0">
      <FileText className="h-4 w-4 shrink-0 text-txt-dim" />
      <p className="flex-1 truncate text-sm">{article.title}</p>
      <Badge tone={article.status === "published" ? "ok" : "neutral"}>
        {article.status === "published" ? t("Publicado") : t("Rascunho")}
      </Badge>
      <span className="text-xs text-txt-dim">{article.views} {t("views")}</span>
      <button onClick={onEdit} className="focus-ring rounded p-1 text-txt-dim hover:text-txt"><Pencil className="h-3.5 w-3.5" /></button>
      <button onClick={onDelete} className="focus-ring rounded p-1 text-txt-dim hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
    </div>
  );
}

function ArticleEditor({
  article,
  categories,
  saving,
  onBack,
  onSave,
  onDelete,
  onPublish,
}: {
  article: Article;
  categories: Category[];
  saving: boolean;
  onBack: () => void;
  onSave: (a: Article) => void;
  onDelete: () => void;
  onPublish: () => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState(article);
  useEffect(() => setDraft(article), [article.id]); // eslint-disable-line

  return (
    <div className="flex h-full min-h-[600px] flex-col">
      <div className="flex items-center gap-3 border-b border-line px-6 py-3">
        <button onClick={onBack} className="text-sm text-txt-dim hover:text-txt">{t("← Voltar")}</button>
        <span className="text-txt-dim">/</span>
        <input
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          className="flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-txt-dim"
          placeholder={t("Título do artigo")}
        />
        <div className="flex items-center gap-2">
          <select
            value={draft.category_id ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, category_id: e.target.value || null }))}
            className="focus-ring h-8 rounded-md border border-line bg-surface px-2 text-xs"
          >
            <option value="">{t("Sem categoria")}</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button
            onClick={onPublish}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              draft.status === "published"
                ? "bg-ok-soft text-ok hover:bg-danger-soft hover:text-danger"
                : "bg-surface-raised text-txt hover:bg-txt hover:text-ink"
            )}
          >
            {draft.status === "published" ? t("Despublicar") : t("Publicar")}
          </button>
          <Button size="sm" onClick={() => onSave(draft)} loading={saving}>
            <Save className="h-3.5 w-3.5" />
            {t("Salvar")}
          </Button>
          <button onClick={onDelete} className="focus-ring rounded-md p-1.5 text-txt-dim hover:text-danger">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <textarea
        value={draft.content}
        onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
        placeholder={t("Escreva o conteúdo do artigo em markdown… # Título, **negrito**, - listas")}
        className="flex-1 resize-none bg-transparent p-6 font-mono text-sm leading-relaxed outline-none placeholder:text-txt-dim"
      />
    </div>
  );
}
