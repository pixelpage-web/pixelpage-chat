"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatBRL, formatCompact } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { PlanRow } from "@/types/database";

interface PlanDraft {
  id: string | null;
  name: string;
  price_reais: string;
  ai_messages_limit: string;
  connections_limit: string;
  team_limit: string; // vazio = ilimitado
  campaigns_limit: string; // vazio = ilimitado, 0 = sem acesso
  max_ai_cost_usd_monthly: string; // vazio = sem limite
  highlight: boolean;
  active: boolean;
  allow_official_api: boolean;
}

function toDraft(plan: PlanRow | null): PlanDraft {
  return {
    id: plan?.id ?? null,
    name: plan?.name ?? "",
    price_reais: plan ? String(plan.price_cents / 100) : "",
    ai_messages_limit: plan ? String(plan.ai_messages_limit) : "1000",
    connections_limit: plan ? String(plan.connections_limit) : "1",
    team_limit: plan?.team_limit != null ? String(plan.team_limit) : "",
    campaigns_limit: plan?.campaigns_limit != null ? String(plan.campaigns_limit) : "",
    max_ai_cost_usd_monthly:
      plan?.max_ai_cost_usd_monthly != null ? String(plan.max_ai_cost_usd_monthly) : "",
    highlight: plan?.highlight ?? false,
    active: plan?.active ?? true,
    allow_official_api: plan?.allow_official_api ?? false,
  };
}

export function PlansManager({ initialPlans }: { initialPlans: PlanRow[] }) {
  const [plans, setPlans] = useState(initialPlans);
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!draft) return;
    if (!draft.name.trim()) {
      toast.error("Informe o nome do plano.");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const payload = {
        name: draft.name.trim(),
        price_cents: Math.round((Number(draft.price_reais) || 0) * 100),
        ai_messages_limit: Number(draft.ai_messages_limit) || 0,
        connections_limit: Number(draft.connections_limit) || 1,
        team_limit: draft.team_limit.trim() === "" ? null : Number(draft.team_limit),
        campaigns_limit:
          draft.campaigns_limit.trim() === "" ? null : Number(draft.campaigns_limit),
        max_ai_cost_usd_monthly:
          draft.max_ai_cost_usd_monthly.trim() === ""
            ? null
            : Number(draft.max_ai_cost_usd_monthly),
        highlight: draft.highlight,
        active: draft.active,
        allow_official_api: draft.allow_official_api,
      };

      if (draft.id) {
        const { error } = await supabase
          .from("plans")
          .update(payload)
          .eq("id", draft.id);
        if (error) {
          toast.error("Não foi possível salvar o plano.");
          return;
        }
        setPlans((prev) =>
          prev.map((p) => (p.id === draft.id ? { ...p, ...payload } : p))
        );
      } else {
        const { data, error } = await supabase
          .from("plans")
          .insert({ ...payload, features: { webhook_n8n: true, api_publica: true, bot_ia: true } })
          .select("*")
          .single();
        if (error || !data) {
          toast.error(
            error?.code === "23505"
              ? "Já existe um plano com esse nome."
              : "Não foi possível criar o plano."
          );
          return;
        }
        setPlans((prev) =>
          [...prev, data].sort((a, b) => a.ai_messages_limit - b.ai_messages_limit)
        );
      }
      toast.success("Plano salvo!");
      setDraft(null);
    } catch {
      toast.error("Erro de conexão ao salvar o plano.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-lg font-semibold">Planos</h1>
          <p className="mt-0.5 text-sm text-txt-mut">
            Crie e edite planos sem mexer em código.
          </p>
        </div>
        <Button onClick={() => setDraft(toDraft(null))} size="sm">
          <Plus className="h-4 w-4" aria-hidden />
          Novo plano
        </Button>
      </header>

      <div className="overflow-x-auto rounded-card border border-line">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-line bg-surface text-left text-xs text-txt-dim">
              <th className="px-4 py-2.5 font-medium">Plano</th>
              <th className="px-4 py-2.5 font-medium">Preço/mês</th>
              <th className="px-4 py-2.5 font-medium">Msgs IA</th>
              <th className="px-4 py-2.5 font-medium">Conexões</th>
              <th className="px-4 py-2.5 font-medium">Equipe</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {plans.map((plan) => (
              <tr key={plan.id} className="bg-ink">
                <td className="px-4 py-3 font-medium">{plan.name}</td>
                <td className="px-4 py-3">
                  {plan.price_cents > 0 ? formatBRL(plan.price_cents) : "—"}
                </td>
                <td className="px-4 py-3">{formatCompact(plan.ai_messages_limit)}</td>
                <td className="px-4 py-3">{plan.connections_limit}</td>
                <td className="px-4 py-3">{plan.team_limit ?? "∞"}</td>
                <td className="px-4 py-3">
                  <Badge tone={plan.active ? "ok" : "neutral"}>
                    {plan.active ? "ativo" : "inativo"}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => setDraft(toDraft(plan))}
                    className="focus-ring rounded-md p-1.5 text-txt-dim hover:bg-surface-hover hover:text-txt"
                    aria-label={`Editar plano ${plan.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? `Editar plano ${draft.name}` : "Novo plano"}
      >
        {draft && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="plan-name">Nome</Label>
                <Input
                  id="plan-name"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Pro"
                />
              </div>
              <div>
                <Label htmlFor="plan-price">Preço mensal (R$)</Label>
                <Input
                  id="plan-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.price_reais}
                  onChange={(e) => setDraft({ ...draft, price_reais: e.target.value })}
                  placeholder="97.00"
                />
              </div>
              <div>
                <Label htmlFor="plan-ai">Mensagens IA/mês</Label>
                <Input
                  id="plan-ai"
                  type="number"
                  min="0"
                  value={draft.ai_messages_limit}
                  onChange={(e) =>
                    setDraft({ ...draft, ai_messages_limit: e.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="plan-conn">Conexões WhatsApp</Label>
                <Input
                  id="plan-conn"
                  type="number"
                  min="1"
                  value={draft.connections_limit}
                  onChange={(e) =>
                    setDraft({ ...draft, connections_limit: e.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="plan-team" hint="vazio = ilimitado">
                  Membros da equipe
                </Label>
                <Input
                  id="plan-team"
                  type="number"
                  min="1"
                  value={draft.team_limit}
                  onChange={(e) => setDraft({ ...draft, team_limit: e.target.value })}
                  placeholder="∞"
                />
              </div>
              <div>
                <Label htmlFor="plan-camp" hint="vazio = ilimitado, 0 = sem acesso">
                  Campanhas/mês
                </Label>
                <Input
                  id="plan-camp"
                  type="number"
                  min="0"
                  value={draft.campaigns_limit}
                  onChange={(e) =>
                    setDraft({ ...draft, campaigns_limit: e.target.value })
                  }
                  placeholder="∞"
                />
              </div>
              <div>
                <Label htmlFor="plan-ai-cost" hint="vazio = sem limite">
                  Teto de custo de IA (USD/mês)
                </Label>
                <Input
                  id="plan-ai-cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.max_ai_cost_usd_monthly}
                  onChange={(e) =>
                    setDraft({ ...draft, max_ai_cost_usd_monthly: e.target.value })
                  }
                  placeholder="∞"
                />
              </div>
              <div className="flex items-end gap-2 pb-2">
                <Switch
                  checked={draft.active}
                  onChange={(v) => setDraft({ ...draft, active: v })}
                  label="Plano ativo"
                />
                <span className="text-xs text-txt-mut">
                  {draft.active ? "Visível" : "Oculto"}
                </span>
              </div>
              <div className="flex items-end gap-2 pb-2">
                <Switch
                  checked={draft.highlight}
                  onChange={(v) => setDraft({ ...draft, highlight: v })}
                  label="Plano em destaque"
                />
                <span className="text-xs text-txt-mut">
                  {draft.highlight ? "⭐ Mais popular" : "Sem destaque"}
                </span>
              </div>
              <div className="flex items-end gap-2 pb-2">
                <Switch
                  checked={draft.allow_official_api}
                  onChange={(v) => setDraft({ ...draft, allow_official_api: v })}
                  label="Permite API Oficial (Meta)"
                />
                <span className="text-xs text-txt-mut">
                  {draft.allow_official_api ? "Liberado" : "Bloqueado"}
                </span>
              </div>
            </div>
            <Button onClick={() => void handleSave()} loading={saving} className="w-full">
              Salvar plano
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
