"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Ban,
  CalendarClock,
  CheckCircle2,
  Eye,
  History,
  KeyRound,
  MessageSquare,
  Smartphone,
  Users,
  Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn, formatCompact, formatFullDate, formatPhone, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { CodeBlock } from "@/components/integrations/code-block";
import type {
  OrganizationRow,
  PlanRow,
  ProfileRow,
  SubscriptionRow,
  TrialExtensionRow,
  WhatsappConnectionRow,
} from "@/types/database";

const modeLabels: Record<string, string> = {
  manual: "Manual",
  ai_bot: "Bot IA",
  external_webhook: "Webhook (n8n)",
};

const QUICK_DAYS = [3, 7, 15, 30];

export function OrgDetail({
  org,
  subscription,
  plans,
  connections,
  members,
  aiUsed,
  conversationCount,
  trialExtensions = [],
}: {
  org: OrganizationRow;
  subscription: SubscriptionRow | null;
  plans: PlanRow[];
  connections: WhatsappConnectionRow[];
  members: Pick<ProfileRow, "id" | "name" | "role" | "created_at">[];
  aiUsed: number;
  conversationCount: number;
  trialExtensions?: Pick<TrialExtensionRow, "id" | "days_added" | "previous_end_at" | "new_end_at" | "reason" | "created_at">[];
}) {
  const router = useRouter();
  const [suspended, setSuspended] = useState(org.suspended);
  const [planId, setPlanId] = useState(subscription?.plan_id ?? "");
  const [busy, setBusy] = useState(false);
  const [resetLink, setResetLink] = useState<string | null>(null);

  // Trial extension state
  const [trialModalOpen, setTrialModalOpen] = useState(false);
  const [trialDays, setTrialDays] = useState(7);
  const [trialCustomDays, setTrialCustomDays] = useState("");
  const [trialReason, setTrialReason] = useState("");
  const [extendingTrial, setExtendingTrial] = useState(false);
  const [currentTrialEndsAt, setCurrentTrialEndsAt] = useState(subscription?.trial_ends_at ?? null);
  const [extCount, setExtCount] = useState(subscription?.trial_extended_count ?? 0);

  async function resetPassword() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: org.owner_id }),
      });
      const json = (await res.json()) as { link?: string; error?: string };
      if (!res.ok || !json.link) {
        toast.error(json.error ?? "Não foi possível gerar o link.");
        return;
      }
      setResetLink(json.link);
    } catch {
      toast.error("Erro de conexão.");
    } finally {
      setBusy(false);
    }
  }

  const currentPlan = plans.find((p) => p.id === subscription?.plan_id);
  // Só planos ativos são opções válidas de troca; um plano arquivado só aparece
  // se for o plano ATUAL da org (marcado como descontinuado).
  const selectablePlans = plans.filter((p) => p.active || p.id === planId);

  async function toggleSuspended() {
    setBusy(true);
    try {
      const supabase = createClient();
      const next = !suspended;
      const { error } = await supabase
        .from("organizations")
        .update({ suspended: next })
        .eq("id", org.id);
      if (error) {
        toast.error("Não foi possível atualizar a organização.");
        return;
      }
      setSuspended(next);
      toast.success(next ? "Organização suspensa." : "Organização reativada.");
    } catch {
      toast.error("Erro de conexão.");
    } finally {
      setBusy(false);
    }
  }

  async function changePlan(newPlanId: string) {
    if (!subscription) return;
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("subscriptions")
        .update({ plan_id: newPlanId, status: "active" })
        .eq("id", subscription.id);
      if (error) {
        toast.error("Não foi possível trocar o plano.");
        return;
      }
      setPlanId(newPlanId);
      toast.success("Plano atualizado manualmente.");
      router.refresh();
    } catch {
      toast.error("Erro de conexão.");
    } finally {
      setBusy(false);
    }
  }

  async function impersonate() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: org.id }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(json?.error ?? "Não foi possível impersonar.");
        return;
      }
      window.location.href = "/app/inbox";
    } catch {
      toast.error("Erro de conexão.");
    } finally {
      setBusy(false);
    }
  }

  async function handleExtendTrial() {
    const d = trialCustomDays ? parseInt(trialCustomDays) : trialDays;
    if (!d || d < 1 || d > 90) {
      toast.error("Informe entre 1 e 90 dias.");
      return;
    }
    setExtendingTrial(true);
    try {
      const res = await fetch("/api/admin/extend-trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: org.id, days: d, reason: trialReason }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        new_end_at?: string;
        trial_extended_count?: number;
        error?: string;
      };
      if (!res.ok) {
        toast.error(json.error ?? "Não foi possível estender o trial.");
        return;
      }
      setCurrentTrialEndsAt(json.new_end_at ?? null);
      setExtCount(json.trial_extended_count ?? extCount + 1);
      setTrialModalOpen(false);
      setTrialReason("");
      setTrialCustomDays("");
      toast.success(`Trial estendido em ${d} dias.`);
      router.refresh();
    } catch {
      toast.error("Erro de conexão.");
    } finally {
      setExtendingTrial(false);
    }
  }

  const isTrial = subscription?.status === "trial";
  const trialDaysLeft = currentTrialEndsAt
    ? Math.ceil((new Date(currentTrialEndsAt).getTime() - Date.now()) / 86_400_000)
    : null;

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <Link
        href="/admin/organizations"
        className="focus-ring inline-flex items-center gap-1.5 text-xs text-txt-mut hover:text-txt"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Organizações
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-xl font-semibold">{org.name}</h1>
            {suspended && <Badge tone="danger">Suspensa</Badge>}
          </div>
          <p className="mt-1 text-xs text-txt-dim">
            /{org.slug} · criada em {formatFullDate(org.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void impersonate()} variant="secondary" size="sm" loading={busy}>
            <Eye className="h-4 w-4" aria-hidden />
            Impersonar
          </Button>
          <Button onClick={() => void resetPassword()} variant="secondary" size="sm" loading={busy}>
            <KeyRound className="h-4 w-4" aria-hidden />
            Resetar senha
          </Button>
          <Button
            onClick={() => void toggleSuspended()}
            variant={suspended ? "primary" : "danger"}
            size="sm"
            loading={busy}
          >
            {suspended ? (
              <>
                <CheckCircle2 className="h-4 w-4" aria-hidden /> Reativar
              </>
            ) : (
              <>
                <Ban className="h-4 w-4" aria-hidden /> Suspender
              </>
            )}
          </Button>
        </div>
      </header>

      {/* Métricas rápidas */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <p className="flex items-center gap-1.5 text-xs text-txt-mut">
            <Zap className="h-3.5 w-3.5" aria-hidden /> IA no mês
          </p>
          <p className="mt-1 font-display text-xl font-semibold">
            {formatCompact(aiUsed)}
            <span className="text-xs font-normal text-txt-dim">
              {" "}
              / {formatCompact(currentPlan?.ai_messages_limit ?? 0)}
            </span>
          </p>
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-1.5 text-xs text-txt-mut">
            <MessageSquare className="h-3.5 w-3.5" aria-hidden /> Conversas
          </p>
          <p className="mt-1 font-display text-xl font-semibold">
            {formatCompact(conversationCount)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-1.5 text-xs text-txt-mut">
            <Smartphone className="h-3.5 w-3.5" aria-hidden /> Conexões
          </p>
          <p className="mt-1 font-display text-xl font-semibold">{connections.length}</p>
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-1.5 text-xs text-txt-mut">
            <Users className="h-3.5 w-3.5" aria-hidden /> Equipe
          </p>
          <p className="mt-1 font-display text-xl font-semibold">{members.length}</p>
        </Card>
      </div>

      {/* Assinatura */}
      <Card>
        <CardTitle>Assinatura</CardTitle>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Status</Label>
            <p className="text-sm">
              {subscription ? (
                <Badge
                  tone={
                    subscription.status === "active"
                      ? "ok"
                      : subscription.status === "trial"
                        ? "lime"
                        : subscription.status === "past_due"
                          ? "amber"
                          : "danger"
                  }
                >
                  {subscription.status}
                </Badge>
              ) : (
                "—"
              )}
              {currentTrialEndsAt && (
                <span className="ml-2 text-xs text-txt-dim">
                  trial até {formatFullDate(currentTrialEndsAt)}
                </span>
              )}
            </p>
          </div>
          <div>
            <Label hint="troca manual ativa o plano imediatamente">Plano</Label>
            <Select
              value={planId}
              disabled={busy || !subscription}
              onChange={(e) => void changePlan(e.target.value)}
            >
              {selectablePlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {!p.active ? " (descontinuado)" : ""} — {formatCompact(p.ai_messages_limit)} msgs IA
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {/* Gestão de Trial */}
      {isTrial && (
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-soft">
                <CalendarClock className="h-5 w-5 text-amber" aria-hidden />
              </div>
              <div>
                <CardTitle>Gestão de Trial</CardTitle>
                <p className="mt-0.5 text-xs text-txt-dim">
                  {currentTrialEndsAt ? (
                    trialDaysLeft !== null && trialDaysLeft > 0 ? (
                      <>Expira em <strong className="text-txt">{trialDaysLeft} {trialDaysLeft === 1 ? "dia" : "dias"}</strong> — {formatFullDate(currentTrialEndsAt)}</>
                    ) : (
                      <span className="text-danger">Trial expirado em {formatFullDate(currentTrialEndsAt)}</span>
                    )
                  ) : "Sem data de expiração definida"}
                  {extCount > 0 && (
                    <span className="ml-2 text-amber">· Estendido {extCount}× antes</span>
                  )}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => {
                setTrialDays(7);
                setTrialCustomDays("");
                setTrialReason("");
                setTrialModalOpen(true);
              }}
            >
              Estender trial
            </Button>
          </div>

          {/* Histórico de extensões */}
          {trialExtensions.length > 0 && (
            <div className="mt-4 border-t border-line pt-4">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-txt-mut">
                <History className="h-3.5 w-3.5" />
                Histórico de extensões
              </p>
              <ul className="space-y-1.5">
                {trialExtensions.map((ext) => (
                  <li key={ext.id} className="flex items-start justify-between gap-2 text-xs">
                    <span className="text-txt-mut">
                      <span className="font-medium text-ok">+{ext.days_added}d</span>
                      {ext.reason && <span className="ml-1 text-txt-dim">— {ext.reason}</span>}
                    </span>
                    <span className="shrink-0 text-txt-dim">{timeAgo(ext.created_at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {/* Conexões */}
      <Card>
        <CardTitle>Conexões WhatsApp</CardTitle>
        {connections.length === 0 ? (
          <p className="mt-3 text-xs text-txt-dim">Nenhuma conexão.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line">
            {connections.map((conn) => (
              <li
                key={conn.id}
                className="flex items-center justify-between gap-3 bg-ink px-3 py-2.5 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-medium text-txt">
                    {conn.label}
                    {conn.phone_display && (
                      <span className="ml-2 text-txt-dim">
                        {formatPhone(conn.phone_display)}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-txt-dim">
                    phone_number_id: {conn.phone_number_id ?? "—"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone="neutral">{modeLabels[conn.mode]}</Badge>
                  <Badge
                    tone={
                      conn.status === "connected"
                        ? "ok"
                        : conn.status === "pending"
                          ? "amber"
                          : "danger"
                    }
                  >
                    {conn.status}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Link de redefinição de senha */}
      <Modal
        open={resetLink !== null}
        onClose={() => setResetLink(null)}
        title="Link de redefinição de senha"
      >
        <p className="text-sm leading-relaxed text-txt-mut">
          Envie este link ao dono da organização (válido por tempo limitado e de
          uso único):
        </p>
        <div className="mt-3">
          <CodeBlock code={resetLink ?? ""} label="link de recuperação" />
        </div>
      </Modal>

      {/* Modal de extensão de trial */}
      <Modal
        open={trialModalOpen}
        onClose={() => setTrialModalOpen(false)}
        title="Estender trial"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-line bg-surface-raised p-3 text-sm">
            <p className="text-txt-mut">
              Expira em:{" "}
              <span className="font-medium text-txt">
                {currentTrialEndsAt ? formatFullDate(currentTrialEndsAt) : "—"}
              </span>
            </p>
            {extCount > 0 && (
              <p className="mt-0.5 text-xs text-amber">Já estendido {extCount}×</p>
            )}
          </div>

          <div>
            <Label>Dias a adicionar</Label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {QUICK_DAYS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => { setTrialDays(d); setTrialCustomDays(""); }}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                    trialDays === d && !trialCustomDays
                      ? "border-lime bg-lime-soft text-lime"
                      : "border-line text-txt-dim hover:border-line-strong hover:text-txt"
                  )}
                >
                  +{d} dias
                </button>
              ))}
            </div>
            <div className="mt-2">
              <Input
                value={trialCustomDays}
                onChange={(e) => setTrialCustomDays(e.target.value)}
                placeholder="Personalizado (1–90)"
                type="number"
                min={1}
                max={90}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="ext_reason">Motivo <span className="text-txt-dim">(opcional)</span></Label>
            <Input
              id="ext_reason"
              value={trialReason}
              onChange={(e) => setTrialReason(e.target.value)}
              placeholder="ex: cliente pediu mais tempo para avaliar"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setTrialModalOpen(false)}>Cancelar</Button>
            <Button onClick={() => void handleExtendTrial()} loading={extendingTrial}>
              Estender trial
            </Button>
          </div>
        </div>
      </Modal>

      {/* Equipe */}
      <Card>
        <CardTitle>Equipe</CardTitle>
        <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line">
          {members.map((member) => (
            <li
              key={member.id}
              className="flex items-center justify-between bg-ink px-3 py-2.5 text-xs"
            >
              <span className="font-medium text-txt">{member.name || "Sem nome"}</span>
              <span className="text-txt-dim">
                <Badge tone={member.role === "owner" ? "lime" : "neutral"}>
                  {member.role === "owner" ? "dono" : member.role === "admin" ? "admin" : "agente"}
                </Badge>
                <span className="ml-2">entrou {timeAgo(member.created_at)}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
