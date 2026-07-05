"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  Bot,
  CreditCard,
  Gift,
  GitBranch,
  Inbox,
  LifeBuoy,
  LogOut,
  Megaphone,
  Plug2,
  Settings,
  ShieldCheck,
  Smartphone,
  UserCog,
  Users,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { differenceInCalendarDays } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { SystemNotifications } from "@/components/system-notifications";
import { SupportButton } from "@/components/support-button";
import { InboxNotifications } from "@/components/inbox-notifications";
import { GlobalSearch } from "@/components/global-search";
import { NAV_PERMISSION_MAP } from "@/lib/permissions";
import type { Role, SubscriptionStatus, SystemNotificationRow, TeamMemberPermissionsRow } from "@/types/database";

export interface ShellData {
  userId: string;
  userName: string;
  userEmail: string;
  role: Role;
  orgId: string | null;
  orgName: string;
  orgSuspended: boolean;
  impersonating: boolean;
  /** alguma conexão QR Code caiu (status disconnected) */
  whatsappDown: boolean;
  /** uso de mensagens IA do mês vs limite do plano (limit 0 = ilimitado) */
  aiUsage: { used: number; limit: number } | null;
  /** notificações globais ativas (admin → clientes) */
  notifications: SystemNotificationRow[];
  /** permissões granulares para membros da equipe; null = acesso total (owner/admin) */
  teamPermissions: TeamMemberPermissionsRow | null;
  /** conversas abertas com mensagens não lidas (badge no nav) */
  unreadInboxCount: number;
  subscription: {
    status: SubscriptionStatus;
    trialEndsAt: string | null;
    planName: string;
  } | null;
}

/** Banner do modo suporte: admin vendo o painel como uma organização. */
function ImpersonationBanner({ orgName }: { orgName: string }) {
  const t = useT();
  async function handleExit() {
    try {
      await fetch("/api/admin/impersonate", { method: "DELETE" });
      window.location.href = "/admin/organizations";
    } catch {
      toast.error(t("Não foi possível sair do modo suporte."));
    }
  }
  return (
    <div className="flex items-center justify-center gap-3 border-b border-amber/40 bg-amber/15 px-4 py-1.5 text-xs text-amber">
      <span>
        👁 {t("Modo suporte — vendo como")} <strong>{orgName}</strong>
      </span>
      <button
        onClick={() => void handleExit()}
        className="focus-ring rounded border border-amber/40 px-2 py-0.5 font-medium hover:bg-amber/20"
      >
        {t("Sair")}
      </button>
    </div>
  );
}

const navItems = [
  { href: "/app/inbox", label: "Inbox", icon: Inbox },
  { href: "/app/contacts", label: "Contatos", icon: Users },
  { href: "/app/campaigns", label: "Campanhas", icon: Megaphone },
  { href: "/app/agent", label: "Agente IA", icon: Bot },
  { href: "/app/flows", label: "Fluxos", icon: GitBranch },
  { href: "/app/automations", label: "Automações", icon: Zap },
  { href: "/app/connections", label: "Conexões", icon: Smartphone },
  { href: "/app/integrations", label: "Integrações", icon: Plug2 },
  { href: "/app/reports", label: "Relatórios", icon: BarChart3 },
  { href: "/app/billing", label: "Assinatura", icon: CreditCard },
  { href: "/app/indicacoes", label: "Indicações", icon: Gift },
  { href: "/app/docs", label: "Documentação", icon: BookOpen },
  { href: "/app/help", label: "Central de Ajuda", icon: LifeBuoy },
  { href: "/app/settings", label: "Configurações", icon: Settings },
  { href: "/app/equipe", label: "Equipe", icon: UserCog, ownerOnly: true },
] as const;

function TrialBanner({ data }: { data: ShellData }) {
  const t = useT();
  const sub = data.subscription;
  if (data.orgSuspended) {
    return (
      <div className="border-b border-danger/30 bg-danger-soft px-4 py-2 text-center text-xs text-danger">
        {t("Organização suspensa — entre em contato com o suporte da PixelPage Chat.")}
      </div>
    );
  }
  if (!sub) return null;

  if (sub.status === "trial" && sub.trialEndsAt) {
    const daysLeft = differenceInCalendarDays(new Date(sub.trialEndsAt), new Date());
    if (daysLeft < 0) {
      return (
        <div className="border-b border-amber/30 bg-amber-soft px-4 py-2 text-center text-xs text-amber">
          {t("Seu período de teste terminou — o inbox está somente leitura.")}{" "}
          <Link href="/app/billing" className="font-semibold underline">
            {t("Escolher um plano")}
          </Link>
        </div>
      );
    }
    return (
      <div className="border-b border-line bg-surface px-4 py-2 text-center text-xs text-txt-mut">
        {t("Teste grátis:")}{" "}
        <span className="font-semibold text-lime">
          {daysLeft === 0
            ? t("último dia")
            : `${daysLeft} ${daysLeft === 1 ? t("dia restante") : t("dias restantes")}`}
        </span>{" "}
        ·{" "}
        <Link href="/app/billing" className="text-lime underline">
          {t("fazer upgrade")}
        </Link>
      </div>
    );
  }

  if (sub.status === "past_due" || sub.status === "canceled") {
    return (
      <div className="border-b border-amber/30 bg-amber-soft px-4 py-2 text-center text-xs text-amber">
        {sub.status === "past_due"
          ? t("Pagamento pendente — regularize para manter o bot ativo.")
          : t("Assinatura cancelada — o inbox está somente leitura.")}{" "}
        <Link href="/app/billing" className="font-semibold underline">
          {t("Ver assinatura")}
        </Link>
      </div>
    );
  }

  return null;
}

/** Banners de status operacional: conexão caída e limite de mensagens IA. */
function StatusBanners({ data }: { data: ShellData }) {
  const t = useT();
  const sub = data.subscription;

  // Trial expirando em ≤2 dias (laranja) — separado do TrialBanner informativo
  let trialEnding = false;
  if (sub?.status === "trial" && sub.trialEndsAt) {
    const daysLeft = differenceInCalendarDays(new Date(sub.trialEndsAt), new Date());
    trialEnding = daysLeft >= 0 && daysLeft <= 2;
  }

  const aiLimitReached =
    !!data.aiUsage && data.aiUsage.limit > 0 && data.aiUsage.used >= data.aiUsage.limit;

  return (
    <>
      {/* Conexão WhatsApp caiu */}
      {data.whatsappDown && (
        <div className="flex items-center justify-center gap-2 border-b border-amber/30 bg-amber-soft px-4 py-2 text-center text-xs text-amber">
          <Smartphone className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {t("Sua conexão WhatsApp caiu.")}{" "}
          <Link href="/app/connections" className="font-semibold underline">
            {t("Reconectar agora")}
          </Link>
        </div>
      )}

      {/* Trial expirando em ≤2 dias */}
      {trialEnding && !data.orgSuspended && (
        <div className="border-b border-amber/30 bg-amber-soft px-4 py-2 text-center text-xs text-amber">
          {t("Seu trial está acabando.")}{" "}
          <Link href="/app/billing" className="font-semibold underline">
            {t("Fazer upgrade")}
          </Link>
        </div>
      )}

      {/* Limite de mensagens IA atingido */}
      {aiLimitReached && (
        <div className="border-b border-danger/30 bg-danger-soft px-4 py-2 text-center text-xs text-danger">
          {t("Você atingiu o limite de mensagens de IA do seu plano.")}{" "}
          <Link href="/app/billing" className="font-semibold underline">
            {t("Fazer upgrade")}
          </Link>
        </div>
      )}
    </>
  );
}

export function AppShell({
  data,
  children,
}: {
  data: ShellData;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useT();

  // Badge de não lidas — inicia com valor do servidor, atualiza via realtime
  const [unreadCount, setUnreadCount] = useState(data.unreadInboxCount);

  useEffect(() => {
    if (!data.orgId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`inbox-unread-${data.orgId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `org_id=eq.${data.orgId}`,
        },
        () => {
          // Re-busca contagem leve ao detectar qualquer mudança
          fetch("/api/inbox/unread-count")
            .then((r) => r.json())
            .then((json: { count?: number }) => {
              if (typeof json.count === "number") setUnreadCount(json.count);
            })
            .catch(() => undefined);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [data.orgId]);

  const isOwnerOrAdmin = data.role === "owner" || data.role === "admin" || data.role === "superadmin";

  // Para members com permissões granulares, filtra o nav; owner/admin vêem tudo menos equipe
  const visibleNavItems = navItems.filter((item) => {
    if ("ownerOnly" in item && item.ownerOnly) return isOwnerOrAdmin;
    if (!data.teamPermissions) return true; // acesso total
    const permKey = NAV_PERMISSION_MAP[item.href];
    if (!permKey) return true; // docs, ajuda — sempre visível
    return data.teamPermissions[permKey as keyof TeamMemberPermissionsRow] === true;
  });

  async function handleLogout() {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace("/login");
      router.refresh();
    } catch {
      toast.error(t("Não foi possível sair. Tente novamente."));
    }
  }

  return (
    <div className="flex h-dvh flex-col">
      {/* Busca global — Cmd+K */}
      {data.orgId && <GlobalSearch orgId={data.orgId} />}
      {data.impersonating && <ImpersonationBanner orgName={data.orgName} />}
      {/* Notificações globais do admin (manutenção, avisos, novidades) */}
      <SystemNotifications initial={data.notifications} orgId={data.orgId} />
      <TrialBanner data={data} />
      <StatusBanners data={data} />
      <div className="flex min-h-0 flex-1">
        {/* Sidebar com ícones + labels — desktop */}
        <aside className="hidden w-52 shrink-0 flex-col border-r border-line bg-surface py-4 md:flex">
          <Link href="/app/inbox" aria-label={t("Início")} className="mb-5 px-4">
            <Logo />
          </Link>
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
            {visibleNavItems.map((item) => {
              const active = pathname.startsWith(item.href);
              const isInbox = item.href === "/app/inbox";
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "focus-ring flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-lime-soft font-medium text-lime"
                      : "text-txt-mut hover:bg-surface-hover hover:text-txt"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="flex-1">{t(item.label)}</span>
                  {isInbox && unreadCount > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-lime px-1.5 text-[10px] font-bold text-white">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="space-y-0.5 px-2 pt-2">
            {/* Notificações in-app */}
            {data.orgId && (
              <div className="flex items-center justify-between rounded-lg px-3 py-2">
                <span className="text-xs text-txt-dim">{t("Notificações")}</span>
                <InboxNotifications userId={data.userId} orgId={data.orgId} />
              </div>
            )}
            {(data.role === "admin" || data.role === "superadmin") && (
              <Link
                href="/admin"
                className="focus-ring flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-amber transition-colors hover:bg-surface-hover"
              >
                <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
                {t("Painel admin")}
              </Link>
            )}
            <button
              onClick={handleLogout}
              title={data.userEmail}
              className="focus-ring flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-txt-dim transition-colors hover:bg-surface-hover hover:text-danger"
            >
              <LogOut className="h-4 w-4 shrink-0" aria-hidden />
              {t("Sair")}
            </button>
          </div>
        </aside>

        {/* Conteúdo */}
        <main className="min-w-0 flex-1 overflow-hidden pb-14 md:pb-0">
          {children}
        </main>
      </div>

      {/* Navegação por abas — mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface md:hidden">
        {visibleNavItems.slice(0, 5).map((item) => {
          const active = pathname.startsWith(item.href);
          const isInbox = item.href === "/app/inbox";
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={t(item.label)}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]",
                active ? "text-lime" : "text-txt-dim"
              )}
            >
              <span className="relative">
                <item.icon className="h-5 w-5" aria-hidden />
                {isInbox && unreadCount > 0 && (
                  <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-lime px-1 text-[9px] font-bold text-white">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </span>
              {t(item.label)}
            </Link>
          );
        })}
        <Link
          href="/app/settings"
          aria-label={t("Configurações")}
          className={cn(
            "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]",
            pathname.startsWith("/app/settings") ? "text-lime" : "text-txt-dim"
          )}
        >
          <Settings className="h-5 w-5" aria-hidden />
          {t("Ajustes")}
        </Link>
      </nav>

      {/* Botão de suporte flutuante — presente em todas as páginas */}
      <SupportButton />
    </div>
  );
}
