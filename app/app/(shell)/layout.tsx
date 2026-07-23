import { redirect } from "next/navigation";
import { after } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processDueJobs, shouldCheckDueJobs } from "@/lib/scheduled-jobs";
import { hasFeatureAccess } from "@/lib/access";
import { type PermissionDefaults } from "@/lib/permissions";
import { getOrgSubscriptionSummary } from "@/lib/billing";
import { AppShell, type ShellData } from "@/components/app-shell";

// Sessão e assinatura mudam a cada request — sem cache estático
export const dynamic = "force-dynamic";

export default async function ShellLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSessionProfile();
  if (!session) redirect("/login");

  // Sem organização → onboarding (cria org + trial)
  if (!session.profile?.org_id) redirect("/app/onboarding");

  const supabase = await createServerSupabase();
  const orgId = session.profile.org_id;

  // Segundo gatilho de ponte pro cron 1x/dia (ver lib/scheduled-jobs.ts): cobre
  // o caso "WhatsApp quieto, mas atendente com o painel aberto" — roda em
  // qualquer carregamento de página autenticada, rate-limited por org. Via
  // after() para não adicionar latência ao render (mesmo padrão dos webhooks).
  if (shouldCheckDueJobs(orgId)) {
    after(async () => {
      try {
        await processDueJobs(createAdminClient(), { orgId, limit: 5 });
      } catch (err) {
        console.error("[shell-layout] falha ao processar scheduled_jobs pendentes (bridge):", err);
      }
    });
  }

  // Período atual (início do mês) para o contador de mensagens IA
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);

  const [
    { data: org },
    subscription,
    { count: downCount },
    { data: usage },
    { data: notifications },
    { count: unreadConvCount },
  ] = await Promise.all([
    supabase.from("organizations").select("name, suspended, logo_url").eq("id", orgId).maybeSingle(),
    // subscriptions foi restrita a owner/admin (0045) — resumo seguro via RPC
    // (sem IDs de billing), chamável por qualquer membro da org. cache() do
    // React: connections/page.tsx chama esse mesmo helper — sem duplicar a
    // ida à rede pro mesmo org_id no mesmo request (ver lib/billing.ts).
    getOrgSubscriptionSummary(orgId),
    // Conexões QR Code que caíram (banner de reconexão)
    supabase
      .from("whatsapp_connections")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("connection_type", "qr_code")
      .eq("status", "disconnected"),
    supabase
      .from("usage_counters")
      .select("ai_messages_used")
      .eq("org_id", orgId)
      .eq("period_start", monthStart)
      .maybeSingle(),
    // Notificações globais ativas destinadas a este cliente (RLS já filtra)
    supabase
      .from("system_notifications")
      .select("*")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(10),
    // Conversas abertas com mensagens não lidas (badge no nav)
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "open")
      .eq("archived", false)
      .gt("unread_count", 0),
  ]);

  let planName = "—";
  let aiLimit = 0;
  if (subscription?.plan_id) {
    const { data: plan } = await supabase
      .from("plans")
      .select("name, ai_messages_limit")
      .eq("id", subscription.plan_id)
      .maybeSingle();
    planName = plan?.name ?? "—";
    aiLimit = plan?.ai_messages_limit ?? 0;
  }

  // Fluxos (builder visual) é recurso Pro — mesmo padrão de gate usado em
  // BYOK/Webhook/Units. Super Admin sempre enxerga (hasFeatureAccess).
  const isBasicPlan = planName === "Free" || planName === "Starter";
  const flowsAccess = hasFeatureAccess({
    userEmail: session.user.email,
    hasNormalAccess: !isBasicPlan,
    requiredPlan: "Pro",
  });

  // Permissões granulares (0046): jsonb em profiles.permissions, gravado no
  // convite (ROLE_DEFAULTS[roleTemplate] — ver app/api/team/invite/route.ts).
  // null = sem granularidade definida (owner/admin/superadmin, ou membro
  // legado convidado antes da Fase 2) = acesso total, mesmo fallback de
  // sempre em components/app-shell.tsx.
  const teamPermissions = (session.profile.permissions as PermissionDefaults | null) ?? null;

  const data: ShellData = {
    userId: session.user.id,
    userName: session.profile.name,
    userEmail: session.user.email ?? "",
    role: session.profile.role,
    orgId,
    orgName: org?.name ?? "",
    orgLogoUrl: org?.logo_url ?? null,
    orgSuspended: org?.suspended ?? false,
    impersonating: session.impersonating,
    whatsappDown: (downCount ?? 0) > 0,
    aiUsage: { used: usage?.ai_messages_used ?? 0, limit: aiLimit },
    notifications: notifications ?? [],
    teamPermissions,
    unreadInboxCount: unreadConvCount ?? 0,
    canAccessFlows: flowsAccess.access,
    subscription: subscription
      ? {
          status: subscription.status,
          trialEndsAt: subscription.trial_ends_at,
          planName,
        }
      : null,
  };

  return <AppShell data={data}>{children}</AppShell>;
}
