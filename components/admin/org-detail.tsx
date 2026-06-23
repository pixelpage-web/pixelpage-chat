"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Eye,
  KeyRound,
  MessageSquare,
  Smartphone,
  Users,
  Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCompact, formatFullDate, formatPhone, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { CodeBlock } from "@/components/integrations/code-block";
import type {
  OrganizationRow,
  PlanRow,
  ProfileRow,
  SubscriptionRow,
  WhatsappConnectionRow,
} from "@/types/database";

const modeLabels: Record<string, string> = {
  manual: "Manual",
  ai_bot: "Bot IA",
  external_webhook: "Webhook (n8n)",
};

export function OrgDetail({
  org,
  subscription,
  plans,
  connections,
  members,
  aiUsed,
  conversationCount,
}: {
  org: OrganizationRow;
  subscription: SubscriptionRow | null;
  plans: PlanRow[];
  connections: WhatsappConnectionRow[];
  members: Pick<ProfileRow, "id" | "name" | "role" | "created_at">[];
  aiUsed: number;
  conversationCount: number;
}) {
  const router = useRouter();
  const [suspended, setSuspended] = useState(org.suspended);
  const [planId, setPlanId] = useState(subscription?.plan_id ?? "");
  const [busy, setBusy] = useState(false);
  const [resetLink, setResetLink] = useState<string | null>(null);

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

      {/* Plano */}
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
              {subscription?.trial_ends_at && (
                <span className="ml-2 text-xs text-txt-dim">
                  trial até {formatFullDate(subscription.trial_ends_at)}
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
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {formatCompact(p.ai_messages_limit)} msgs IA
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

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
