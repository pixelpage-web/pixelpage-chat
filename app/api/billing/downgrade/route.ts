import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { downgradeToFree } from "@/lib/billing";

/**
 * POST — downgrade manual e imediato pro plano Free. Usado pelo botão
 * "Usar plano Free" em /app/billing (encerra o teste antes do prazo, ou
 * confirma permanência no Free). Só dono/admin, e só quando a org não
 * tem stripe_subscription_id ativo (ver downgradeToFree).
 */
export async function POST() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (session.profile.role !== "owner" && session.profile.role !== "admin") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const result = await downgradeToFree(session.profile.org_id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Não foi possível mudar para o plano Free." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
