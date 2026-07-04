import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ReferralStatus } from "@/types/database";

function isSuperadmin(session: Awaited<ReturnType<typeof getSessionProfile>>, email: string | undefined): boolean {
  if (!session || !email) return false;
  return (
    session.profile?.role === "superadmin" &&
    session.user.email?.toLowerCase() === email.toLowerCase()
  );
}

/** GET — lista todas as indicações (paginado). Superadmin only. */
export async function GET(request: Request) {
  const session = await getSessionProfile();
  const superEmail = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();

  if (!isSuperadmin(session, superEmail)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const status = searchParams.get("status") ?? "";
  const limit = 30;
  const offset = (page - 1) * limit;

  const admin = createAdminClient();

  let query = admin
    .from("referrals")
    .select(
      `
      id, status, activated_at, created_at,
      referrer_org:organizations!referrer_org_id(id, name, slug),
      referred_org:organizations!referred_org_id(id, name, slug),
      link:referral_links!link_id(code, clicks),
      rewards:referral_rewards(id, reward_type, amount_cents, status, scratch_card_revealed, applied_at)
      `,
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const validStatuses: ReferralStatus[] = ["pending", "activated", "rewarded", "canceled"];
  if (status && validStatuses.includes(status as ReferralStatus)) {
    query = query.eq("status", status as ReferralStatus);
  }

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    referrals: data ?? [],
    total: count ?? 0,
    page,
    pages: Math.ceil((count ?? 0) / limit),
  });
}
