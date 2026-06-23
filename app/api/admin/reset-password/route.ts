import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Suporte: gera um link de redefinição de senha para o dono de uma org.
 * POST { user_id } → { link } (o admin envia ao cliente pelo canal que preferir)
 */
export async function POST(request: Request) {
  const session = await getSessionProfile();
  if (session?.profile?.role !== "admin") {
    return NextResponse.json({ error: "Apenas admin" }, { status: 403 });
  }

  let body: { user_id?: string };
  try {
    body = (await request.json()) as { user_id?: string };
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }
  if (!body.user_id) {
    return NextResponse.json({ error: "user_id é obrigatório" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: user, error: userError } =
    await admin.auth.admin.getUserById(body.user_id);
  if (userError || !user.user?.email) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: user.user.email,
    options: { redirectTo: `${appUrl}/auth/callback?next=/app` },
  });
  if (error || !data.properties?.action_link) {
    return NextResponse.json(
      { error: "Falha ao gerar o link de redefinição" },
      { status: 500 }
    );
  }

  await admin.from("audit_logs").insert({
    actor_id: session.user.id,
    action: "admin.password_reset_link",
    metadata: { target_user: body.user_id, email: user.user.email },
  });

  return NextResponse.json({ link: data.properties.action_link, email: user.user.email });
}
