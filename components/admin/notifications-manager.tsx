"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Info, Megaphone, Sparkles, Trash2, Wrench } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn, timeAgo } from "@/lib/utils";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { NotificationType, SystemNotificationRow } from "@/types/database";

const typeMeta: Record<
  NotificationType,
  { label: string; icon: typeof Info; tone: "danger" | "amber" | "lime" | "ok" }
> = {
  maintenance: { label: "Manutenção", icon: Wrench, tone: "danger" },
  alert: { label: "Alerta", icon: AlertTriangle, tone: "amber" },
  info: { label: "Informação", icon: Info, tone: "lime" },
  feature: { label: "Novidade", icon: Sparkles, tone: "ok" },
};

/** Converte ISO → valor de <input type="datetime-local"> (sem timezone). */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export function NotificationsManager({
  initial,
  orgs,
}: {
  initial: SystemNotificationRow[];
  orgs: { id: string; name: string }[];
}) {
  const [items, setItems] = useState(initial);
  const [type, setType] = useState<NotificationType>("info");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState("all");
  const [dismissible, setDismissible] = useState(true);
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [saving, setSaving] = useState(false);

  const orgNames: Record<string, string> = {};
  for (const o of orgs) orgNames[o.id] = o.name;

  async function create() {
    if (!title.trim() || !message.trim()) {
      toast.error("Preencha título e mensagem.");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("system_notifications")
        .insert({
          type,
          title: title.trim(),
          message: message.trim(),
          target,
          // manutenção nunca é dispensável pelo cliente
          dismissible: type === "maintenance" ? false : dismissible,
          starts_at: startsAt ? new Date(startsAt).toISOString() : null,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
          active: true,
        })
        .select("*")
        .single();
      if (error || !data) {
        toast.error("Não foi possível criar a notificação.");
        return;
      }
      setItems((prev) => [data, ...prev]);
      setTitle("");
      setMessage("");
      setStartsAt("");
      setExpiresAt("");
      toast.success("Notificação publicada para os clientes.");
    } catch {
      toast.error("Erro de conexão.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(n: SystemNotificationRow) {
    const previous = items;
    setItems((prev) =>
      prev.map((x) => (x.id === n.id ? { ...x, active: !x.active } : x))
    );
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("system_notifications")
        .update({ active: !n.active })
        .eq("id", n.id);
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
    if (!window.confirm("Excluir esta notificação? Ela some imediatamente para os clientes.")) return;
    const previous = items;
    setItems((prev) => prev.filter((x) => x.id !== id));
    try {
      const supabase = createClient();
      const { error } = await supabase.from("system_notifications").delete().eq("id", id);
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
        <h1 className="font-display text-lg font-semibold">Notificações para clientes</h1>
        <p className="mt-0.5 text-sm text-txt-mut">
          Crie banners que aparecem no topo do painel dos clientes — manutenção
          programada, avisos, novidades. Atualiza ao vivo, sem precisar de deploy.
        </p>
      </header>

      {/* Criar */}
      <Card>
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-lime-soft">
            <Megaphone className="h-5 w-5 text-lime" aria-hidden />
          </div>
          <div>
            <CardTitle>Nova notificação</CardTitle>
            <CardDescription>
              Exemplo: “Sistema em manutenção das 02h às 04h” ou “Nova
              funcionalidade disponível”.
            </CardDescription>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Tipo</Label>
            <Select value={type} onChange={(e) => setType(e.target.value as NotificationType)}>
              <option value="info">Informação (azul)</option>
              <option value="alert">Alerta (âmbar)</option>
              <option value="maintenance">Manutenção (vermelho)</option>
              <option value="feature">Novidade (verde)</option>
            </Select>
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

        <div className="mt-4">
          <Label htmlFor="notif_title">Título</Label>
          <Input
            id="notif_title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex.: Manutenção programada"
          />
        </div>
        <div className="mt-4">
          <Label htmlFor="notif_message">Mensagem</Label>
          <Textarea
            id="notif_message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ex.: O sistema ficará indisponível das 02h às 04h para melhorias."
            className="min-h-[60px]"
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="notif_start">
              Exibir a partir de <span className="font-normal text-txt-dim">(opcional)</span>
            </Label>
            <Input
              id="notif_start"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="notif_expire">
              Expira em <span className="font-normal text-txt-dim">(opcional)</span>
            </Label>
            <Input
              id="notif_expire"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <label
            className={cn(
              "flex items-center gap-2 text-xs",
              type === "maintenance" ? "text-txt-dim" : "text-txt-mut"
            )}
          >
            <Switch
              checked={type === "maintenance" ? false : dismissible}
              onChange={setDismissible}
              disabled={type === "maintenance"}
            />
            Cliente pode fechar o aviso
            {type === "maintenance" && " (manutenção é sempre fixa)"}
          </label>
          <Button onClick={() => void create()} loading={saving}>
            Publicar notificação
          </Button>
        </div>
      </Card>

      {/* Lista */}
      {items.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="Nenhuma notificação criada"
          description="As notificações que você publicar aparecem aqui e no topo do painel dos clientes."
        />
      ) : (
        <ul className="space-y-3">
          {items.map((n) => {
            const meta = typeMeta[n.type] ?? typeMeta.info;
            const expired = n.expires_at && new Date(n.expires_at) < new Date();
            return (
              <li key={n.id} className="rounded-card border border-line bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={meta.tone}>
                        <meta.icon className="h-3 w-3" aria-hidden />
                        {meta.label}
                      </Badge>
                      {n.active && !expired ? (
                        <Badge tone="ok">Ativa</Badge>
                      ) : (
                        <Badge tone="neutral">{expired ? "Expirada" : "Inativa"}</Badge>
                      )}
                      <span className="text-xs text-txt-dim">
                        {n.target === "all" ? "Todos" : orgNames[n.target] ?? n.target} ·{" "}
                        {timeAgo(n.created_at)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm font-semibold text-txt">{n.title}</p>
                    <p className="text-xs text-txt-mut">{n.message}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Switch checked={n.active} onChange={() => void toggleActive(n)} />
                    <button
                      onClick={() => void remove(n.id)}
                      className="focus-ring rounded-md p-1.5 text-txt-dim hover:bg-danger-soft hover:text-danger"
                      aria-label="Excluir notificação"
                      title="Excluir"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
