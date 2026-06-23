"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Ban,
  Download,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { cn, formatPhone, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar } from "@/components/ui/avatar";
import type { ContactRow } from "@/types/database";

const PAGE_SIZE = 50;

interface CsvPreview {
  headers: string[];
  rows: string[][];
  mapName: number;
  mapPhone: number;
  mapTags: number; // -1 = nenhum
}

/** Parser CSV simples com suporte a ; ou , e aspas. */
function parseCsv(text: string): string[][] {
  const delimiter = text.split("\n")[0]?.includes(";") ? ";" : ",";
  const rows: string[][] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim()) continue;
    const cells: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < rawLine.length; i++) {
      const ch = rawLine[i];
      if (ch === '"') {
        if (inQuotes && rawLine[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delimiter && !inQuotes) {
        cells.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    cells.push(cur.trim());
    rows.push(cells);
  }
  return rows;
}

export function ContactsView({ orgId }: { orgId: string }) {
  const t = useT();
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [lastInteraction, setLastInteraction] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [editTarget, setEditTarget] = useState<ContactRow | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [csv, setCsv] = useState<CsvPreview | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // form do modal
  const [fName, setFName] = useState("");
  const [fPhone, setFPhone] = useState("");
  const [fTags, setFTags] = useState("");
  const [fNotes, setFNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const [contactsRes, convRes] = await Promise.all([
        supabase
          .from("contacts")
          .select("*")
          .eq("org_id", orgId)
          .order("created_at", { ascending: false })
          .limit(2000),
        supabase
          .from("conversations")
          .select("contact_id, last_message_at")
          .eq("org_id", orgId),
      ]);
      if (contactsRes.error) {
        toast.error(t("Não foi possível carregar os contatos."));
        return;
      }
      setContacts(contactsRes.data ?? []);
      const map: Record<string, string> = {};
      for (const c of convRes.data ?? []) {
        if (!map[c.contact_id] || c.last_message_at > map[c.contact_id]) {
          map[c.contact_id] = c.last_message_at;
        }
      }
      setLastInteraction(map);
    } catch {
      toast.error(t("Erro de conexão ao carregar os contatos."));
    } finally {
      setLoading(false);
    }
  }, [orgId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const c of contacts) for (const tag of c.tags) set.add(tag);
    return [...set].sort();
  }, [contacts]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (tagFilter !== "all" && !c.tags.includes(tagFilter)) return false;
      if (term) {
        if (
          !(c.name ?? "").toLowerCase().includes(term) &&
          !c.phone.includes(term)
        )
          return false;
      }
      return true;
    });
  }, [contacts, search, tagFilter]);

  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(Math.ceil(filtered.length / PAGE_SIZE), 1);

  function openEdit(target: ContactRow | "new") {
    setEditTarget(target);
    if (target === "new") {
      setFName("");
      setFPhone("");
      setFTags("");
      setFNotes("");
    } else {
      setFName(target.name ?? "");
      setFPhone(target.phone);
      setFTags(target.tags.join(", "));
      setFNotes(target.notes);
    }
  }

  async function handleSave() {
    const phone = fPhone.replace(/\D/g, "");
    if (phone.length < 10) {
      toast.error(t("Informe um telefone válido com DDD (ex.: 5511999998888)."));
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const tags = fTags
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (editTarget === "new") {
        const { data, error } = await supabase
          .from("contacts")
          .insert({ org_id: orgId, phone, name: fName.trim() || null, tags, notes: fNotes })
          .select("*")
          .single();
        if (error || !data) {
          toast.error(
            error?.code === "23505"
              ? t("Já existe um contato com este telefone.")
              : t("Não foi possível salvar o contato.")
          );
          return;
        }
        setContacts((prev) => [data, ...prev]);
      } else if (editTarget) {
        const patch = { phone, name: fName.trim() || null, tags, notes: fNotes };
        const { error } = await supabase
          .from("contacts")
          .update(patch)
          .eq("id", editTarget.id);
        if (error) {
          toast.error(t("Não foi possível salvar o contato."));
          return;
        }
        setContacts((prev) =>
          prev.map((c) => (c.id === editTarget.id ? { ...c, ...patch } : c))
        );
      }
      toast.success(t("Contato salvo."));
      setEditTarget(null);
    } catch {
      toast.error(t("Erro de conexão ao salvar o contato."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(contact: ContactRow) {
    if (!window.confirm(t("Excluir este contato? As conversas dele também serão removidas."))) return;
    const previous = contacts;
    setContacts((prev) => prev.filter((c) => c.id !== contact.id));
    try {
      const supabase = createClient();
      const { error } = await supabase.from("contacts").delete().eq("id", contact.id);
      if (error) {
        setContacts(previous);
        toast.error(t("Não foi possível excluir o contato."));
      } else {
        toast.success(t("Contato excluído."));
      }
    } catch {
      setContacts(previous);
      toast.error(t("Erro de conexão."));
    }
  }

  // ------------------------------------------------------------- CSV import
  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseCsv(String(reader.result ?? ""));
      if (rows.length < 2) {
        toast.error(t("CSV vazio ou sem linhas de dados."));
        return;
      }
      const headers = rows[0];
      const guess = (names: string[]) =>
        headers.findIndex((h) => names.includes(h.toLowerCase().trim()));
      setCsv({
        headers,
        rows: rows.slice(1),
        mapName: Math.max(guess(["nome", "name"]), 0),
        mapPhone: Math.max(guess(["telefone", "phone", "celular", "whatsapp", "numero", "número"]), headers.length > 1 ? 1 : 0),
        mapTags: guess(["tags", "etiquetas"]),
      });
    };
    reader.readAsText(file, "utf-8");
  }

  async function handleImport() {
    if (!csv) return;
    setImporting(true);
    try {
      const supabase = createClient();
      const seen = new Set<string>();
      const records = csv.rows
        .map((row) => {
          const phone = (row[csv.mapPhone] ?? "").replace(/\D/g, "");
          if (phone.length < 10 || seen.has(phone)) return null;
          seen.add(phone);
          return {
            org_id: orgId,
            phone,
            name: (row[csv.mapName] ?? "").trim() || null,
            tags:
              csv.mapTags >= 0
                ? (row[csv.mapTags] ?? "")
                    .split(/[,;|]/)
                    .map((s) => s.trim().toLowerCase())
                    .filter(Boolean)
                : [],
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (records.length === 0) {
        toast.error(t("Nenhum telefone válido encontrado no CSV."));
        return;
      }

      // Upsert em lotes (telefones repetidos atualizam o nome/tags)
      let imported = 0;
      for (let i = 0; i < records.length; i += 200) {
        const chunk = records.slice(i, i + 200);
        const { error } = await supabase
          .from("contacts")
          .upsert(chunk, { onConflict: "org_id,phone" });
        if (error) {
          toast.error(`${t("Falha ao importar a partir da linha")} ${i + 1}.`);
          break;
        }
        imported += chunk.length;
      }
      toast.success(`${imported} ${t("contato(s) importado(s)!")}`);
      setCsv(null);
      await load();
    } catch {
      toast.error(t("Erro de conexão ao importar."));
    } finally {
      setImporting(false);
    }
  }

  function handleExport() {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = [
      ["nome", "telefone", "tags", "notas", "bloqueado"].join(";"),
      ...filtered.map((c) =>
        [
          esc(c.name ?? ""),
          c.phone,
          esc(c.tags.join(", ")),
          esc(c.notes),
          c.blocked ? "sim" : "não",
        ].join(";")
      ),
    ];
    const blob = new Blob(["﻿" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "contatos_zari.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-lg font-semibold">{t("Contatos")}</h1>
            <p className="mt-0.5 text-sm text-txt-mut">
              {filtered.length} {t("contato(s)")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = "";
              }}
            />
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" aria-hidden />
              {t("Importar CSV")}
            </Button>
            <Button variant="secondary" size="sm" onClick={handleExport} disabled={filtered.length === 0}>
              <Download className="h-4 w-4" aria-hidden />
              {t("Exportar")}
            </Button>
            <Button size="sm" onClick={() => openEdit("new")}>
              <Plus className="h-4 w-4" aria-hidden />
              {t("Novo contato")}
            </Button>
          </div>
        </header>

        {/* Busca + filtro por tag */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-txt-dim" aria-hidden />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder={t("Buscar por nome ou telefone…")}
              className="focus-ring h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm placeholder:text-txt-dim"
            />
          </div>
          {allTags.length > 0 && (
            <Select
              value={tagFilter}
              onChange={(e) => {
                setTagFilter(e.target.value);
                setPage(0);
              }}
              className="sm:w-48"
            >
              <option value="all">{t("Todas as etiquetas")}</option>
              {allTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </Select>
          )}
        </div>

        {/* Lista */}
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : pageItems.length === 0 ? (
          <EmptyState
            icon={Users}
            title={contacts.length === 0 ? t("Nenhum contato ainda") : t("Nada por aqui")}
            description={
              contacts.length === 0
                ? t("Adicione contatos manualmente ou importe um CSV — eles também são criados automaticamente quando alguém manda mensagem.")
                : t("Nenhum contato corresponde ao filtro ou à busca.")
            }
            action={
              contacts.length === 0 ? (
                <Button onClick={() => openEdit("new")} variant="secondary">
                  <Plus className="h-4 w-4" aria-hidden />
                  {t("Novo contato")}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
              {pageItems.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-3 bg-surface px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={c.name ?? c.phone} size="sm" />
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate text-sm font-medium">
                        {c.name || formatPhone(c.phone)}
                        {c.blocked && (
                          <Badge tone="danger">
                            <Ban className="h-2.5 w-2.5" aria-hidden /> {t("bloqueado")}
                          </Badge>
                        )}
                      </p>
                      <p className="truncate text-xs text-txt-dim">
                        {formatPhone(c.phone)}
                        {c.tags.length > 0 && ` · ${c.tags.join(", ")}`}
                        {lastInteraction[c.id] &&
                          ` · ${t("última interação")} ${timeAgo(lastInteraction[c.id])}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Link
                      href="/app/inbox"
                      title={t("Ver conversas no inbox")}
                      className="focus-ring rounded-md p-1.5 text-txt-dim hover:bg-surface-hover hover:text-lime"
                    >
                      <MessageSquare className="h-4 w-4" />
                    </Link>
                    <button
                      onClick={() => openEdit(c)}
                      className="focus-ring rounded-md p-1.5 text-txt-dim hover:bg-surface-hover hover:text-txt"
                      aria-label={`${t("Editar")} ${c.name ?? c.phone}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => void handleDelete(c)}
                      className="focus-ring rounded-md p-1.5 text-txt-dim hover:bg-danger-soft hover:text-danger"
                      aria-label={`${t("Excluir")} ${c.name ?? c.phone}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {/* Paginação */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 text-xs text-txt-mut">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  ← {t("Anterior")}
                </Button>
                {page + 1} / {totalPages}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={page + 1 >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t("Próxima")} →
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal adicionar/editar */}
      <Modal
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        title={editTarget === "new" ? t("Novo contato") : t("Editar contato")}
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="c-name">{t("Nome")}</Label>
            <Input id="c-name" value={fName} onChange={(e) => setFName(e.target.value)} placeholder="Maria Silva" />
          </div>
          <div>
            <Label htmlFor="c-phone" hint={t("com código do país e DDD")}>
              {t("Telefone")}
            </Label>
            <Input
              id="c-phone"
              value={fPhone}
              onChange={(e) => setFPhone(e.target.value)}
              placeholder="5511999998888"
              inputMode="tel"
            />
          </div>
          <div>
            <Label htmlFor="c-tags" hint={t("separadas por vírgula")}>
              {t("Etiquetas")}
            </Label>
            <Input id="c-tags" value={fTags} onChange={(e) => setFTags(e.target.value)} placeholder="vip, orçamento" />
          </div>
          <div>
            <Label htmlFor="c-notes">{t("Notas internas")}</Label>
            <Textarea id="c-notes" rows={2} value={fNotes} onChange={(e) => setFNotes(e.target.value)} />
          </div>
          <Button onClick={() => void handleSave()} loading={saving} className="w-full">
            {t("Salvar contato")}
          </Button>
        </div>
      </Modal>

      {/* Modal de importação CSV (preview + mapeamento) */}
      <Modal
        open={csv !== null}
        onClose={() => setCsv(null)}
        title={t("Importar contatos (CSV)")}
        className="max-w-2xl"
      >
        {csv && (
          <div className="space-y-4">
            <p className="text-xs text-txt-mut">
              {csv.rows.length} {t("linha(s) encontradas. Confira o mapeamento das colunas:")}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["mapName", t("Nome")],
                  ["mapPhone", t("Telefone")],
                  ["mapTags", t("Etiquetas")],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <Label>{label}</Label>
                  <Select
                    value={String(csv[key])}
                    onChange={(e) =>
                      setCsv({ ...csv, [key]: Number(e.target.value) })
                    }
                  >
                    {key === "mapTags" && <option value="-1">{t("— nenhuma —")}</option>}
                    {csv.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `${t("Coluna")} ${i + 1}`}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>

            {/* Preview das 5 primeiras linhas */}
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-line bg-surface text-left text-txt-dim">
                    <th className="px-3 py-2">{t("Nome")}</th>
                    <th className="px-3 py-2">{t("Telefone")}</th>
                    <th className="px-3 py-2">{t("Etiquetas")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {csv.rows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="bg-ink">
                      <td className="px-3 py-1.5">{row[csv.mapName] ?? ""}</td>
                      <td className={cn("px-3 py-1.5", !(row[csv.mapPhone] ?? "").replace(/\D/g, "") && "text-danger")}>
                        {row[csv.mapPhone] ?? ""}
                      </td>
                      <td className="px-3 py-1.5">{csv.mapTags >= 0 ? (row[csv.mapTags] ?? "") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Button onClick={() => void handleImport()} loading={importing} className="w-full">
              <Upload className="h-4 w-4" aria-hidden />
              {t("Importar")} {csv.rows.length} {t("contato(s)")}
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
