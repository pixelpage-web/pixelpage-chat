import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";

/** Verifica o status atual da assinatura do usuário — usado pelo polling do PIX. */
export async function GET() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const orgId = session.profile.org_id;

  const supabase = await createServerSupabase();

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("status, plan_id")
    .eq("org_id", orgId)
    .maybeSingle();

  if (!sub) {
    return NextResponse.json({ status: null, planName: null });
  }

  const { data: plan } = await supabase
    .from("plans")
    .select("name")
    .eq("id", sub.plan_id)
    .maybeSingle();

  return NextResponse.json({
    status: sub.status,
    planName: plan?.name ?? null,
  });
}
