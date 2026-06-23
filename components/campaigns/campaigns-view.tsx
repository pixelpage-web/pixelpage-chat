"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarClock,
  Megaphone,
  Plus,
  Send,
  Upload,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { cn, formatCompact, formatFullDate, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { FeatureBadge } from "@/components/ui/feature-badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { CampaignContactRow, CampaignRow, CampaignStatus } from "@/types/database";

interface ConnOption {
  id: string;
  label: string;
  phone_display: string | null;
}

const statusMeta: Record<
  CampaignStatus,
  { label: string; tone: "neutral" | "lime" | "amber" | "ok" | "danger" }
> = {
  draft: { label: "Rascunho", tone: "neutral" },
  scheduled: { label: "Agendada", tone: "amber" },
  running: { label: "Enviando", tone: "lime" },
  completed: { label: "Concluída", tone: "ok" },
  failed: { label: "Falhou", tone: "danger" },
};

export function CampaignsView({
  orgId,
  connections,
  campaignsLimit,
  usedThisMonth,
  canCreate,
  planOverride = null,
}: {
  orgId: string;
  connections: ConnOption[];
  campaignsLimit: number | null;
  usedThisMonth: number;
  canCreate: boolean;
  /** Plano necessário quando o acesso veio do override de Super Admin */
  planOverride?: string | null;
}) {
  const t = useT();
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [reportFor, setReportFor] = useState<CampaignRow | null>(null);
  const [reportItems, setReportItems] = useState<CampaignContactRow[]>([]);

  // form
  const [fName, setFName] = useState("");
  const [fConn, setFConn] = useState(connections[0]?.id ?? "");
  const [fMessage, setFMessage] = useState("");
  const [recipientMode, setRecipientMode] = useState<"all" | "tag" | "csv">("all");
  const [fTag, setFTag] = useState("");
  const [csvPhones, setCsvPhones] = useState<string[]>([]);
  const [whenMode, setWhenMode] = useState<"now" | "schedule">("now");
  const [fWhen, setFWhen] = useState("");
  const [allTags, setAllTags] = useState<string[]>([]);
  const [contactCount, setContactCount] = useState(0);
  const [tagCount, setTagCount] = useState(0);
  const [creating, setCreating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const noAccess = campaignsLimit === 0;

  const load = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        toast.error(t("Não foi possível carregar as campanhas."));
        return;
      }
      setCampaigns(data ?? []);
    } catch {
      toast.error(t("Erro de conexão ao carregar as campanhas."));
    } finally {
      setLoading(false);
    }
  }, [orgId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Progresso ao vivo enquanto houver campanha rodando
  const hasRunning = campaigns.some(
    (c) => c.status === "running" || c.status === "scheduled"
  );
  useEffect(() => {
    if (!hasRunning) return;
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [hasRunning, load]);

  // Dados auxiliares do form (tags + contagem)
  useEffect(() => {
    if (!createOpen) return;
    void (async () => {
      const supabase = createClient();
      const { data, count } = await supabase
        .from("contacts")
        .select("tags", { count: "exact" })
        .eq("org_id", orgId)
        .eq("blocked", false);
      setContactCount(count ?? 0);
      const set = new Set<string>();
      for (const c of data ?? []) for (const tag of c.tags) set.add(tag);
      const tags = [...set].sort();
      setAllTags(tags);
      if (!fTag && tags.length > 0) setFTag(tags[0]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createOpen, orgId]);

  useEffect(() => {
    if (recipientMode !== "tag" || !fTag) return;
    void (async () => {
      const supabase = createClient();
      const { count } = await supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("blocked", false)
        .contains("tags", [fTag]);
      setTagCount(count ?? 0);
    })();
  }, [recipientMode, fTag, orgId]);

  const recipientPreview =
    recipientMode === "all"
      ? contactCount
      : recipientMode === "tag"
        ? tagCount
        : csvPhones.length;

  function handleCsv(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const phones = String(reader.result ?? "")
        .split(/[\r\n;,]+/)
        .map((s) => s.replace(/\D/g, ""))
        .filter((s) => s.length >= 10);
      setCsvPhones([...new Set(phones)]);
      if (phones.length === 0) toast.error(t("Nenhum telefone válido no arquivo."));
    };
    reader.readAsText(file, "utf-8");
  }

  async function handleCreate() {
    if (!fName.trim() || !fMessage.trim() || !fConn) {
      toast.error(t("Preencha nome, conexão e mensagem."));
      return;
    }
    if (recipientPreview === 0) {
      toast.error(t("Selecione ao menos um destinatário."));
      return;
    }
    setCreating(true);
    try {
      // Resolve os destinatários conforme o modo
      const supabase = createClient();
      let contactIds: string[] = [];
      let phones: string[] = [];
      if (recipientMode === "all") {
        const { data } = await supabase
          .from("contacts")
          .select("id")
          .eq("org_id", orgId)
          .eq("blocked", false)
          .limit(20000);
        contactIds = (data ?? []).map((c) => c.id);
      } else if (recipientMode === "tag") {
        const { data } = await supabase
          .from("contacts")
          .select("id")
          .eq("org_id", orgId)
          .eq("blocked", false)
          .contains("tags", [fTag])
          .limit(20000);
        contactIds = (data ?? []).map((c) => c.id);
      } else {
        phones = csvPhones;
      }

      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fName.trim(),
          connection_id: fConn,
          message_text: fMessage.trim(),
          contact_ids: contactIds,
          phones,
          scheduled_at:
            whenMode === "schedule" && fWhen
              ? new Date(fWhen).toISOString()
              : null,
        }),
      });
      const json = (await res.json()) as { campaign?: CampaignRow; error?: string };
      if (!res.ok || !json.campaign) {
        toast.error(json.error ?? t("Não foi possível criar a campanha."));
        return;
      }
      toast.success(
        json.campaign.status === "scheduled"
          ? t("Campanha agendada!")
          : t("Campanha iniciada — acompanhe o progresso aqui.")
      );
      setCreateOpen(false);
      setFName("");
      setFMessage("");
      setCsvPhones([]);
      await load();
    } catch {
      toast.error(t("Erro de conexão ao criar a campanha."));
    } finally {
      setCreating(false);
    }
  }

  async function openReport(campaign: CampaignRow) {
    setReportFor(campaign);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("campaign_contacts")
        .select("*")
        .eq("campaign_id", campaign.id)
        .eq("status", "failed")
        .limit(100);
      setReportItems(data ?? []);
    } catch {
      setReportItems([]);
    }
  }

  const remainingQuota = useMemo(
    () => (campaignsLimit === null ? null : Math.max(campaignsLimit - usedThisMonth, 0)),
    [campaignsLimit, usedThisMonth]
  );

  // Plano sem campanhas
  if (noAccess) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={Megaphone}
          title={t("Campanhas não incluídas no seu plano")}
          description={t("Disparos em massa estão disponíveis a partir do plano Starter. Faça upgrade para enviar campanhas para seus contatos.")}
          action={
            <Button onClick={() => (window.location.href = "/app/billing")}>
              {t("Ver planos")}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-lg font-semibold">{t("Campanhas")}</h1>
              {planOverride && <FeatureBadge requiredPlan={planOverride} />}
            </div>
            <p className="mt-0.5 text-sm text-txt-mut">
              {campaignsLimit === null
                ? t("Disparos ilimitados no seu plano")
                : `${formatCompact(usedThisMonth)} / ${formatCompact(campaignsLimit)} ${t("disparos usados no mês")}`}
            </p>
          </div>
          {canCreate && (
            <Button
              size="sm"
              onClick={() => setCreateOpen(true)}
              disabled={connections.length === 0}
            >
              <Plus className="h-4 w-4" aria-hidden />
              {t("Nova campanha")}
            </Button>
          )}
        </header>

        {connections.length === 0 && (
          <Card className="border-amber/25">
            <p className="flex items-start gap-2 text-xs text-amber">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {t("Conecte um número de WhatsApp para poder disparar campanhas.")}
            </p>
          </Card>
        )}

        {/* Aviso de boas práticas (janela 24h) */}
        <Card className="border-line">
          <p className="text-[11px] leading-relaxed text-txt-dim">
            ⚠️ {t("Boas práticas: na API oficial, envie em massa apenas para contatos que falaram com você nas últimas 24h ou use templates aprovados pela Meta. No QR Code, dispare somente para quem espera sua mensagem — excesso de denúncias pode banir o número.")}
          </p>
        </Card>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : campaigns.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title={t("Nenhuma campanha ainda")}
            description={t("Crie sua primeira campanha para enviar uma mensagem para vários contatos de uma vez.")}
          />
        ) : (
          <ul className="space-y-3">
            {campaigns.map((c) => {
              const meta = statusMeta[c.status];
              const done = c.sent + c.failed;
              const pct = c.total_contacts > 0 ? (done / c.total_contacts) * 100 : 0;
              return (
                <li key={c.id}>
                  <button
                    onClick={() => void openReport(c)}
                    className="focus-ring w-full rounded-card border border-line bg-surface p-4 text-left transition-colors hover:border-line-strong"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{c.name}</p>
                      <div className="flex items-center gap-2">
                        {c.status === "scheduled" && c.scheduled_at && (
                          <span className="flex items-center gap-1 text-[11px] text-txt-dim">
                            <CalendarClock className="h-3 w-3" aria-hidden />
                            {formatFullDate(c.scheduled_at)}
                          </span>
                        )}
                        <Badge tone={meta.tone}>{t(meta.label)}</Badge>
                      </div>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-raised">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          c.status === "failed" ? "bg-danger" : "bg-lime"
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-txt-mut">
                      {c.sent} {t("enviadas")} · {c.failed} {t("falhas")} ·{" "}
                      {c.total_contacts} {t("no total")} ·{" "}
                      <span className="text-txt-dim">{timeAgo(c.created_at)}</span>
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Modal nova campanha */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t("Nova campanha")}
        className="max-w-xl"
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="cp-name">{t("Nome da campanha")}</Label>
              <Input
                id="cp-name"
                value={fName}
                onChange={(e) => setFName(e.target.value)}
                placeholder={t("Promoção de junho")}
              />
            </div>
            <div>
              <Label htmlFor="cp-conn">{t("Conexão")}</Label>
              <Select id="cp-conn" value={fConn} onChange={(e) => setFConn(e.target.value)}>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} {c.phone_display ? `(${c.phone_display})` : ""}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="cp-msg">{t("Mensagem")}</Label>
            <Textarea
              id="cp-msg"
              rows={4}
              value={fMessage}
              onChange={(e) => setFMessage(e.target.value)}
              placeholder={t("Olá! Temos uma novidade especial para você…")}
            />
          </div>

          {/* Destinatários */}
          <div>
            <Label>{t("Destinatários")}</Label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["all", t("Todos os contatos")],
                  ["tag", t("Por etiqueta")],
                  ["csv", t("CSV de telefones")],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setRecipientMode(mode)}
                  className={cn(
                    "focus-ring rounded-lg border p-2 text-xs font-medium transition-colors",
                    recipientMode === mode
                      ? "border-lime/60 bg-lime-soft text-lime"
                      : "border-line bg-surface-raised text-txt-mut hover:border-line-strong"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {recipientMode === "tag" && (
              <Select
                value={fTag}
                onChange={(e) => setFTag(e.target.value)}
                className="mt-2"
              >
                {allTags.length === 0 && <option value="">{t("— sem etiquetas —")}</option>}
                {allTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </Select>
            )}
            {recipientMode === "csv" && (
              <div className="mt-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleCsv(file);
                    e.target.value = "";
                  }}
                />
                <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                  <Upload className="h-4 w-4" aria-hidden />
                  {csvPhones.length > 0
                    ? `${csvPhones.length} ${t("telefone(s) carregados")}`
                    : t("Escolher arquivo")}
                </Button>
              </div>
            )}
          </div>

          {/* Agendamento */}
          <div>
            <Label>{t("Quando enviar")}</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setWhenMode("now")}
                className={cn(
                  "focus-ring rounded-lg border p-2 text-xs font-medium",
                  whenMode === "now"
                    ? "border-lime/60 bg-lime-soft text-lime"
                    : "border-line bg-surface-raised text-txt-mut"
                )}
              >
                <Send className="mx-auto mb-1 h-4 w-4" aria-hidden />
                {t("Enviar agora")}
              </button>
              <button
                onClick={() => setWhenMode("schedule")}
                className={cn(
                  "focus-ring rounded-lg border p-2 text-xs font-medium",
                  whenMode === "schedule"
                    ? "border-lime/60 bg-lime-soft text-lime"
                    : "border-line bg-surface-raised text-txt-mut"
                )}
              >
                <CalendarClock className="mx-auto mb-1 h-4 w-4" aria-hidden />
                {t("Agendar")}
              </button>
            </div>
            {whenMode === "schedule" && (
              <Input
                type="datetime-local"
                value={fWhen}
                onChange={(e) => setFWhen(e.target.value)}
                className="mt-2"
              />
            )}
          </div>

          {/* Pré-visualização */}
          <div className="rounded-lg border border-lime/25 bg-lime-soft px-3 py-2 text-xs text-lime">
            {t("Você vai enviar para")} <strong>{recipientPreview}</strong>{" "}
            {t("contato(s).")}
            {remainingQuota !== null &&
              ` ${t("Saldo do mês:")} ${formatCompact(remainingQuota)}.`}
          </div>

          <Button onClick={() => void handleCreate()} loading={creating} className="w-full">
            <Megaphone className="h-4 w-4" aria-hidden />
            {whenMode === "now" ? t("Disparar campanha") : t("Agendar campanha")}
          </Button>
        </div>
      </Modal>

      {/* Relatório da campanha */}
      <Modal
        open={reportFor !== null}
        onClose={() => setReportFor(null)}
        title={`${t("Relatório")} — ${reportFor?.name ?? ""}`}
      >
        {reportFor && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-ok-soft p-3">
                <p className="font-display text-xl font-semibold text-ok">{reportFor.sent}</p>
                <p className="text-[11px] text-txt-mut">{t("enviadas")}</p>
              </div>
              <div className="rounded-lg bg-danger-soft p-3">
                <p className="font-display text-xl font-semibold text-danger">{reportFor.failed}</p>
                <p className="text-[11px] text-txt-mut">{t("falhas")}</p>
              </div>
              <div className="rounded-lg bg-surface-raised p-3">
                <p className="font-display text-xl font-semibold">{reportFor.total_contacts}</p>
                <p className="text-[11px] text-txt-mut">{t("no total")}</p>
              </div>
            </div>
            {reportItems.length > 0 && (
              <div>
                <Label>{t("Falhas (até 100)")}</Label>
                <ul className="max-h-48 divide-y divide-line overflow-y-auto rounded-lg border border-line text-xs">
                  {reportItems.map((item) => (
                    <li key={item.id} className="flex justify-between gap-2 bg-ink px-3 py-1.5">
                      <span>{item.phone}</span>
                      <span className="truncate text-danger">{item.error}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
