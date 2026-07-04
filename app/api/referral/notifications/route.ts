import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";

/** GET — lista notificações do sistema de indicações da org. */
export async function GET() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const supabase = await createServerSupabase();

  const { data: notifications } = await supabase
    .from("referral_notifications")
    .select("*")
    .eq("org_id", session.profile.org_id)
    .order("created_at", { ascending: false })
    .limit(50);

  const unreadCount =
    notifications?.filter((n) => !n.read).length ?? 0;

  return NextResponse.json({ notifications: notifications ?? [], unreadCount });
}
