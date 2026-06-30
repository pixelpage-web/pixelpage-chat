"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, MessageSquare, Search, User, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { cn, formatPhone } from "@/lib/utils";

interface SearchResult {
  id: string;
  type: "contact" | "conversation" | "article";
  title: string;
  subtitle?: string;
  href: string;
}

export function GlobalSearch({ orgId }: { orgId: string }) {
  const t = useT();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const inputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(0);

  // Cmd+K / Ctrl+K to open
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    const term = q.trim();

    const [contactsRes, convsRes] = await Promise.all([
      supabase
        .from("contacts")
        .select("id, name, phone")
        .eq("org_id", orgId)
        .or(`name.ilike.%${term}%,phone.ilike.%${term}%`)
        .limit(5),
      supabase
        .from("conversations")
        .select("id, contact_id")
        .eq("org_id", orgId)
        .limit(0), // placeholder — search via contacts
    ]);

    const contactResults: SearchResult[] = (contactsRes.data ?? []).map((c) => ({
      id: c.id,
      type: "contact",
      title: c.name ?? formatPhone(c.phone),
      subtitle: formatPhone(c.phone),
      href: `/app/contacts?id=${c.id}`,
    }));

    // Search articles from all portals of this org
    const { data: portals } = await supabase.from("portals").select("id, slug").eq("org_id", orgId);
    const portalIds = (portals ?? []).map((p) => p.id);
    const portalSlugs = Object.fromEntries((portals ?? []).map((p) => [p.id, p.slug]));
    let articleResults: SearchResult[] = [];
    if (portalIds.length > 0) {
      const { data: arts } = await supabase
        .from("help_articles")
        .select("id, title, portal_id")
        .in("portal_id", portalIds)
        .eq("status", "published")
        .ilike("title", `%${term}%`)
        .limit(4);
      articleResults = (arts ?? []).map((a) => ({
        id: a.id,
        type: "article",
        title: a.title,
        subtitle: t("Artigo"),
        href: `/hc/${portalSlugs[a.portal_id]}?article=${a.id}`,
      }));
    }

    setResults([...contactResults, ...articleResults]);
    setSelected(0);
    setSearching(false);
  }, [supabase, orgId, t]);

  useEffect(() => {
    const timer = setTimeout(() => { void search(query); }, 250);
    return () => clearTimeout(timer);
  }, [query, search]);

  function navigate(result: SearchResult) {
    router.push(result.href);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, results.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
    if (e.key === "Enter" && results[selected]) { navigate(results[selected]); }
  }

  const typeIcon = { contact: User, conversation: MessageSquare, article: BookOpen };
  const typeLabel = { contact: t("Contato"), conversation: t("Conversa"), article: t("Artigo") };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[15vh]" onClick={() => setOpen(false)}>
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <Search className={cn("h-5 w-5 shrink-0 text-txt-dim", searching && "animate-pulse")} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("Buscar contatos, artigos…")}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-txt-dim"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-txt-dim hover:text-txt">
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="rounded border border-line bg-ink px-1.5 py-0.5 text-[11px] text-txt-dim">Esc</kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-1">
          {query.length < 2 ? (
            <p className="px-4 py-6 text-center text-sm text-txt-dim">{t("Digite para buscar…")}</p>
          ) : results.length === 0 && !searching ? (
            <p className="px-4 py-6 text-center text-sm text-txt-dim">{t("Nenhum resultado.")}</p>
          ) : (
            results.map((result, i) => {
              const Icon = typeIcon[result.type];
              return (
                <button
                  key={result.id}
                  onClick={() => navigate(result)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
                    i === selected ? "bg-surface-hover" : "hover:bg-surface-raised"
                  )}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-hover">
                    <Icon className="h-4 w-4 text-txt-dim" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{result.title}</p>
                    {result.subtitle && (
                      <p className="truncate text-xs text-txt-dim">{result.subtitle}</p>
                    )}
                  </div>
                  <span className="shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] text-txt-dim">
                    {typeLabel[result.type]}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-line px-4 py-2 text-[11px] text-txt-dim">
          <span>↑↓ {t("navegar")} · Enter {t("abrir")}</span>
          <span>Cmd+K {t("fechar")}</span>
        </div>
      </div>
    </div>
  );
}
