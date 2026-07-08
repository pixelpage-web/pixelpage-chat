import {
  Bot,
  Building2,
  DollarSign,
  MessageSquare,
  Smartphone,
  User,
  Workflow,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn, formatBRL, formatCompact } from "@/lib/utils";

export const metadata = { title: "Dashboard · Admin" };

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

export default async function AdminDashboardPage() {
  const admin = createAdminClient();
  const monthStart = monthStartIso();

  const [
    { data: orgs },
    { data: subscriptions },
    { data: plans },
    { count: connectedCount },
    { count: humanCount },
    { count: aiCount },
    { count: externalCount },
    { count: inboundCount },
    { data: usageRollup },
    { data: tokenLogs },
  ] = await Promise.all([
    admin.from("organizations").select("id, created_at"),
    admin.from("subscriptions").select("plan_id, status"),
    admin.from("plans").select("id, price_cents, name"),
    admin
      .from("whatsapp_connections")
      .select("id", { count: "exact", head: true })
      .eq("status", "connected"),
    admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("sender_type", "human")
      .gte("created_at", monthStart),
    admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("sender_type", "ai_bot")
      .gte("created_at", monthStart),
    admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("sender_type", "external")
      .gte("created_at", monthStart),
    admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("sender_type", "contact")
      .gte("created_at", monthStart),
    // Custo real de IA (0027): rollup mensal por org — cobre todos os modelos
    // com preço em ai_model_pricing; uso BYOK entra como custo 0 (custo do cliente).
    admin
      .from("org_usage_monthly")
      .select("total_ai_cost_usd")
      .eq("month", monthStart.slice(0, 10)),
    // Tokens do mês (só uso gerenciado — pago pela plataforma) para os sub-boxes.
    admin
      .from("ai_usage_logs")
      .select("input_tokens, output_tokens")
      .eq("is_byok", false)
      .gte("created_at", monthStart)
      .limit(10000),
  ]);

  const todayStart = todayStartIso();
  const tomorrowStart = new Date(
    new Date(todayStart).getTime() + 86400_000
  ).toISOString();

  const [
    { count: todayCount },
    { count: qrDownCount },
    { count: failingWebhooks },
    { count: trialsExpiringToday },
  ] = await Promise.all([
    admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayStart),
    admin
      .from("whatsapp_connections")
      .select("id", { count: "exact", head: true })
      .eq("connection_type", "qr_code")
      .eq("status", "disconnected"),
    admin
      .from("external_webhooks")
      .select("id", { count: "exact", head: true })
      .gte("failures_count", 3),
    admin
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("status", "trial")
      .gte("trial_ends_at", todayStart)
      .lt("trial_ends_at", tomorrowStart),
  ]);

  // MRR
  const planPrices = new Map((plans ?? []).map((p) => [p.id, p.price_cents]));
  const mrrCents = (subscriptions ?? [])
    .filter((s) => s.status === "active")
    .reduce((sum, s) => sum + (planPrices.get(s.plan_id) ?? 0), 0);

  // Custo de IA — soma do rollup org_usage_monthly do mês corrente (mesma
  // fonte do dashboard /admin/financeiro), no lugar do antigo cálculo
  // hardcoded de Haiku sobre audit_logs.
  const costUsd = (usageRollup ?? []).reduce(
    (sum, r) => sum + r.total_ai_cost_usd,
    0
  );
  let inputTokens = 0;
  let outputTokens = 0;
  for (const log of tokenLogs ?? []) {
    inputTokens += log.input_tokens;
    outputTokens += log.output_tokens;
  }

  // Crescimento: últimos 6 meses
  const months: { label: string; count: number }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    const count = (orgs ?? []).filter((o) => {
      const created = new Date(o.created_at);
      return created >= d && created < next;
    }).length;
    months.push({
      label: d.toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" }),
      count,
    });
  }
  const maxMonth = Math.max(...months.map((m) => m.count), 1);

  const trialCount = (subscriptions ?? []).filter((s) => s.status === "trial").length;
  const activeCount = (subscriptions ?? []).filter((s) => s.status === "active").length;

  const botRate =
    (humanCount ?? 0) + (aiCount ?? 0) > 0
      ? Math.round(((aiCount ?? 0) / ((humanCount ?? 0) + (aiCount ?? 0))) * 100)
      : 0;

  const totalMessages =
    (inboundCount ?? 0) + (humanCount ?? 0) + (aiCount ?? 0) + (externalCount ?? 0);

  const stats = [
    {
      label: "Clientes",
      value: String(orgs?.length ?? 0),
      sub: `${activeCount} pagantes · ${trialCount} trials`,
      icon: Building2,
      accent: false,
    },
    {
      label: "MRR",
      value: formatBRL(mrrCents),
      sub: "receita recorrente mensal",
      icon: DollarSign,
      accent: true,
    },
    {
      label: "Mensagens hoje",
      value: formatCompact(todayCount ?? 0),
      sub: `automação: ${botRate}% no mês`,
      icon: MessageSquare,
      accent: false,
    },
    {
      label: "WhatsApp online",
      value: String(connectedCount ?? 0),
      sub: "números conectados",
      icon: Smartphone,
      accent: false,
    },
  ];

  const modeBreakdown = [
    {
      label: "Recebidas",
      count: inboundCount ?? 0,
      icon: MessageSquare,
      barColor: "#2A2A2A",
      textColor: "#555",
    },
    {
      label: "Manual (equipe)",
      count: humanCount ?? 0,
      icon: User,
      barColor: "#3A3A3A",
      textColor: "#777",
    },
    {
      label: "Bot IA",
      count: aiCount ?? 0,
      icon: Bot,
      barColor: "#5DD62C",
      textColor: "#5DD62C",
    },
    {
      label: "Webhook / n8n",
      count: externalCount ?? 0,
      icon: Workflow,
      barColor: "#F0B429",
      textColor: "#F0B429",
    },
  ];

  const alerts = [
    {
      label: "Sessões QR desconectadas",
      count: qrDownCount ?? 0,
      href: "/admin/logs",
    },
    {
      label: "Webhooks de clientes falhando",
      count: failingWebhooks ?? 0,
      href: "/admin/logs",
    },
    {
      label: "Trials expirando hoje",
      count: trialsExpiringToday ?? 0,
      href: "/admin/trials",
    },
  ].filter((a) => a.count > 0);

  return (
    <div className="min-h-full bg-panel">
      <div className="mx-auto max-w-6xl space-y-6 p-6">

        {/* ── Header ─────────────────────────────────── */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#333]">
              PIXELPAGE · SUPER ADMIN
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-[#F8F8F8]">
              Dashboard
            </h1>
          </div>
          <div className="rounded-xl border border-panel-border bg-panel-card px-4 py-2.5 text-right">
            <p className="text-[9px] uppercase tracking-widest text-[#3A3A3A]">Hoje</p>
            <p className="mt-0.5 text-xs font-semibold text-[#666]">
              {new Date().toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>
        </div>

        {/* ── Alertas operacionais ────────────────────── */}
        {alerts.length > 0 && (
          <div className="space-y-2">
            {alerts.map((alert) => (
              <a
                key={alert.label}
                href={alert.href}
                className="flex items-center justify-between rounded-xl border border-[#F59E0B]/20 bg-[#F59E0B]/5 px-4 py-3 text-sm transition-colors hover:border-[#F59E0B]/40"
              >
                <span className="flex items-center gap-2.5 text-[#F59E0B]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#F59E0B]" aria-hidden />
                  {alert.label}
                </span>
                <span className="rounded-md bg-[#F59E0B]/15 px-2 py-0.5 text-xs font-bold tabular-nums text-[#F59E0B]">
                  {alert.count}
                </span>
              </a>
            ))}
          </div>
        )}

        {/* ── KPI cards ──────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className={cn(
                "relative overflow-hidden rounded-xl border p-5 transition-all",
                stat.accent
                  ? "border-forest/25 bg-forest/5"
                  : "border-panel-border bg-panel-card"
              )}
            >
              {stat.accent && (
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      "radial-gradient(ellipse at top right, rgba(93,214,44,0.10) 0%, transparent 65%)",
                  }}
                  aria-hidden
                />
              )}
              <div className="relative">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[11px] text-[#555]">{stat.label}</p>
                  <div
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                      stat.accent ? "bg-forest/15" : "bg-panel-surface"
                    )}
                  >
                    <stat.icon
                      className={cn("h-3.5 w-3.5", stat.accent ? "text-forest" : "text-[#444]")}
                      aria-hidden
                    />
                  </div>
                </div>
                <p
                  className={cn(
                    "mt-2 font-display text-2xl font-bold tabular-nums leading-none",
                    stat.accent ? "text-forest" : "text-[#F8F8F8]"
                  )}
                >
                  {stat.value}
                </p>
                <p className="mt-1.5 text-[10px] text-[#3A3A3A]">{stat.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Charts ─────────────────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-5">

          {/* Crescimento — barra chart 3 cols */}
          <div className="col-span-full rounded-xl border border-panel-border bg-panel-card p-5 lg:col-span-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[#F8F8F8]">Novas organizações</h2>
                <p className="mt-0.5 text-[11px] text-[#444]">cadastros mensais · últimos 6 meses</p>
              </div>
              <span className="rounded-lg border border-forest/20 bg-forest/8 px-2.5 py-1 text-xs font-bold text-forest">
                {orgs?.length ?? 0} total
              </span>
            </div>

            <div className="mt-6 flex h-40 items-end gap-2">
              {months.map((m, i) => {
                const heightPct = Math.max((m.count / maxMonth) * 100, 3);
                return (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                    {m.count > 0 && (
                      <span className="text-[10px] font-semibold tabular-nums text-forest">
                        {m.count}
                      </span>
                    )}
                    <div
                      className="w-full rounded-t-sm transition-all"
                      style={{
                        height: `${heightPct}%`,
                        background:
                          m.count === 0
                            ? "#1E1E1E"
                            : "linear-gradient(to top, #337418 0%, #5DD62C 100%)",
                      }}
                    />
                    <span className="text-[10px] capitalize text-[#3A3A3A]">{m.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mensagens por tipo — 2 cols */}
          <div className="col-span-full rounded-xl border border-panel-border bg-panel-card p-5 lg:col-span-2">
            <h2 className="text-sm font-semibold text-[#F8F8F8]">Mensagens no mês</h2>
            <p className="mt-0.5 text-[11px] text-[#444]">
              {formatCompact(totalMessages)} processadas
            </p>

            <ul className="mt-5 space-y-4">
              {modeBreakdown.map((mode) => {
                const pct =
                  totalMessages > 0 ? (mode.count / totalMessages) * 100 : 0;
                return (
                  <li key={mode.label}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span
                        className="flex items-center gap-1.5 text-xs"
                        style={{ color: mode.textColor }}
                      >
                        <mode.icon className="h-3 w-3" aria-hidden />
                        {mode.label}
                      </span>
                      <span className="text-xs font-semibold tabular-nums text-[#F8F8F8]">
                        {formatCompact(mode.count)}
                      </span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-panel-surface">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: mode.barColor }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* ── Bottom row ─────────────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-3">

          {/* Custo de IA (rollup org_usage_monthly) */}
          <div className="rounded-xl border border-panel-border bg-panel-card p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] text-[#555]">Custo de IA este mês</p>
                <p className="mt-1.5 font-display text-2xl font-bold tabular-nums text-[#F8F8F8]">
                  US$ {costUsd.toFixed(2)}
                </p>
              </div>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-panel-surface">
                <Bot className="h-3.5 w-3.5 text-[#444]" aria-hidden />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-panel-surface px-3 py-2.5">
                <p className="text-[9px] uppercase tracking-widest text-[#333]">Input</p>
                <p className="mt-0.5 text-xs font-semibold tabular-nums text-[#666]">
                  {formatCompact(inputTokens)} tok
                </p>
              </div>
              <div className="rounded-lg bg-panel-surface px-3 py-2.5">
                <p className="text-[9px] uppercase tracking-widest text-[#333]">Output</p>
                <p className="mt-0.5 text-xs font-semibold tabular-nums text-[#666]">
                  {formatCompact(outputTokens)} tok
                </p>
              </div>
            </div>
          </div>

          {/* Taxa de automação */}
          <div className="rounded-xl border border-panel-border bg-panel-card p-5">
            <p className="text-[11px] text-[#555]">Automação do Bot IA</p>
            <div className="mt-2 flex items-end gap-1">
              <p className="font-display text-4xl font-bold tabular-nums text-forest leading-none">
                {botRate}
              </p>
              <p className="mb-1 font-display text-xl font-bold text-forest/50">%</p>
            </div>
            <p className="mt-1 text-[10px] text-[#3A3A3A]">das respostas automáticas no mês</p>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-panel-surface">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${botRate}%`,
                  background: "linear-gradient(to right, #337418, #5DD62C)",
                }}
              />
            </div>
            <div className="mt-2 flex justify-between">
              <span className="text-[9px] text-[#333]">0%</span>
              <span className="text-[9px] text-[#333]">100%</span>
            </div>
          </div>

          {/* Status da plataforma */}
          <div className="rounded-xl border border-panel-border bg-panel-card p-5">
            <p className="text-[11px] text-[#555]">Status da plataforma</p>
            <ul className="mt-4 space-y-0 divide-y divide-panel-border">
              <li className="flex items-center justify-between py-2.5">
                <span className="text-xs text-[#666]">Clientes pagantes</span>
                <span className="font-display text-sm font-bold tabular-nums text-[#F8F8F8]">
                  {activeCount}
                </span>
              </li>
              <li className="flex items-center justify-between py-2.5">
                <span className="text-xs text-[#666]">Trials ativos</span>
                <span className="font-display text-sm font-bold tabular-nums text-forest">
                  {trialCount}
                </span>
              </li>
              <li className="flex items-center justify-between py-2.5">
                <span className="text-xs text-[#666]">WhatsApp conectados</span>
                <span className="font-display text-sm font-bold tabular-nums text-[#F8F8F8]">
                  {connectedCount ?? 0}
                </span>
              </li>
              <li className="flex items-center justify-between py-2.5">
                <span className="text-xs text-[#666]">Total de orgs</span>
                <span className="font-display text-sm font-bold tabular-nums text-[#F8F8F8]">
                  {orgs?.length ?? 0}
                </span>
              </li>
            </ul>
          </div>
        </div>

      </div>
    </div>
  );
}
