"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck, MessageSquare, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { cn, timeAgo } from "@/lib/utils";

interface InAppNotification {
  id: string;
  notification_type: string;
  conversation_id: string | null;
  body: string;
  read_at: string | null;
  created_at: string;
}

const typeIcon: Record<string, typeof Bell> = {
  conversation_assignment: UserPlus,
  conversation_mention: Bell,
  conversation_reply: MessageSquare,
  conversation_creation: MessageSquare,
};

export function InboxNotifications({
  userId,
  orgId,
  onNavigate,
}: {
  userId: string;
  orgId: string;
  onNavigate?: (conversationId: string) => void;
}) {
  const t = useT();
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);

  async function load() {
    const { data } = await supabase
      .from("in_app_notifications")
      .select("id, notification_type, conversation_id, body, read_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(40);
    setNotifications(data ?? []);
  }

  useEffect(() => {
    void load();

    const channel = supabase
      .channel(`notif-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "in_app_notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setNotifications((prev) => [payload.new as InAppNotification, ...prev]);
        }
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [userId]); // eslint-disable-line

  const unread = notifications.filter((n) => !n.read_at).length;

  async function markAllRead() {
    const unreadIds = notifications.filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    await supabase
      .from("in_app_notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", unreadIds);
  }

  async function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
    await supabase
      .from("in_app_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
  }

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen((v) => !v); if (!open) void markAllRead(); }}
        className="focus-ring relative flex h-8 w-8 items-center justify-center rounded-lg text-txt-mut transition-colors hover:bg-surface-hover hover:text-txt"
        aria-label={t("Notificações")}
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-lime px-0.5 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 z-40 mt-2 w-80 rounded-xl border border-line bg-surface-raised shadow-pop">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="text-sm font-semibold">{t("Notificações")}</p>
              {unread > 0 && (
                <button
                  onClick={() => void markAllRead()}
                  className="flex items-center gap-1 text-[11px] text-lime hover:underline"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  {t("Marcar todas lidas")}
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-txt-dim">{t("Nenhuma notificação.")}</p>
              ) : (
                notifications.map((n) => {
                  const Icon = typeIcon[n.notification_type] ?? Bell;
                  return (
                    <button
                      key={n.id}
                      onClick={() => {
                        void markRead(n.id);
                        if (n.conversation_id && onNavigate) {
                          onNavigate(n.conversation_id);
                          setOpen(false);
                        }
                      }}
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover",
                        !n.read_at && "bg-lime-soft/30"
                      )}
                    >
                      <div className={cn(
                        "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                        !n.read_at ? "bg-lime-soft text-lime" : "bg-surface text-txt-dim"
                      )}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={cn("text-xs leading-relaxed", !n.read_at ? "font-medium text-txt" : "text-txt-mut")}>
                          {n.body || typeLabel(n.notification_type, t)}
                        </p>
                        <p className="mt-0.5 text-[10px] text-txt-dim">{timeAgo(n.created_at)}</p>
                      </div>
                      {!n.read_at && (
                        <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-lime" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function typeLabel(type: string, t: (s: string) => string) {
  switch (type) {
    case "conversation_assignment": return t("Conversa atribuída a você");
    case "conversation_mention": return t("Você foi mencionado numa nota");
    case "conversation_reply": return t("Nova mensagem em conversa atribuída");
    case "conversation_creation": return t("Nova conversa criada");
    default: return t("Nova notificação");
  }
}
