import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateReferralCode, buildReferralUrl } from "@/lib/referral";

/** GET — retorna (ou cria) o link de indicação da org atual. */
export async function GET() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  if (!["owner", "admin"].includes(session.profile.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const orgId = session.profile.org_id;
  const supabase = await createServerSupabase();

  // Verifica assinatura paga — só orgs com plano pago podem indicar
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("status, plan_id")
    .eq("org_id", orgId)
    .maybeSingle();

  const { data: plan } = subscription?.plan_id
    ? await supabase
        .from("plans")
        .select("price_cents")
        .eq("id", subscription.plan_id)
        .maybeSingle()
    : { data: null };

  const hasPaidPlan =
    subscription?.status === "active" && (plan?.price_cents ?? 0) > 0;

  // Link existente
  const { data: existing } = await supabase
    .from("referral_links")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      link: existing,
      url: buildReferralUrl(existing.code),
      hasPaidPlan,
    });
  }

  // Cria novo link (service_role para contornar RLS de INSERT no own org)
  const admin = createAdminClient();
  let code = generateReferralCode();

  // Garante unicidade (improvável de colidir, mas defensivo)
  for (let i = 0; i < 5; i++) {
    const { data: clash } = await admin
      .from("referral_links")
      .select("id")
      .eq("code", code)
      .maybeSingle();
    if (!clash) break;
    code = generateReferralCode();
  }

  const { data: created, error } = await admin
    .from("referral_links")
    .insert({ org_id: orgId, code })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Erro ao criar link" }, { status: 500 });
  }

  return NextResponse.json({
    link: created,
    url: buildReferralUrl(created.code),
    hasPaidPlan,
  });
}

/** PATCH — habilita/desabilita o link. */
export async function PATCH(request: Request) {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (!["owner", "admin"].includes(session.profile.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { enabled } = (await request.json()) as { enabled?: boolean };
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "Campo 'enabled' obrigatório" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("referral_links")
    .update({ enabled })
    .eq("org_id", session.profile.org_id);

  if (error) {
    return NextResponse.json({ error: "Erro ao atualizar link" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
