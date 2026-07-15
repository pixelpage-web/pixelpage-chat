"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Bot,
  CreditCard,
  Globe,
  MoreHorizontal,
  Pencil,
  Plus,
  Receipt,
  Server,
  TrendingDown,
  TrendingUp,
  Wallet,
  Wrench,
  Megaphone as MegaphoneIcon,
} from "lucide-react";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { cn, formatBRL } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import type { BusinessExpenseRow, ExpenseBillingCycle, ExpenseCategory } from "@/types/database";

const CATEGORY_META: Record<ExpenseCategory, { label: string; icon: typeof Server }> = {
  infraestrutura: { label: "Infraestrutura", icon: Server },
  ia: { label: "IA", icon: Bot },
  pagamento: { label: "Pagamento", icon: CreditCard },
  dominio_hospedagem: { label: "Domínio & Hospedagem", icon: Globe },
  ferramentas: { label: "Ferramentas", icon: Wrench },
  marketing: { label: "Marketing", icon: MegaphoneIcon },
  outro: { label: "Outro", icon: MoreHorizontal },
};

const CATEGORY_ORDER: ExpenseCategory[] = [
  "infraestrutura",
  "ia",
  "pagamento",
  "dominio_hospedagem",
  "ferramentas",
  "marketing",
  "outro",
];

const CYCLE_LABEL: Record<ExpenseBillingCycle, string> = {
  mensal: "Mensal",
  anual: "Anual",
  unico: "Único",
};

// Distribuição por categoria — mesma paleta de acento usada no resto do
// painel admin (lime/forest) mais tons neutros pra diferenciar fatias.
const CHART_COLORS = [
  "#5DD62C",
  "#3FA8E8",
  "#F59E0B",
  "#E5484D",
  "#A78BFA",
  "#38BDF8",
  "#8B8B8B",
];

/** Custo mensal equivalente: mensal conta cheio, anual divide por 12, único não é recorrente. */
function monthlyCents(e: BusinessExpenseRow): number {
  if (e.billing_cycle === "mensal") return e.amount_cents;
  if (e.billing_cycle === "anual") return e.amount_cents / 12;
  return 0;
}

interface FormState {
  id: string | null;
  name: string;
  category: ExpenseCategory;
  provider: string;
  amountReais: string;
  billingCycle: ExpenseBillingCycle;
  nextChargeDate: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  id: null,
  name: "",
  category: "infraestrutura",
  provider: "",
  amountReais: "",
  billingCycle: "mensal",
  nextChargeDate: "",
  notes: "",
};

export function ExpensesManager({
  initial,
  revenueMonthlyCents,
}: {
  initial: BusinessExpenseRow[];
  revenueMonthlyCents: number;
}) {
  const [items, setItems] = useState(initial);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const activeItems = useMemo(() => items.filter((e) => e.active), [items]);

  const costMonthlyCents = useMemo(
    () => activeItems.reduce((sum, e) => sum + monthlyCents(e), 0),
    [activeItems]
  );
  const marginCents = revenueMonthlyCents - costMonthlyCents;
  const marginNegative = marginCents < 0;

  const grouped = useMemo(() => {
    const map = new Map<ExpenseCategory, BusinessExpenseRow[]>();
    for (const cat of CATEGORY_ORDER) map.set(cat, []);
    for (const e of activeItems) map.get(e.category)?.push(e);
    return CATEGORY_ORDER.map((cat) => ({ cat, list: map.get(cat) ?? [] })).filter(
      (g) => g.list.length > 0
    );
  }, [activeItems]);

  const chartData = useMemo(
    () =>
      grouped
        .map((g) => ({
          name: CATEGORY_META[g.cat].label,
          value: Math.round(g.list.reduce((sum, e) => sum + monthlyCents(e), 0)) / 100,
        }))
        .filter((d) => d.value > 0),
    [grouped]
  );

  function openCreate() {
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(e: BusinessExpenseRow) {
    setForm({
      id: e.id,
      name: e.name,
      category: e.category,
      provider: e.provider ?? "",
      amountReais: (e.amount_cents / 100).toFixed(2),
      billingCycle: e.billing_cycle,
      nextChargeDate: e.next_charge_date ?? "",
      notes: e.notes ?? "",
    });
    setModalOpen(true);
  }

  async function save() {
    const amount = Number(form.amountReais.replace(",", "."));
    if (!form.name.trim() || !Number.isFinite(amount) || amount <= 0) {
      toast.error("Preencha nome e um valor válido.");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const payload = {
        name: form.name.trim(),
        category: form.category,
        provider: form.provider.trim() || null,
        amount_cents: Math.round(amount * 100),
        billing_cycle: form.billingCycle,
        next_charge_date: form.nextChargeDate || null,
        notes: form.notes.trim() || null,
      };

      if (form.id) {
        const { data, error } = await supabase
          .from("business_expenses")
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("id", form.id)
          .select("*")
          .single();
        if (error || !data) {
          toast.error("Não foi possível salvar as alterações.");
          return;
        }
        setItems((prev) => prev.map((x) => (x.id === data.id ? data : x)));
        toast.success("Gasto atualizado.");
      } else {
        const { data, error } = await supabase
          .from("business_expenses")
          .insert({ ...payload, active: true })
          .select("*")
          .single();
        if (error || !data) {
          toast.error("Não foi possível criar o gasto.");
          return;
        }
        setItems((prev) => [data, ...prev]);
        toast.success("Gasto adicionado.");
      }
      setModalOpen(false);
    } catch {
      toast.error("Erro de conexão.");
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(e: BusinessExpenseRow) {
    const previous = items;
    setItems((prev) =>
      prev.map((x) => (x.id === e.id ? { ...x, active: false } : x))
    );
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("business_expenses")
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq("id", e.id);
      if (error) {
        setItems(previous);
        toast.error("Não foi possível desativar.");
      } else {
        toast.success(`"${e.name}" desativado.`);
      }
    } catch {
      setItems(previous);
      toast.error("Erro de conexão.");
    }
  }

  return (
    <div className="min-h-full bg-panel">
      <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
        {/* ── Header ─────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#333]">
              PIXELPAGE · SUPER ADMIN
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-[#F8F8F8]">
              Gastos
            </h1>
            <p className="mt-1 text-sm text-txt-mut">
              Custos operacionais do próprio negócio — separado das
              assinaturas de receita dos clientes.
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" aria-hidden />
            Adicionar gasto
          </Button>
        </div>

        {/* ── KPI cards ──────────────────────────────── */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-panel-border bg-panel-card p-5">
            <div className="flex items-center gap-2 text-[#888]">
              <Wallet className="h-4 w-4" aria-hidden />
              <span className="text-xs">Custo mensal total</span>
            </div>
            <p className="mt-2 font-display text-xl font-bold text-[#F8F8F8]">
              {formatBRL(costMonthlyCents)}
            </p>
            <p className="mt-0.5 text-[11px] text-[#444]">
              mensal + (anual ÷ 12) · gastos ativos
            </p>
          </div>

          <div className="rounded-xl border border-forest/25 bg-forest/5 p-5">
            <div className="flex items-center gap-2 text-[#888]">
              <Receipt className="h-4 w-4" aria-hidden />
              <span className="text-xs">Receita mensal atual</span>
            </div>
            <p className="mt-2 font-display text-xl font-bold text-[#F8F8F8]">
              {formatBRL(revenueMonthlyCents)}
            </p>
            <p className="mt-0.5 text-[11px] text-[#444]">assinaturas ativas (Stripe + Cakto)</p>
          </div>

          <div
            className={cn(
              "rounded-xl border p-5",
              marginNegative ? "border-danger/30 bg-danger/10" : "border-forest/25 bg-forest/5"
            )}
          >
            <div className="flex items-center gap-2 text-[#888]">
              {marginNegative ? (
                <TrendingDown className="h-4 w-4" aria-hidden />
              ) : (
                <TrendingUp className="h-4 w-4" aria-hidden />
              )}
              <span className="text-xs">Margem</span>
            </div>
            <p
              className={cn(
                "mt-2 font-display text-xl font-bold",
                marginNegative ? "text-danger" : "text-forest"
              )}
            >
              {marginNegative ? "−" : ""}
              {formatBRL(Math.abs(marginCents))}
            </p>
            <p className="mt-0.5 text-[11px] text-[#444]">receita − custo</p>
          </div>
        </div>

        {/* ── Gráfico de distribuição ────────────────── */}
        {chartData.length > 0 && (
          <Card>
            <CardTitle>Distribuição por categoria</CardTitle>
            <CardDescription>Custo mensal equivalente, por categoria.</CardDescription>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                  >
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => formatBRL(Math.round(Number(value) * 100))}
                    contentStyle={{
                      background: "#161616",
                      border: "1px solid #2A2A2A",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {/* ── Lista agrupada por categoria ────────────── */}
        {activeItems.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="Nenhum gasto cadastrado"
            description="Adicione os custos operacionais do negócio (hospedagem, IA, ferramentas...) pra acompanhar a margem real."
            action={
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" aria-hidden />
                Adicionar gasto
              </Button>
            }
          />
        ) : (
          <div className="space-y-5">
            {grouped.map(({ cat, list }) => {
              const CatIcon = CATEGORY_META[cat].icon;
              return (
                <div key={cat}>
                  <div className="mb-2 flex items-center gap-2">
                    <CatIcon className="h-4 w-4 text-txt-mut" aria-hidden />
                    <h2 className="text-sm font-semibold text-txt">
                      {CATEGORY_META[cat].label}
                    </h2>
                    <Badge tone="neutral">{list.length}</Badge>
                  </div>
                  <ul className="space-y-2">
                    {list.map((e) => (
                      <li
                        key={e.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface p-4"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-txt">{e.name}</span>
                            {e.provider && (
                              <span className="text-xs text-txt-dim">{e.provider}</span>
                            )}
                            <Badge tone="lime">{CYCLE_LABEL[e.billing_cycle]}</Badge>
                          </div>
                          <p className="mt-0.5 text-xs text-txt-mut">
                            {formatBRL(e.amount_cents)}
                            {e.billing_cycle !== "unico" && "/" + (e.billing_cycle === "mensal" ? "mês" : "ano")}
                            {e.next_charge_date && (
                              <>
                                {" "}
                                · próxima cobrança{" "}
                                {new Date(e.next_charge_date + "T00:00:00").toLocaleDateString(
                                  "pt-BR"
                                )}
                              </>
                            )}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(e)}
                            aria-label="Editar"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden />
                            Editar
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => void deactivate(e)}
                          >
                            Desativar
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Modal: adicionar/editar gasto ─────────────── */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={form.id ? "Editar gasto" : "Novo gasto"}
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="exp_name">Nome</Label>
              <Input
                id="exp_name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex.: Vercel Pro"
              />
            </div>
            <div>
              <Label htmlFor="exp_provider">
                Provider <span className="font-normal text-txt-dim">(opcional)</span>
              </Label>
              <Input
                id="exp_provider"
                value={form.provider}
                onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
                placeholder="Ex.: Vercel"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Categoria</Label>
              <Select
                value={form.category}
                onChange={(e) =>
                  setForm((f) => ({ ...f, category: e.target.value as ExpenseCategory }))
                }
              >
                {CATEGORY_ORDER.map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_META[cat].label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Ciclo de cobrança</Label>
              <Select
                value={form.billingCycle}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    billingCycle: e.target.value as ExpenseBillingCycle,
                  }))
                }
              >
                <option value="mensal">Mensal</option>
                <option value="anual">Anual</option>
                <option value="unico">Único</option>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="exp_amount">Valor (R$)</Label>
              <Input
                id="exp_amount"
                inputMode="decimal"
                value={form.amountReais}
                onChange={(e) => setForm((f) => ({ ...f, amountReais: e.target.value }))}
                placeholder="79.90"
              />
            </div>
            <div>
              <Label htmlFor="exp_next_charge">
                Próxima cobrança <span className="font-normal text-txt-dim">(opcional)</span>
              </Label>
              <Input
                id="exp_next_charge"
                type="date"
                value={form.nextChargeDate}
                onChange={(e) => setForm((f) => ({ ...f, nextChargeDate: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="exp_notes">
              Notas <span className="font-normal text-txt-dim">(opcional)</span>
            </Label>
            <Textarea
              id="exp_notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="min-h-[60px]"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void save()} loading={saving}>
              {form.id ? "Salvar alterações" : "Adicionar gasto"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
