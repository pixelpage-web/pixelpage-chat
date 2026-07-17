"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Bot,
  CreditCard,
  Eye,
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
  type LucideIcon,
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
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { WelcomeModal } from "@/components/onboarding/welcome-modal";
import { NAV_PERMISSION_MAP } from "@/lib/permissions";
import type { Role, SubscriptionStatus, SystemNotificationRow, TeamMemberPermissionsRow } from "@/types/database";

export interface ShellData {
  userId: string;
  userName: string;
  userEmail: string;
  role: Role;
  orgId: string | null;
  orgName: string;
  /** logo customizada da org (white-label); null = usa a logo padrão da plataforma */
  orgLogoUrl: string | null;
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
  /** Fluxos (builder visual) é recurso Pro — false esconde o nav e a rota redireciona */
  canAccessFlows: boolean;
  subscription: {
    status: SubscriptionStatus;
    trialEndsAt: string | null;
    planName: string;
  } | null;
}

/**
 * Badge de não lidas do nav — ponte entre o AppShell (dono do estado) e as
 * páginas internas (ex.: inbox), que podem atualizar o badge otimisticamente
 * sem depender do round trip do Realtime.
 *
 * Semântica: o badge conta CONVERSAS abertas com unread_count > 0 (não o total
 * de mensagens). Abrir uma conversa não lida deve decrementar em 1.
 */
export interface UnreadCountContextValue {
  unreadCount: number;
  /** Decrementa o badge otimisticamente (padrão: 1 conversa). */
  decrementUnread: (by?: number) => void;
  /** Re-busca a contagem no servidor (fallback/ressincronização). */
  refetchUnread: () => void;
}

export const UnreadCountContext = createContext<UnreadCountContextValue>({
  unreadCount: 0,
  decrementUnread: () => undefined,
  refetchUnread: () => undefined,
});

export function useUnreadCount() {
  return useContext(UnreadCountContext);
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
      <span className="flex items-center gap-1.5">
        <Eye className="h-3.5 w-3.5" aria-hidden />
        {t("Modo suporte — vendo como")} <strong>{orgName}</strong>
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

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  ownerOnly?: boolean;
  proOnly?: boolean;
}
interface NavGroup {
  label: string | null;
  items: NavItem[];
}

/**
 * Itens agrupados com separadores rotulados (item F do redesign). O nav
 * nunca teve grupos antes — divisão abaixo é uma escolha razoável por
 * função, não algo pedido explicitamente item a item; ajustável se não
 * for o agrupamento esperado.
 */
const navGroups: NavGroup[] = [
  {
    label: null,
    items: [
      { href: "/app/inbox", label: "Inbox", icon: Inbox },
      { href: "/app/contacts", label: "Contatos", icon: Users },
      { href: "/app/campaigns", label: "Campanhas", icon: Megaphone },
      { href: "/app/agent", label: "Agente IA", icon: Bot },
      { href: "/app/flows", label: "Fluxos", icon: GitBranch, proOnly: true },
      { href: "/app/automations", label: "Automações", icon: Zap },
    ],
  },
  {
    label: "Canais",
    items: [
      { href: "/app/connections", label: "Conexões", icon: Smartphone },
      { href: "/app/integrations", label: "Integrações", icon: Plug2 },
    ],
  },
  {
    label: "Gestão",
    items: [
      { href: "/app/reports", label: "Relatórios", icon: BarChart3 },
      { href: "/app/billing", label: "Assinatura", icon: CreditCard },
      { href: "/app/indicacoes", label: "Indicações", icon: Gift },
    ],
  },
  {
    label: "Suporte",
    items: [
      { href: "/app/help", label: "Central de Ajuda", icon: LifeBuoy },
    ],
  },
  {
    label: "Conta",
    items: [
      { href: "/app/equipe", label: "Equipe", icon: UserCog, ownerOnly: true },
      { href: "/app/settings", label: "Configurações", icon: Settings },
    ],
  },
];

const navItems: NavItem[] = navGroups.flatMap((g) => g.items);

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
        <span className="font-semibold text-txt">
          {daysLeft === 0
            ? t("último dia")
            : `${daysLeft} ${daysLeft === 1 ? t("dia restante") : t("dias restantes")}`}
        </span>{" "}
        ·{" "}
        <Link href="/app/billing" className="text-txt underline">
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
  // e otimisticamente via UnreadCountContext (ex.: inbox abre uma conversa).
  const [unreadCount, setUnreadCount] = useState(data.unreadInboxCount);

  // Ressincroniza quando o servidor re-renderiza o layout (router.refresh()):
  // o useState só semeia no primeiro mount e o shell nunca remonta em navegação.
  useEffect(() => {
    setUnreadCount(data.unreadInboxCount);
  }, [data.unreadInboxCount]);

  const refetchUnread = useCallback(() => {
    fetch("/api/inbox/unread-count")
      .then((r) => r.json())
      .then((json: { count?: number }) => {
        if (typeof json.count === "number") setUnreadCount(json.count);
      })
      .catch(() => undefined);
  }, []);

  const decrementUnread = useCallback((by: number = 1) => {
    setUnreadCount((prev) => Math.max(0, prev - by));
  }, []);

  useEffect(() => {
    if (!data.orgId) return;

    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const subscribeChannel = () => {
      if (disposed) return;
      const ch = supabase.channel(`inbox-unread-${data.orgId}`).on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `org_id=eq.${data.orgId}`,
        },
        () => {
          // Re-busca contagem leve ao detectar qualquer mudança
          refetchUnread();
        }
      );
      channel = ch;
      ch.subscribe((status) => {
        // Ignora callbacks de canais já descartados (evita loop de retry)
        if (disposed || channel !== ch) return;
        // Canal caiu (rede instável, app em background no mobile) — sem isso
        // o badge ficaria congelado até um reload completo.
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          console.warn(`[inbox-unread] canal realtime caiu (${status}), reagendando`);
          // Fallback imediato: garante contagem atual mesmo sem realtime
          refetchUnread();
          if (retryTimer) clearTimeout(retryTimer);
          retryTimer = setTimeout(() => {
            if (disposed) return;
            const old = channel;
            channel = null;
            if (old) void supabase.removeChannel(old);
            subscribeChannel();
          }, 5000);
        }
      });
    };

    subscribeChannel();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [data.orgId, refetchUnread]);

  const isOwnerOrAdmin = data.role === "owner" || data.role === "admin" || data.role === "superadmin";

  // Para members com permissões granulares, filtra o nav; owner/admin vêem tudo menos equipe
  function isItemVisible(item: (typeof navItems)[number]) {
    if ("ownerOnly" in item && item.ownerOnly) return isOwnerOrAdmin;
    if ("proOnly" in item && item.proOnly && !data.canAccessFlows) return false;
    if (!data.teamPermissions) return true; // acesso total
    const permKey = NAV_PERMISSION_MAP[item.href];
    if (!permKey) return true; // docs, ajuda — sempre visível
    return data.teamPermissions[permKey as keyof TeamMemberPermissionsRow] === true;
  }
  const visibleNavItems = navItems.filter(isItemVisible);
  const visibleNavGroups = navGroups
    .map((g) => ({ ...g, items: g.items.filter(isItemVisible) }))
    .filter((g) => g.items.length > 0);

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
    <UnreadCountContext.Provider value={{ unreadCount, decrementUnread, refetchUnread }}>
    <div className="flex h-dvh flex-col">
      {/* Busca global — Cmd+K */}
      {data.orgId && <GlobalSearch orgId={data.orgId} />}
      {data.impersonating && <ImpersonationBanner orgName={data.orgName} />}
      {/* Notificações globais do admin (manutenção, avisos, novidades) */}
      <SystemNotifications initial={data.notifications} orgId={data.orgId} />
      <TrialBanner data={data} />
      <StatusBanners data={data} />
      <div className="flex min-h-0 flex-1">
        {/* Sidebar com ícones + labels — desktop. Migrada pros tokens novos
            (theme-x) desde o passo 1 do redesign — é a única parte do app
            que já responde ao ThemeToggle; o resto continua nos tokens
            antigos (ink/surface/lime) até os próximos passos.
            Item ativo: contraste neutro (theme-surface-2/theme-text), sem
            verde e sem borda colorida — grupos com separador rotulado. */}
        <aside className="hidden w-52 shrink-0 flex-col border-r border-theme-border bg-theme-bg py-4 md:flex">
          <div className="mb-5 flex items-center justify-between px-4">
            <Link href="/app/inbox" aria-label={t("Início")}>
              <Logo orgLogoUrl={data.orgLogoUrl} orgName={data.orgName} />
            </Link>
            <ThemeToggle />
          </div>
          <nav className="flex-1 space-y-3 overflow-y-auto px-2">
            {visibleNavGroups.map((group, gi) => (
              <div key={group.label ?? `group-${gi}`} className="space-y-0.5">
                {group.label && (
                  <p className="label-uppercase px-3 pb-1 pt-2 text-theme-text-subtle">
                    {t(group.label)}
                  </p>
                )}
                {group.items.map((item) => {
                  const active = pathname.startsWith(item.href);
                  const isInbox = item.href === "/app/inbox";
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "focus-ring flex items-center gap-2.5 rounded-lg border-l-[3px] border-transparent px-3 py-2 text-sm transition-colors",
                        active
                          ? "bg-theme-surface-2 font-medium text-theme-text"
                          : "text-theme-text-muted hover:bg-white/[0.03] hover:text-theme-text"
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="flex-1">{t(item.label)}</span>
                      {isInbox && unreadCount > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-theme-text px-1.5 text-[10px] font-bold text-theme-bg">
                          {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="space-y-0.5 px-2 pt-2">
            {/* Notificações in-app */}
            {data.orgId && (
              <div className="flex items-center justify-between rounded-lg px-3 py-2">
                <span className="text-xs text-theme-text-muted">{t("Notificações")}</span>
                <InboxNotifications userId={data.userId} orgId={data.orgId} />
              </div>
            )}
            {(data.role === "admin" || data.role === "superadmin") && (
              <Link
                href="/admin"
                className="focus-ring flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-amber transition-colors hover:bg-white/5"
              >
                <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
                {t("Painel admin")}
              </Link>
            )}
            <button
              onClick={handleLogout}
              title={data.userEmail}
              className="focus-ring flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-theme-text-muted transition-colors hover:bg-white/5 hover:text-danger"
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

      {/* Navegação por abas — mobile. Mantida como tab bar (não virou rail
          vertical só-ícones): numa tela estreita isso é melhor UX que a
          sidebar colapsada — só as cores migraram pro tema novo. */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-theme-border bg-theme-bg md:hidden">
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
                active ? "text-theme-text" : "text-theme-text-muted"
              )}
            >
              <span className="relative">
                <item.icon className="h-5 w-5" aria-hidden />
                {isInbox && unreadCount > 0 && (
                  <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-theme-text px-1 text-[9px] font-bold text-theme-bg">
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
            pathname.startsWith("/app/settings") ? "text-theme-text" : "text-theme-text-muted"
          )}
        >
          <Settings className="h-5 w-5" aria-hidden />
          {t("Ajustes")}
        </Link>
      </nav>

      {/* Botão de suporte flutuante — presente em todas as páginas */}
      <SupportButton />

      {/* Modal de boas-vindas — só na 1ª entrada autenticada de cada usuário */}
      <WelcomeModal userId={data.userId} orgName={data.orgName} />
    </div>
    </UnreadCountContext.Provider>
  );
}
