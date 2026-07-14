"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Info, Sparkles, Wrench, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { NotificationType, SystemNotificationRow } from "@/types/database";

/**
 * Toasts de notificações do sistema (admin → clientes), empilhados no canto
 * inferior direito. Tipos: manutenção (vermelho), alerta (âmbar), info
 * (azul), novidade (verde). Notificações dispensáveis podem ser fechadas —
 * o estado fica em sessionStorage (NUNCA localStorage): reaparecem a cada
 * F5 ou reabertura do navegador, só somem enquanto durar a aba/sessão atual.
 * Manutenção NÃO pode ser fechada. Atualiza ao vivo via Supabase Realtime.
 */

const DISMISS_KEY = "ppc_sysnotif_dismissed";

const typeMeta: Record<
  NotificationType,
  { icon: typeof Info; wrap: string; accent: string }
> = {
  maintenance: {
    icon: Wrench,
    wrap: "border-danger/40 bg-danger-soft text-danger",
    accent: "text-danger",
  },
  alert: {
    icon: AlertTriangle,
    wrap: "border-amber/40 bg-amber-soft text-amber",
    accent: "text-amber",
  },
  info: {
    icon: Info,
    wrap: "border-info/40 bg-info-soft text-info",
    accent: "text-info",
  },
  feature: {
    icon: Sparkles,
    wrap: "border-ok/40 bg-ok-soft text-ok",
    accent: "text-ok",
  },
};

function readDismissed(): Set<string> {
  try {
    const raw = window.sessionStorage.getItem(DISMISS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function SystemNotifications({
  initial,
  orgId,
}: {
  initial: SystemNotificationRow[];
  orgId: string | null;
}) {
  const [items, setItems] = useState<SystemNotificationRow[]>(initial);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Lê o estado de dispensadas só no cliente (evita mismatch de hidratação)
  useEffect(() => {
    setDismissed(readDismissed());
  }, []);

  // Realtime: novas notificações / desativações chegam sem reload
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("system_notifications")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "system_notifications" },
        (payload) => {
          const row = payload.new as SystemNotificationRow | undefined;
          if (payload.eventType === "DELETE") {
            const old = payload.old as { id: string };
            setItems((prev) => prev.filter((n) => n.id !== old.id));
            return;
          }
          if (!row) return;
          const visible =
            row.active &&
            (row.target === "all" || row.target === orgId) &&
            (!row.expires_at || new Date(row.expires_at) > new Date()) &&
            (!row.starts_at || new Date(row.starts_at) <= new Date());
          setItems((prev) => {
            const rest = prev.filter((n) => n.id !== row.id);
            return visible ? [row, ...rest] : rest;
          });
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orgId]);

  function dismiss(id: string) {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...next]));
    } catch {
      /* sessionStorage indisponível — ignora */
    }
  }

  const visible = useMemo(
    () =>
      items.filter(
        (n) =>
          // manutenção sempre aparece; demais somem se o cliente já dispensou (nesta sessão)
          n.type === "maintenance" || !dismissed.has(n.id)
      ),
    [items, dismissed]
  );

  if (visible.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[70] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-4 sm:w-full sm:max-w-sm sm:items-end">
      {visible.map((n) => {
        const meta = typeMeta[n.type] ?? typeMeta.info;
        const canDismiss = n.dismissible && n.type !== "maintenance";
        return (
          <div
            key={n.id}
            className={cn(
              "animate-toast-in pointer-events-auto flex w-full items-start gap-3 rounded-card border p-3.5 text-xs shadow-pop backdrop-blur-sm",
              meta.wrap
            )}
          >
            <meta.icon className={cn("mt-0.5 h-4 w-4 shrink-0", meta.accent)} aria-hidden />
            <div className="min-w-0 flex-1">
              <span className="font-semibold">{n.title}</span>{" "}
              <span className="text-txt-mut">{n.message}</span>
            </div>
            {canDismiss && (
              <button
                onClick={() => dismiss(n.id)}
                className="focus-ring shrink-0 rounded p-0.5 opacity-70 transition-opacity hover:opacity-100"
                aria-label="Fechar aviso"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
