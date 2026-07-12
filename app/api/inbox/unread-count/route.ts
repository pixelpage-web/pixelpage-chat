import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";

/** GET — número de conversas abertas com unread_count > 0 para a org do usuário. */
export async function GET() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) {
    return NextResponse.json({ count: 0 });
  }

  const supabase = await createServerSupabase();
  const { count } = await supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("org_id", session.profile.org_id)
    .eq("status", "open")
    .eq("archived", false)
    .gt("unread_count", 0);

  return NextResponse.json({ count: count ?? 0 });
}
