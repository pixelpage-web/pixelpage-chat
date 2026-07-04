"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  Building2,
  CalendarClock,
  FileText,
  Flag,
  Gift,
  LayoutDashboard,
  LifeBuoy,
  Lightbulb,
  Megaphone,
  ScrollText,
  Settings2,
  ShieldCheck,
  Sparkles,
  Tags,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";

const navSections = [
  {
    label: "PRINCIPAL",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/admin/organizations", label: "Clientes", icon: Building2, exact: false },
      { href: "/admin/trials", label: "Trials", icon: CalendarClock, exact: false },
      { href: "/admin/feature-flags", label: "Feature Flags", icon: Flag, exact: false },
      { href: "/admin/plans", label: "Planos", icon: Tags, exact: false },
    ],
  },
  {
    label: "OPERAÇÕES",
    items: [
      { href: "/admin/notifications", label: "Notificações", icon: Megaphone, exact: false },
      { href: "/admin/referrals", label: "Indicações", icon: Gift, exact: false },
      { href: "/admin/support", label: "Suporte", icon: LifeBuoy, exact: false },
      { href: "/admin/api-oficial", label: "API Oficial", icon: ShieldCheck, exact: false },
      { href: "/admin/n8n", label: "n8n", icon: Workflow, exact: false },
      { href: "/admin/tips", label: "Dicas", icon: Sparkles, exact: false },
      { href: "/admin/templates", label: "Templates", icon: FileText, exact: false },
      { href: "/admin/suggestions", label: "Sugestões", icon: Lightbulb, exact: false },
    ],
  },
  {
    label: "SISTEMA",
    items: [
      { href: "/admin/settings", label: "Integrações", icon: Settings2, exact: false },
      { href: "/admin/logs", label: "Logs", icon: ScrollText, exact: false },
    ],
  },
];

const allItems = navSections.flatMap((s) => s.items);

export function AdminShell({
  userEmail,
  children,
}: {
  userEmail: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-dvh flex-col bg-panel">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-panel-border bg-panel-surface px-5 py-2.5">
        <div className="flex items-center gap-3">
          {/* Badge ADMIN com live indicator */}
          <div className="flex items-center gap-2 rounded-md bg-forest px-2.5 py-1">
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-forest-dim opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-black/40" />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-black">
              ADMIN
            </span>
          </div>
          <span className="hidden text-xs text-[#444] sm:inline">{userEmail}</span>
        </div>

        <Link
          href="/app"
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-[#555] transition-colors hover:bg-panel-card hover:text-[#CCC]"
        >
          <ArrowLeftRight className="h-3 w-3" aria-hidden />
          Voltar ao app
        </Link>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar desktop */}
        <aside className="hidden w-56 shrink-0 flex-col border-r border-panel-border bg-panel-surface md:flex">
          <div className="px-5 py-5">
            <Logo />
          </div>

          <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-6">
            {navSections.map((section) => (
              <div key={section.label}>
                <p className="mb-1.5 px-3 text-[9px] font-bold uppercase tracking-[0.22em] text-[#333]">
                  {section.label}
                </p>
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const active = item.exact
                      ? pathname === item.href
                      : pathname.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all duration-150",
                          active
                            ? "bg-forest/10 font-medium text-forest"
                            : "text-[#555] hover:bg-panel-card hover:text-[#BBB]"
                        )}
                      >
                        {active && (
                          <span
                            className="absolute left-0 top-1/2 h-[18px] w-[2.5px] -translate-y-1/2 rounded-r-full bg-forest"
                            aria-hidden
                          />
                        )}
                        <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Footer da sidebar */}
          <div className="border-t border-panel-border px-4 py-3">
            <p className="text-[9px] uppercase tracking-widest text-[#2E2E2E]">
              PixelPage · Super Admin
            </p>
          </div>
        </aside>

        {/* Conteúdo principal */}
        <main className="min-w-0 flex-1 overflow-y-auto pb-16 md:pb-0">
          {children}
        </main>
      </div>

      {/* Mobile bottom tabs */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex overflow-x-auto border-t border-panel-border bg-panel-surface md:hidden">
        {allItems.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-w-[4.5rem] shrink-0 flex-1 flex-col items-center gap-0.5 py-2 text-[10px] transition-colors",
                active ? "text-forest" : "text-[#444]"
              )}
            >
              <item.icon className="h-5 w-5" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
