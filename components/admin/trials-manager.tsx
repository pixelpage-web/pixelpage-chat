"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, CheckCircle2, Clock, TrendingUp, Users } from "lucide-react";
import { cn, formatFullDate, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Input, Label } from "@/components/ui/input";

interface TrialOrg {
  id: string;
  name: string;
  slug: string;
  ownerEmail: string | null;
  trialEndsAt: string | null;
  daysLeft: number;
  messagesThisMonth: number;
  createdAt: string;
  extendedCount: number;
}

interface TrialStats {
  active: number;
  expiringToday: number;
  expiringIn3Days: number;
  convertedThisMonth: number;
}

export function TrialsManager({
  orgs,
  stats,
}: {
  orgs: TrialOrg[];
  stats: TrialStats;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [modalOrg, setModalOrg] = useState<TrialOrg | null>(null);
  const [days, setDays] = useState(7);
  const [customDays, setCustomDays] = useState("");
  const [reason, setReason] = useState("");
  const [extending, setExtending] = useState(false);

  // Seleção em lote
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchDays, setBatchDays] = useState(7);
  const [batchExtending, setBatchExtending] = useState(false);

  function rowColor(daysLeft: number): string {
    if (daysLeft <= 0) return "border-l-danger bg-danger/5";
    if (daysLeft <= 1) return "border-l-danger bg-danger/5";
    if (daysLeft <= 3) return "border-l-amber bg-amber/5";
    if (daysLeft <= 7) return "border-l-amber/50";
    return "border-l-ok/30";
  }

  function daysBadge(daysLeft: number) {
    if (daysLeft <= 0) return <Badge tone="danger">Expirado</Badge>;
    if (daysLeft <= 1) return <Badge tone="danger">{daysLeft}d</Badge>;
    if (daysLeft <= 3) return <Badge tone="amber">{daysLeft}d</Badge>;
    if (daysLeft <= 7) return <Badge tone="neutral">{daysLeft}d</Badge>;
    return <Badge tone="ok">{daysLeft}d</Badge>;
  }

  async function extendTrial(orgId: string, daysToAdd: number, reasonText?: string) {
    const res = await fetch("/api/admin/extend-trial", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ org_id: orgId, days: daysToAdd, reason: reasonText }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(json?.error ?? "Erro ao estender trial.");
    }
  }

  async function handleExtend() {
    if (!modalOrg) return;
    const d = customDays ? parseInt(customDays) : days;
    if (!d || d < 1 || d > 90) {
      toast.error("Informe entre 1 e 90 dias.");
      return;
    }
    setExtending(true);
    try {
      await extendTrial(modalOrg.id, d, reason);
      toast.success(`Trial de ${modalOrg.name} estendido em ${d} dias.`);
      setModalOrg(null);
      setReason("");
      setCustomDays("");
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao estender.");
    } finally {
      setExtending(false);
    }
  }

  async function handleBatchExtend() {
    if (selected.size === 0) return;
    setBatchExtending(true);
    let ok = 0;
    let fail = 0;
    for (const orgId of selected) {
      try {
        await extendTrial(orgId, batchDays, "Extensão em lote");
        ok++;
      } catch {
        fail++;
      }
    }
    setBatchExtending(false);
    setSelected(new Set());
    if (ok > 0) toast.success(`${ok} trial(s) estendido(s) em ${batchDays} dias.`);
    if (fail > 0) toast.error(`${fail} falha(s) ao estender.`);
    startTransition(() => router.refresh());
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const QUICK_DAYS = [3, 7, 15, 30];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="font-display text-lg font-semibold">Gestão de Trials</h1>
        <p className="mt-0.5 text-sm text-txt-mut">
          Estenda, monitore e converta trials ativos.
        </p>
      </header>

      {/* Cards de métricas */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-txt-mut">Trials ativos</p>
            <Users className="h-4 w-4 text-txt-dim" />
          </div>
          <p className="mt-2 font-display text-2xl font-semibold">{stats.active}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-txt-mut">Expiram hoje</p>
            <Clock className="h-4 w-4 text-danger" />
          </div>
          <p className="mt-2 font-display text-2xl font-semibold text-danger">{stats.expiringToday}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-txt-mut">Em 3 dias</p>
            <CalendarClock className="h-4 w-4 text-amber" />
          </div>
          <p className="mt-2 font-display text-2xl font-semibold text-amber">{stats.expiringIn3Days}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-txt-mut">Convertidos/mês</p>
            <TrendingUp className="h-4 w-4 text-ok" />
          </div>
          <p className="mt-2 font-display text-2xl font-semibold text-ok">{stats.convertedThisMonth}</p>
        </Card>
      </div>

      {/* Ações em lote */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line-strong bg-surface-raised px-4 py-3">
          <span className="text-sm font-medium text-txt">
            {selected.size} cliente(s) selecionado(s)
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-txt-mut">Estender:</span>
            {[3, 7, 15].map((d) => (
              <button
                key={d}
                onClick={() => setBatchDays(d)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  batchDays === d
                    ? "border-txt bg-txt text-ink"
                    : "border-line text-txt-dim hover:border-line-strong hover:text-txt"
                )}
              >
                +{d}d
              </button>
            ))}
            <Button
              size="sm"
              onClick={() => void handleBatchExtend()}
              loading={batchExtending}
            >
              Aplicar a todos
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setSelected(new Set())}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Tabela de trials */}
      {orgs.length === 0 ? (
        <Card className="py-12 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-ok" />
          <p className="mt-3 font-medium">Nenhum trial ativo</p>
          <p className="mt-1 text-sm text-txt-dim">Todos os clientes já converteram ou cancelaram.</p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-card border border-line">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-surface-raised">
              <tr>
                <th className="w-10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    className="rounded border-line"
                    checked={selected.size === orgs.length}
                    onChange={(e) =>
                      setSelected(e.target.checked ? new Set(orgs.map((o) => o.id)) : new Set())
                    }
                  />
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-txt-mut">Cliente</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-txt-mut">Expira em</th>
                <th className="hidden px-4 py-2.5 text-left text-xs font-medium text-txt-mut sm:table-cell">
                  Restam
                </th>
                <th className="hidden px-4 py-2.5 text-left text-xs font-medium text-txt-mut lg:table-cell">
                  Msgs/mês
                </th>
                <th className="hidden px-4 py-2.5 text-left text-xs font-medium text-txt-mut lg:table-cell">
                  Extensões
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-txt-mut">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-surface">
              {orgs.map((org) => (
                <tr
                  key={org.id}
                  className={cn(
                    "border-l-2 transition-colors hover:bg-surface-hover",
                    rowColor(org.daysLeft)
                  )}
                >
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      className="rounded border-line"
                      checked={selected.has(org.id)}
                      onChange={() => toggleSelect(org.id)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/organizations/${org.id}`} className="hover:underline">
                      <p className="font-medium">{org.name}</p>
                    </Link>
                    {org.ownerEmail && (
                      <p className="text-xs text-txt-dim">{org.ownerEmail}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-txt-mut">
                    {org.trialEndsAt ? formatFullDate(org.trialEndsAt) : "—"}
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    {daysBadge(org.daysLeft)}
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-txt-mut lg:table-cell">
                    {org.messagesThisMonth.toLocaleString("pt-BR")}
                  </td>
                  <td className="hidden px-4 py-3 lg:table-cell">
                    {org.extendedCount > 0 ? (
                      <span className="text-xs text-amber">+{org.extendedCount}x</span>
                    ) : (
                      <span className="text-xs text-txt-dim">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setModalOrg(org);
                        setDays(7);
                        setCustomDays("");
                        setReason("");
                      }}
                    >
                      Estender
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de extensão individual */}
      <Modal
        open={!!modalOrg}
        onClose={() => setModalOrg(null)}
        title={`Estender trial — ${modalOrg?.name}`}
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-line bg-surface-raised p-3 text-sm">
            <p className="text-txt-mut">
              Expira em:{" "}
              <span className="font-medium text-txt">
                {modalOrg?.trialEndsAt ? formatFullDate(modalOrg.trialEndsAt) : "—"}
              </span>
            </p>
            {modalOrg && modalOrg.daysLeft > 0 && (
              <p className="mt-0.5 text-xs text-txt-dim">
                {modalOrg.daysLeft} {modalOrg.daysLeft === 1 ? "dia restante" : "dias restantes"}
              </p>
            )}
            {modalOrg && modalOrg.extendedCount > 0 && (
              <p className="mt-0.5 text-xs text-amber">
                Já foi estendido {modalOrg.extendedCount}×
              </p>
            )}
          </div>

          <div>
            <Label>Dias a adicionar</Label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {QUICK_DAYS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => { setDays(d); setCustomDays(""); }}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                    days === d && !customDays
                      ? "border-line-strong bg-surface-raised text-txt"
                      : "border-line text-txt-dim hover:border-line-strong hover:text-txt"
                  )}
                >
                  +{d} dias
                </button>
              ))}
            </div>
            <div className="mt-2">
              <Input
                value={customDays}
                onChange={(e) => { setCustomDays(e.target.value); }}
                placeholder="Ou digite um valor personalizado (1–90)"
                type="number"
                min={1}
                max={90}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="trial_reason">Motivo <span className="text-txt-dim">(opcional)</span></Label>
            <Input
              id="trial_reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="ex: cliente pediu mais tempo para avaliar"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setModalOrg(null)}>Cancelar</Button>
            <Button onClick={() => void handleExtend()} loading={extending || isPending}>
              Estender trial
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
