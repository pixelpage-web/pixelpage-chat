"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Info, Sparkles, Wrench, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { NotificationType, SystemNotificationRow } from "@/types/database";

/**
 * Toasts de notificações do sistema (admin → clientes), empilhados no canto
 * inferior direito, ACIMA da bolha de suporte (components/support-button.tsx)
 * — nunca sobrepõem. Offset derivado da posição/tamanho reais da bolha:
 *   mobile:  bottom-20 (80px) + h-12 (48px) + 16px de vão = 144px → bottom-36
 *   md+:     bottom-5  (20px) + h-12 (48px) + 16px de vão =  84px → bottom-[5.25rem]
 * Se o tamanho/posição da bolha mudar em support-button.tsx, recalcular aqui.
 *
 * Tipos: manutenção (vermelho, não-dispensável, pulso contínuo na borda),
 * alerta (âmbar), info (azul), novidade (verde). Notificações dispensáveis
 * fecham sozinhas depois de AUTO_DISMISS_MS (barra de progresso no rodapé do
 * card mostra a contagem) ou no clique do X — o estado dispensado fica em
 * sessionStorage (NUNCA localStorage): reaparece a cada F5/nova aba.
 * Atualiza ao vivo via Supabase Realtime.
 */

const DISMISS_KEY = "ppc_sysnotif_dismissed";
const AUTO_DISMISS_MS = 8000; // sincronizado com a animação "shrink-bar" (8s) em tailwind.config.ts
const EXIT_MS = 200;

const typeMeta: Record<
  NotificationType,
  { icon: typeof Info; badge: string; ring: string; bar: string }
> = {
  maintenance: {
    icon: Wrench,
    badge: "bg-danger-soft text-danger",
    ring: "border-danger/35",
    bar: "bg-danger",
  },
  alert: {
    icon: AlertTriangle,
    badge: "bg-amber-soft text-amber",
    ring: "border-amber/35",
    bar: "bg-amber",
  },
  info: {
    icon: Info,
    badge: "bg-info-soft text-info",
    ring: "border-info/35",
    bar: "bg-info",
  },
  feature: {
    icon: Sparkles,
    badge: "bg-ok-soft text-ok",
    ring: "border-ok/35",
    bar: "bg-ok",
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

function ToastCard({
  notification,
  closing,
  onDismiss,
}: {
  notification: SystemNotificationRow;
  closing: boolean;
  onDismiss: () => void;
}) {
  const meta = typeMeta[notification.type] ?? typeMeta.info;
  const urgent = notification.type === "maintenance";
  const canDismiss = notification.dismissible && !urgent;

  // Auto-dismiss só pra notificações dispensáveis — manutenção é persistente
  // por natureza (a barra some, vira decoração fixa em vez de contagem).
  useEffect(() => {
    if (!canDismiss) return;
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canDismiss]);

  return (
    <div
      className={cn(
        "pointer-events-auto relative w-full overflow-hidden rounded-card border bg-surface shadow-pop backdrop-blur-sm",
        closing ? "animate-toast-out" : "animate-toast-in",
        urgent ? "animate-urgent-pulse border-danger/40" : meta.ring
      )}
    >
      <div className="flex items-start gap-3 p-3.5 pb-4">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            meta.badge
          )}
        >
          <meta.icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="break-words text-sm font-semibold text-txt">
            {notification.title}
          </p>
          <p className="mt-0.5 break-words text-xs leading-relaxed text-txt-mut">
            {notification.message}
          </p>
        </div>
        {canDismiss && (
          <button
            onClick={onDismiss}
            className="focus-ring -m-1 shrink-0 rounded p-1 text-txt-dim opacity-70 transition-opacity hover:opacity-100"
            aria-label="Fechar aviso"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Rodapé: contagem até auto-dismiss (dispensáveis) ou decoração fixa (persistente) */}
      <div className="absolute inset-x-0 bottom-0 h-[3px] bg-line/50">
        {canDismiss ? (
          <div
            className={cn("h-full origin-left animate-shrink-bar", meta.bar)}
          />
        ) : (
          <div className={cn("h-full w-full opacity-70", meta.bar)} />
        )}
      </div>
    </div>
  );
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
  const [closingIds, setClosingIds] = useState<Set<string>>(new Set());
  const closeTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

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

  // Limpa timers de saída pendentes ao desmontar
  useEffect(() => {
    const timers = closeTimers.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      try {
        window.sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...next]));
      } catch {
        /* sessionStorage indisponível — ignora */
      }
      return next;
    });
  }, []);

  // Dispara a animação de saída primeiro, só remove de fato depois de EXIT_MS
  const requestDismiss = useCallback(
    (id: string) => {
      if (closeTimers.current.has(id)) return;
      setClosingIds((prev) => new Set(prev).add(id));
      const timer = setTimeout(() => {
        dismiss(id);
        setClosingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        closeTimers.current.delete(id);
      }, EXIT_MS);
      closeTimers.current.set(id, timer);
    },
    [dismiss]
  );

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
    <div className="pointer-events-none fixed inset-x-4 bottom-36 z-[70] flex flex-col items-stretch gap-3 md:inset-x-auto md:bottom-[5.25rem] md:right-5 md:w-[360px]">
      {visible.map((n) => (
        <ToastCard
          key={n.id}
          notification={n}
          closing={closingIds.has(n.id)}
          onDismiss={() => requestDismiss(n.id)}
        />
      ))}
    </div>
  );
}
