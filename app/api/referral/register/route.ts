import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const COOKIE = "ppref";

/**
 * POST — registra a indicação após a criação de org no onboarding.
 * Lê o cookie `ppref` (código do link), valida e cria o referral.
 * Sem body necessário: a org do usuário é lida da sessão.
 */
export async function POST() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const cookieStore = await cookies();
  const code = cookieStore.get(COOKIE)?.value;

  if (!code) {
    // Sem cookie de referral — fluxo normal sem indicação
    return NextResponse.json({ ok: true, skipped: true });
  }

  const admin = createAdminClient();
  const orgId = session.profile.org_id;

  // Resolve o link pelo código
  const { data: link } = await admin
    .from("referral_links")
    .select("id, org_id, enabled")
    .eq("code", code)
    .maybeSingle();

  // Cookie inválido, link desativado ou link da própria org → ignora silenciosamente
  if (!link || !link.enabled || link.org_id === orgId) {
    const response = NextResponse.json({ ok: true, skipped: true });
    response.cookies.set(COOKIE, "", { maxAge: 0, path: "/" });
    return response;
  }

  // Org já foi referenciada antes → ignora (constraint UNIQUE no banco)
  const { data: existing } = await admin
    .from("referrals")
    .select("id")
    .eq("referred_org_id", orgId)
    .maybeSingle();

  if (existing) {
    const response = NextResponse.json({ ok: true, skipped: true });
    response.cookies.set(COOKIE, "", { maxAge: 0, path: "/" });
    return response;
  }

  const { error } = await admin.from("referrals").insert({
    referrer_org_id: link.org_id,
    referred_org_id: orgId,
    link_id: link.id,
    status: "pending",
  });

  if (error) {
    // Pode ser violação de UNIQUE — trata silenciosamente
    console.error(`[referral] register error: ${error.message}`);
    const response = NextResponse.json({ ok: true, skipped: true });
    response.cookies.set(COOKIE, "", { maxAge: 0, path: "/" });
    return response;
  }

  // Notifica o referenciador que alguém usou seu link
  await admin.from("referral_notifications").insert({
    org_id: link.org_id,
    type: "referral_pending",
    data: { referred_org_id: orgId },
  });

  const response = NextResponse.json({ ok: true, registered: true });
  response.cookies.set(COOKIE, "", { maxAge: 0, path: "/" });
  return response;
}
