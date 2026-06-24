"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Lightbulb, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { timeAgo } from "@/lib/utils";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { ClientTipRow } from "@/types/database";

const emojis = ["💡", "🚀", "🤖", "📊", "✅", "🔔", "🎯", "📱", "⚡", "🎁"];

export function TipsManager({
  initial,
  orgs,
}: {
  initial: ClientTipRow[];
  orgs: { id: string; name: string }[];
}) {
  const [items, setItems] = useState(initial);
  const [emoji, setEmoji] = useState("💡");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaHref, setCtaHref] = useState("");
  const [target, setTarget] = useState("all");
  const [saving, setSaving] = useState(false);

  const orgNames: Record<string, string> = {};
  for (const o of orgs) orgNames[o.id] = o.name;

  async function create() {
    if (!title.trim() || !body.trim()) {
      toast.error("Preencha título e texto da dica.");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("client_tips")
        .insert({
          emoji,
          title: title.trim(),
          body: body.trim(),
          cta_label: ctaLabel.trim() || null,
          cta_href: ctaHref.trim() || null,
          target,
          active: true,
        })
        .select("*")
        .single();
      if (error || !data) {
        toast.error("Não foi possível criar a dica.");
        return;
      }
      setItems((prev) => [data, ...prev]);
      setTitle("");
      setBody("");
      setCtaLabel("");
      setCtaHref("");
      toast.success("Dica publicada para os clientes.");
    } catch {
      toast.error("Erro de conexão.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(tip: ClientTipRow) {
    const previous = items;
    setItems((prev) => prev.map((x) => (x.id === tip.id ? { ...x, active: !x.active } : x)));
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("client_tips")
        .update({ active: !tip.active })
        .eq("id", tip.id);
      if (error) {
        setItems(previous);
        toast.error("Não foi possível atualizar.");
      }
    } catch {
      setItems(previous);
      toast.error("Erro de conexão.");
    }
  }

  async function remove(id: string) {
    const previous = items;
    setItems((prev) => prev.filter((x) => x.id !== id));
    try {
      const supabase = createClient();
      const { error } = await supabase.from("client_tips").delete().eq("id", id);
      if (error) {
        setItems(previous);
        toast.error("Não foi possível excluir.");
      }
    } catch {
      setItems(previous);
      toast.error("Erro de conexão.");
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="font-display text-lg font-semibold">Dicas & Sugestões</h1>
        <p className="mt-0.5 text-sm text-txt-mut">
          Cards de dica que aparecem no painel dos clientes — ajude-os a tirar
          mais proveito da plataforma.
        </p>
      </header>

      {/* Criar */}
      <Card>
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-lime-soft">
            <Lightbulb className="h-5 w-5 text-lime" aria-hidden />
          </div>
          <div>
            <CardTitle>Nova dica</CardTitle>
            <CardDescription>
              Ex.: “Você sabia que pode treinar seu bot com o cardápio do seu
              negócio?”
            </CardDescription>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <Label>Ícone</Label>
            <div className="flex flex-wrap gap-1.5">
              {emojis.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  className={
                    "focus-ring flex h-9 w-9 items-center justify-center rounded-lg border text-lg transition-colors " +
                    (emoji === e
                      ? "border-lime/50 bg-lime-soft"
                      : "border-line bg-surface-raised hover:border-line-strong")
                  }
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="tip_title">Título</Label>
              <Input
                id="tip_title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: Treine seu bot"
              />
            </div>
            <div>
              <Label>Destino</Label>
              <Select value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="all">Todos os clientes</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="tip_body">Texto da dica</Label>
            <Textarea
              id="tip_body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Explique a dica em uma ou duas frases."
              className="min-h-[60px]"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="tip_cta_label">
                Texto do botão <span className="font-normal text-txt-dim">(opcional)</span>
              </Label>
              <Input
                id="tip_cta_label"
                value={ctaLabel}
                onChange={(e) => setCtaLabel(e.target.value)}
                placeholder="Ex.: Configurar agora"
              />
            </div>
            <div>
              <Label htmlFor="tip_cta_href">
                Link do botão <span className="font-normal text-txt-dim">(opcional)</span>
              </Label>
              <Input
                id="tip_cta_href"
                value={ctaHref}
                onChange={(e) => setCtaHref(e.target.value)}
                placeholder="/app/agent"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => void create()} loading={saving}>
              Publicar dica
            </Button>
          </div>
        </div>
      </Card>

      {/* Lista */}
      {items.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title="Nenhuma dica criada"
          description="As dicas que você publicar aparecem aqui e no topo do painel dos clientes."
        />
      ) : (
        <ul className="space-y-3">
          {items.map((tip) => (
            <li key={tip.id} className="rounded-card border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="text-xl leading-none" aria-hidden>
                    {tip.emoji}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-txt">{tip.title}</span>
                      {tip.active ? (
                        <Badge tone="ok">Ativa</Badge>
                      ) : (
                        <Badge tone="neutral">Inativa</Badge>
                      )}
                      <span className="text-xs text-txt-dim">
                        {tip.target === "all" ? "Todos" : orgNames[tip.target] ?? tip.target} ·{" "}
                        {timeAgo(tip.created_at)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-txt-mut">{tip.body}</p>
                    {tip.cta_label && (
                      <p className="mt-0.5 text-[11px] text-lime">
                        {tip.cta_label} → {tip.cta_href}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Switch checked={tip.active} onChange={() => void toggleActive(tip)} />
                  <button
                    onClick={() => void remove(tip.id)}
                    className="focus-ring rounded-md p-1.5 text-txt-dim hover:bg-danger-soft hover:text-danger"
                    aria-label="Excluir dica"
                    title="Excluir"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
