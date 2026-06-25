"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  Building2,
  FileText,
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

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/organizations", label: "Clientes", icon: Building2, exact: false },
  { href: "/admin/plans", label: "Planos", icon: Tags, exact: false },
  { href: "/admin/notifications", label: "Notificações", icon: Megaphone, exact: false },
  { href: "/admin/support", label: "Suporte", icon: LifeBuoy, exact: false },
  { href: "/admin/api-oficial", label: "API Oficial", icon: ShieldCheck, exact: false },
  { href: "/admin/n8n", label: "n8n", icon: Workflow, exact: false },
  { href: "/admin/tips", label: "Dicas", icon: Sparkles, exact: false },
  { href: "/admin/templates", label: "Templates", icon: FileText, exact: false },
  { href: "/admin/suggestions", label: "Sugestões", icon: Lightbulb, exact: false },
  { href: "/admin/settings", label: "Integrações", icon: Settings2, exact: false },
  { href: "/admin/logs", label: "Logs", icon: ScrollText, exact: false },
];

export function AdminShell({
  userEmail,
  children,
}: {
  userEmail: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-dvh flex-col">
      <div className="flex items-center justify-between border-b border-amber/30 bg-amber/10 px-4 py-1.5 text-xs text-amber">
        <span className="font-medium">Painel administrativo · {userEmail}</span>
        <Link
          href="/app"
          className="focus-ring flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-amber/20"
        >
          <ArrowLeftRight className="h-3 w-3" aria-hidden />
          Ir para o app
        </Link>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar desktop */}
        <aside className="hidden w-52 shrink-0 flex-col border-r border-line bg-surface md:flex">
          <div className="px-4 py-4">
            <Logo />
          </div>
          <nav className="flex-1 space-y-0.5 px-2">
            {navItems.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);
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
                  <item.icon className="h-4 w-4" aria-hidden />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto pb-16 md:pb-0">{children}</main>
      </div>

      {/* Tabs mobile — roláveis na horizontal (muitas seções) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex overflow-x-auto border-t border-line bg-surface md:hidden">
        {navItems.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-w-[4.5rem] shrink-0 flex-1 flex-col items-center gap-0.5 py-2 text-[10px]",
                active ? "text-lime" : "text-txt-dim"
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
