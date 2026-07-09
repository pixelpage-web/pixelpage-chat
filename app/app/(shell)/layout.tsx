import { redirect } from "next/navigation";
import { after } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processDueJobs, shouldCheckDueJobs } from "@/lib/scheduled-jobs";
import { AppShell, type ShellData } from "@/components/app-shell";
import type { TeamMemberPermissionsRow } from "@/types/database";

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
    { data: subscription },
    { count: downCount },
    { data: usage },
    { data: notifications },
    { count: unreadConvCount },
  ] = await Promise.all([
    supabase.from("organizations").select("name, suspended").eq("id", orgId).maybeSingle(),
    supabase
      .from("subscriptions")
      .select("status, trial_ends_at, plan_id")
      .eq("org_id", orgId)
      .maybeSingle(),
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

  // Permissões granulares para membros da equipe (agent/manager)
  // owner e admin têm acesso total — não buscar
  let teamPermissions: TeamMemberPermissionsRow | null = null;
  const role = session.profile.role;
  if (role === "agent" || role === "manager") {
    const adminClient = createAdminClient();
    const { data: tm } = await adminClient
      .from("team_members")
      .select("team_member_permissions(*)")
      .eq("org_id", orgId)
      .eq("user_id", session.user.id)
      .eq("status", "active")
      .maybeSingle();
    const permsArr = tm?.team_member_permissions;
    // supabase-js retorna array quando usando select aninhado 1:1 via FK
    teamPermissions = (Array.isArray(permsArr) ? permsArr[0] : permsArr) as TeamMemberPermissionsRow | null ?? null;
  }

  const data: ShellData = {
    userId: session.user.id,
    userName: session.profile.name,
    userEmail: session.user.email ?? "",
    role: session.profile.role,
    orgId,
    orgName: org?.name ?? "",
    orgSuspended: org?.suspended ?? false,
    impersonating: session.impersonating,
    whatsappDown: (downCount ?? 0) > 0,
    aiUsage: { used: usage?.ai_messages_used ?? 0, limit: aiLimit },
    notifications: notifications ?? [],
    teamPermissions,
    unreadInboxCount: unreadConvCount ?? 0,
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
