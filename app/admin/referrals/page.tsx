"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Gift,
  Loader2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatBRL } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type OrgRef = { id: string; name: string; slug: string };
type RewardRef = {
  id: string;
  reward_type: string;
  amount_cents: number | null;
  status: string;
  scratch_card_revealed: boolean;
  applied_at: string | null;
};
type ReferralItem = {
  id: string;
  status: string;
  activated_at: string | null;
  created_at: string;
  referrer_org: OrgRef | null;
  referred_org: OrgRef | null;
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
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (tab) params.set("status", tab);
      const res = await fetch(`/api/admin/referrals?${params}`);
      const json = await res.json();
      setData(json);
    } catch {
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
                ? "bg-forest/10 text-forest"
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
      ) : (
        <>
          <div className="space-y-3">
            {(data?.referrals.length ?? 0) === 0 && (
              <p className="py-8 text-center text-sm text-[#444]">
                Nenhuma indicação encontrada.
              </p>
            )}

            {data?.referrals.map((r) => {
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
                              ? "bg-forest/10 text-forest"
                              : rw.status === "expired"
                                ? "bg-[#222] text-[#444]"
                                : "bg-amber/10 text-amber"
                          )}
                        >
                          {rw.reward_type === "scratch_card" ? (
                            <Gift className="h-3 w-3" />
                          ) : (
                            <Clock className="h-3 w-3" />
                          )}
                          {rw.reward_type === "discount"
                            ? `Desconto ${formatBRL(rw.amount_cents ?? 0)}`
                            : `Raspadinha${rw.scratch_card_revealed ? " (revelada)" : ""}`}
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
    </div>
  );
}
