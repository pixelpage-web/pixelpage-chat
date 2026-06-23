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
import { formatBRL, formatCompact } from "@/lib/utils";
import { Card, CardTitle } from "@/components/ui/card";
import { HelpCard } from "@/components/ui/help-card";

export const metadata = { title: "Dashboard · Admin" };

/** Preço do claude-haiku-4-5: US$ 1/MTok entrada, US$ 5/MTok saída. */
const HAIKU_INPUT_PER_MTOK = 1;
const HAIKU_OUTPUT_PER_MTOK = 5;

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
    { data: aiLogs },
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
    admin
      .from("audit_logs")
      .select("metadata")
      .in("action", ["ai.reply", "ai.simulate"])
      .gte("created_at", monthStart)
      .limit(5000),
  ]);

  // Alertas operacionais + mensagens de hoje
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

  // MRR = soma dos planos de assinaturas ativas
  const planPrices = new Map((plans ?? []).map((p) => [p.id, p.price_cents]));
  const mrrCents = (subscriptions ?? [])
    .filter((s) => s.status === "active")
    .reduce((sum, s) => sum + (planPrices.get(s.plan_id) ?? 0), 0);

  // Custo estimado de tokens Claude no mês
  let inputTokens = 0;
  let outputTokens = 0;
  for (const log of aiLogs ?? []) {
    const meta = log.metadata as { input_tokens?: number; output_tokens?: number };
    inputTokens += meta.input_tokens ?? 0;
    outputTokens += meta.output_tokens ?? 0;
  }
  const costUsd =
    (inputTokens / 1_000_000) * HAIKU_INPUT_PER_MTOK +
    (outputTokens / 1_000_000) * HAIKU_OUTPUT_PER_MTOK;

  // Crescimento: organizações criadas por mês (últimos 6 meses)
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

  const stats = [
    {
      label: "Organizações",
      value: String(orgs?.length ?? 0),
      sub: `${activeCount} pagantes · ${trialCount} em trial`,
      icon: Building2,
    },
    {
      label: "MRR",
      value: formatBRL(mrrCents),
      sub: "assinaturas ativas",
      icon: DollarSign,
    },
    {
      label: "Mensagens hoje",
      value: formatCompact(todayCount ?? 0),
      sub: `bot responde ${botRate}% (mês)`,
      icon: MessageSquare,
    },
    {
      label: "Conexões WhatsApp",
      value: String(connectedCount ?? 0),
      sub: "números conectados",
      icon: Smartphone,
    },
    {
      label: "Custo Claude (mês)",
      value: `US$ ${costUsd.toFixed(2)}`,
      sub: `${formatCompact(inputTokens)} in · ${formatCompact(outputTokens)} out`,
      icon: Bot,
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
      href: "/admin/organizations",
    },
  ].filter((a) => a.count > 0);

  const totalMessages =
    (inboundCount ?? 0) + (humanCount ?? 0) + (aiCount ?? 0) + (externalCount ?? 0);

  const modeBreakdown = [
    { label: "Recebidas (clientes)", count: inboundCount ?? 0, icon: MessageSquare, color: "text-txt-mut" },
    { label: "Manual (equipe)", count: humanCount ?? 0, icon: User, color: "text-txt" },
    { label: "Bot IA", count: aiCount ?? 0, icon: Bot, color: "text-lime" },
    { label: "Webhook (n8n)", count: externalCount ?? 0, icon: Workflow, color: "text-amber" },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="font-display text-lg font-semibold">Dashboard</h1>
        <p className="mt-0.5 text-sm text-txt-mut">Visão geral da plataforma.</p>
      </header>

      <HelpCard className="-mt-2">
        Acompanhe a saúde da plataforma: clientes ativos, MRR e alertas.
      </HelpCard>

      {/* Alertas operacionais */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <a
              key={alert.label}
              href={alert.href}
              className="focus-ring flex items-center justify-between rounded-lg border border-amber/30 bg-amber-soft px-4 py-2.5 text-sm text-amber transition-colors hover:border-amber/60"
            >
              <span>⚠ {alert.label}</span>
              <span className="font-display font-semibold">{alert.count}</span>
            </a>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat) => (
          <Card key={stat.label} className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-txt-mut">{stat.label}</p>
              <stat.icon className="h-4 w-4 text-txt-dim" aria-hidden />
            </div>
            <p className="mt-2 font-display text-2xl font-semibold">{stat.value}</p>
            <p className="mt-1 text-[11px] text-txt-dim">{stat.sub}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Mensagens do mês por modo */}
        <Card>
          <CardTitle>Mensagens no mês</CardTitle>
          <p className="mt-1 text-xs text-txt-dim">
            {formatCompact(totalMessages)} mensagens processadas
          </p>
          <ul className="mt-4 space-y-3">
            {modeBreakdown.map((mode) => {
              const pct = totalMessages > 0 ? (mode.count / totalMessages) * 100 : 0;
              return (
                <li key={mode.label}>
                  <div className="flex items-center justify-between text-xs">
                    <span className={`flex items-center gap-1.5 ${mode.color}`}>
                      <mode.icon className="h-3.5 w-3.5" aria-hidden />
                      {mode.label}
                    </span>
                    <span className="font-medium">{formatCompact(mode.count)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-raised">
                    <div
                      className="h-full rounded-full bg-lime/70"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        {/* Crescimento */}
        <Card>
          <CardTitle>Novas organizações</CardTitle>
          <p className="mt-1 text-xs text-txt-dim">últimos 6 meses</p>
          <div className="mt-4 flex h-36 items-end gap-2">
            {months.map((m, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] font-medium text-txt-mut">{m.count}</span>
                <div
                  className="w-full rounded-t bg-lime/80 transition-all"
                  style={{
                    height: `${Math.max((m.count / maxMonth) * 100, 3)}%`,
                  }}
                />
                <span className="text-[10px] text-txt-dim">{m.label}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
