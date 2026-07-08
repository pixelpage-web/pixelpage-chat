import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { FinanceiroView, type FinAlert } from "@/components/admin/financeiro-view";
import type { FinRow, ModelUsage } from "@/components/admin/financeiro-org-list";

export const metadata = { title: "Financeiro · Admin" };

const DAY_MS = 86_400_000;

/** Dia 1 do mês corrente em UTC, formato date (YYYY-MM-01) — mesma chave de usage_counters/org_usage_monthly. */
function monthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function monthStartIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function todayStartIso(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  ).toISOString();
}

export default async function AdminFinanceiroPage() {
  // A RPC tem guarda is_admin() interna, que lê auth.uid() — precisa do client
  // com a sessão do superadmin (o layout /admin já garante o acesso). O client
  // service_role NÃO passaria nessa guarda: ele ignora RLS, mas auth.uid() é
  // null no JWT service_role e is_admin() retornaria false.
  const supabase = await createServerSupabase();
  const admin = createAdminClient();

  const monthStart = monthStartIso();
  const todayStart = todayStartIso();

  const [rpcRes, todayRes, monthRes, logsRes] = await Promise.all([
    supabase.rpc("get_admin_financial_dashboard", { p_month: monthKey() }),
    // "Mensagens hoje/mês" — mesma consulta do KPI existente em /admin.
    admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayStart),
    admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .gte("created_at", monthStart),
    // Drill-down por modelo: 1 consulta única do mês inteiro, agrupada em JS —
    // sem N+1 (volume atual é pequeno; revisar se ai_usage_logs crescer muito).
    admin
      .from("ai_usage_logs")
      .select("org_id, model, input_tokens, output_tokens, cost_usd")
      .gte("created_at", monthStart)
      .limit(10000),
  ]);

  const rows: FinRow[] = rpcRes.data ?? [];
  const loadError = rpcRes.error?.message ?? null;

  // ── KPIs ────────────────────────────────────────────────────────────────
  const activeRows = rows.filter((r) => r.subscription_status === "active");
  const mrrTotal = activeRows.reduce((sum, r) => sum + r.mrr_usd, 0);
  const aiCostTotal = rows.reduce((sum, r) => sum + r.ai_cost_usd, 0);
  const marginTotal = mrrTotal - aiCostTotal;

  const planBreakdown = [
    ...activeRows
      .reduce((map, r) => {
        map.set(r.plan_name, (map.get(r.plan_name) ?? 0) + 1);
        return map;
      }, new Map<string, number>())
      .entries(),
  ]
    .map(([plan, count]) => ({ plan, count }))
    .sort((a, b) => b.count - a.count);

  // ── Drill-down: uso por modelo, agrupado por org ────────────────────────
  const usageByOrg: Record<string, ModelUsage[]> = {};
  const grouped = new Map<string, Map<string, ModelUsage>>();
  for (const log of logsRes.data ?? []) {
    let orgModels = grouped.get(log.org_id);
    if (!orgModels) {
      orgModels = new Map();
      grouped.set(log.org_id, orgModels);
    }
    let entry = orgModels.get(log.model);
    if (!entry) {
      entry = { model: log.model, calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
      orgModels.set(log.model, entry);
    }
    entry.calls += 1;
    entry.inputTokens += log.input_tokens;
    entry.outputTokens += log.output_tokens;
    entry.costUsd += log.cost_usd;
  }
  for (const [orgId, models] of grouped) {
    usageByOrg[orgId] = [...models.values()].sort((a, b) => b.costUsd - a.costUsd);
  }

  // ── Central de alertas (ordem de urgência) ──────────────────────────────
  // BYOK fica fora de Crítico/Atenção (não tem margem nossa nem teto de custo);
  // past_due é ortogonal ao modo de IA, então BYOK pode aparecer em Aviso.
  const now = Date.now();

  const critico: FinAlert[] = rows
    .filter(
      (r) =>
        r.ai_mode !== "byok" &&
        r.negative_margin_since !== null &&
        now - Date.parse(r.negative_margin_since) >= 7 * DAY_MS
    )
    .map((r) => ({
      severity: "critico" as const,
      orgId: r.org_id,
      orgName: r.org_name,
      reason: `margem negativa há ${Math.floor(
        (now - Date.parse(r.negative_margin_since!)) / DAY_MS
      )} dias`,
    }));

  const criticoIds = new Set(critico.map((a) => a.orgId));

  const atencao: FinAlert[] = rows
    .filter(
      (r) =>
        r.ai_mode !== "byok" &&
        r.usage_status === "warning" &&
        !criticoIds.has(r.org_id)
    )
    .map((r) => ({
      severity: "atencao" as const,
      orgId: r.org_id,
      orgName: r.org_name,
      reason: "atingiu 80% do teto de custo de IA do plano",
    }));

  const aviso: FinAlert[] = rows
    .filter((r) => r.subscription_status === "past_due")
    .map((r) => ({
      severity: "aviso" as const,
      orgId: r.org_id,
      orgName: r.org_name,
      reason: "pagamento pendente (past_due)",
    }));

  const alerts = [...critico, ...atencao, ...aviso];

  const monthLabel = new Date().toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <FinanceiroView
      monthLabel={monthLabel}
      planBreakdown={planBreakdown}
      mrrTotal={mrrTotal}
      aiCostTotal={aiCostTotal}
      marginTotal={marginTotal}
      messagesToday={todayRes.count ?? 0}
      messagesMonth={monthRes.count ?? 0}
      alerts={alerts}
      rows={rows}
      usageByOrg={usageByOrg}
      loadError={loadError}
    />
  );
}
