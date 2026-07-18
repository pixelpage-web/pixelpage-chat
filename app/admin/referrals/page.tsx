"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";

type OrgRef = { id: string; name: string; slug: string };
type RewardRef = {
  id: string;
  reward_type: string;
  milestone: number | null;
  expires_at: string | null;
  status: string;
  applied_at: string | null;
};
type ReferralItem = {
  id: string;
  status: string;
  activated_at: string | null;
  created_at: string;
  referrer_org: OrgRef | null;
  referred_org: OrgRef | null;
  /** Nome do dono (role='owner') da org indicada — quem de fato se cadastrou. */
  referred_owner_name: string | null;
  link: { code: string; clicks: number } | null;
  rewards: RewardRef[];
};

const STATUS_TABS = [
  { key: "", label: "Todos" },
  { key: "pending", label: "Pendentes" },
  { key: "activated", label: "Ativos" },
  { key: "rewarded", label: "Recompensados" },
  { key: "canceled", label: "Cancelados" },
];

const REWARD_LABEL: Record<string, string> = {
  discount_20: "20% OFF",
  discount_50: "50% OFF",
  free_month: "1 mês grátis",
  free_3months: "3 meses grátis",
};

function statusBadge(status: string) {
  const map: Record<string, { tone: "amber" | "lime" | "ok" | "danger"; label: string }> = {
    pending:   { tone: "amber",   label: "Pendente" },
    activated: { tone: "lime",    label: "Ativo" },
    rewarded:  { tone: "ok",      label: "Recompensado" },
    canceled:  { tone: "danger",  label: "Cancelado" },
  };
  const entry = map[status];
  if (!entry) return <Badge>{status}</Badge>;
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}

export default function AdminReferralsPage() {
  const [tab, setTab] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ referrals: ReferralItem[]; total: number; pages: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  // Estado do modal de exclusão
  const [deleteTarget, setDeleteTarget] = useState<ReferralItem | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (tab) params.set("status", tab);
      const res = await fetch(`/api/admin/referrals?${params}`);
      if (!res.ok) {
        setData(null);
        setLoadError(true);
        return;
      }
      const json = await res.json();
      setData(json);
    } catch {
      setData(null);
      setLoadError(true);
      toast.error("Erro ao carregar indicações");
    } finally {
      setLoading(false);
    }
  }, [tab, page]);

  useEffect(() => { load(); }, [load]);

  async function applyReward(id: string) {
    setActionId(id);
    try {
      const res = await fetch(`/api/admin/referrals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply_reward" }),
      });
      if (res.ok) {
        toast.success("Recompensa marcada como aplicada");
        await load();
      } else {
        toast.error("Erro ao aplicar recompensa");
      }
    } finally {
      setActionId(null);
    }
  }

  async function cancelReferral(id: string) {
    if (!confirm("Cancelar esta indicação? Os rewards pendentes serão expirados.")) return;
    setActionId(id);
    try {
      const res = await fetch(`/api/admin/referrals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      if (res.ok) {
        toast.success("Indicação cancelada");
        await load();
      } else {
        toast.error("Erro ao cancelar");
      }
    } finally {
      setActionId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || !deleteReason.trim()) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/referrals/${deleteTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", reason: deleteReason.trim() }),
      });
      if (!res.ok) {
        toast.error("Erro ao excluir indicação");
        return;
      }
      toast.success("Indicação excluída (soft-delete)");
      setDeleteTarget(null);
      setDeleteReason("");
      await load();
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-[#DDD]">Indicações</h1>
        <p className="mt-1 text-sm text-[#666]">
          Gerencie referrals e aplique recompensas manualmente.
        </p>
      </div>

      {/* Tabs de status */}
      <div className="flex flex-wrap gap-1.5">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setPage(1); }}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              tab === t.key
                ? "bg-[#2A2A2A] text-[#EEE]"
                : "text-[#555] hover:bg-panel-card hover:text-[#BBB]"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-[#555]" />
        </div>
      ) : loadError || !data ? (
        <div className="flex h-40 flex-col items-center justify-center gap-3 text-center">
          <XCircle className="h-6 w-6 text-red-500" aria-hidden />
          <p className="text-sm text-[#666]">Não foi possível carregar as indicações.</p>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            Tentar novamente
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {data.referrals.length === 0 && (
              <p className="py-8 text-center text-sm text-[#444]">
                Nenhuma indicação encontrada.
              </p>
            )}

            {data.referrals.map((r) => {
              const pendingRewards = r.rewards.filter((rw) => rw.status === "pending");
              const isActioning = actionId === r.id;

              return (
                <div
                  key={r.id}
                  className="rounded-xl border border-panel-border bg-panel-card p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        {statusBadge(r.status)}
                        <span className="font-mono text-[11px] text-[#444]">
                          {r.id.slice(0, 8)}
                        </span>
                      </div>
                      <p className="text-sm text-[#BBB]">
                        <span className="font-medium">{r.referrer_org?.name ?? "—"}</span>
                        <span className="mx-1.5 text-[#444]">→</span>
                        <span>{r.referred_org?.name ?? "—"}</span>
                        {r.referred_owner_name && (
                          <span className="text-[#666]"> ({r.referred_owner_name})</span>
                        )}
                      </p>
                      <p className="text-[11px] text-[#555]">
                        Link: <span className="font-mono">{r.link?.code ?? "—"}</span>
                        {" · "}
                        {r.link?.clicks ?? 0} cliques
                        {" · "}
                        {new Date(r.created_at).toLocaleDateString("pt-BR")}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {r.status === "activated" && pendingRewards.length > 0 && (
                        <Button
                          size="sm"
                          onClick={() => applyReward(r.id)}
                          loading={isActioning}
                          className="gap-1.5 text-xs"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Aplicar recompensa
                        </Button>
                      )}
                      {["pending", "activated"].includes(r.status) && (
                        <button
                          onClick={() => cancelReferral(r.id)}
                          disabled={isActioning}
                          className="flex items-center gap-1 rounded-lg border border-[#333] px-3 py-1.5 text-xs text-[#555] transition-colors hover:border-red-500/40 hover:text-red-400 disabled:opacity-50"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Cancelar
                        </button>
                      )}
                      <button
                        onClick={() => { setDeleteTarget(r); setDeleteReason(""); }}
                        disabled={isActioning}
                        className="flex items-center gap-1 rounded-lg border border-[#333] px-3 py-1.5 text-xs text-[#555] transition-colors hover:border-red-700/60 hover:text-red-500 disabled:opacity-50"
                        title="Excluir indicação (fraude)"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Excluir
                      </button>
                    </div>
                  </div>

                  {/* Rewards */}
                  {r.rewards.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-panel-border pt-3">
                      {r.rewards.map((rw) => (
                        <div
                          key={rw.id}
                          className={cn(
                            "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px]",
                            rw.status === "applied"
                              ? "bg-[#3DD68C]/10 text-[#3DD68C]"
                              : rw.status === "expired"
                                ? "bg-[#222] text-[#444]"
                                : "bg-amber/10 text-amber"
                          )}
                        >
                          {REWARD_LABEL[rw.reward_type] ?? rw.reward_type}
                          {rw.milestone ? ` (marco ${rw.milestone})` : ""}
                          {" · "}
                          {rw.status}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Paginação */}
          {(data?.pages ?? 0) > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg p-2 text-[#555] hover:bg-panel-card hover:text-[#BBB] disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-[#555]">
                {page} / {data?.pages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(data?.pages ?? 1, p + 1))}
                disabled={page === data?.pages}
                className="rounded-lg p-2 text-[#555] hover:bg-panel-card hover:text-[#BBB] disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          <p className="text-center text-[11px] text-[#444]">
            {data?.total ?? 0} indicaç{(data?.total ?? 0) === 1 ? "ão" : "ões"} no total
          </p>
        </>
      )}

      {/* Modal de confirmação de exclusão */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl border border-[#333] bg-[#111] p-6 shadow-2xl">
            <button
              onClick={() => setDeleteTarget(null)}
              className="absolute right-4 top-4 rounded-md p-1 text-[#555] hover:text-[#BBB]"
            >
              <X className="h-4 w-4" />
            </button>

            <h2 className="font-semibold text-red-400">Excluir indicação</h2>
            <p className="mt-1 text-xs text-[#555]">
              Soft-delete — registrado em audit log. Rewards pendentes serão expirados.
            </p>

            {/* Preview */}
            <div className="mt-4 rounded-lg border border-red-900/30 bg-red-950/20 p-3">
              <p className="text-xs font-medium text-[#BBB]">
                {deleteTarget.referrer_org?.name ?? "—"}
                <span className="mx-1.5 text-[#444]">→</span>
                {deleteTarget.referred_org?.name ?? "—"}
                {deleteTarget.referred_owner_name && ` (${deleteTarget.referred_owner_name})`}
              </p>
              <p className="mt-1 text-[11px] text-[#555]">
                Status: {deleteTarget.status} · ID: {deleteTarget.id.slice(0, 12)}
              </p>
              <p className="mt-0.5 text-[11px] text-[#555]">
                Link: {deleteTarget.link?.code ?? "—"} · {deleteTarget.link?.clicks ?? 0} cliques
              </p>
            </div>

            {/* Motivo */}
            <div className="mt-4">
              <Label htmlFor="ref-delete-reason" className="text-[#888]">
                Motivo (obrigatório)
              </Label>
              <Textarea
                id="ref-delete-reason"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Ex.: auto-indicação, fraude confirmada, e-mail duplicado…"
                className="mt-1 min-h-[60px] border-[#333] bg-[#1a1a1a] text-sm text-[#BBB]"
              />
            </div>

            <div className="mt-4 flex gap-2">
              <button
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-700/40 bg-red-950/30 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-950/60 disabled:opacity-50"
                disabled={!deleteReason.trim() || deleting}
                onClick={() => void confirmDelete()}
              >
                {deleting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Confirmar exclusão
              </button>
              <button
                className="rounded-lg border border-[#333] px-4 py-2 text-sm text-[#555] transition-colors hover:bg-panel-card hover:text-[#BBB]"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
