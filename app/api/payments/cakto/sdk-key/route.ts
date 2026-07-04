import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";

/**
 * Retorna o client_id do SDK da Cakto apenas para sessões autenticadas.
 * Evita expor a credencial como NEXT_PUBLIC_ no bundle do browser.
 */
export async function GET() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const clientId = process.env.CAKTO_PAYMENTS_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Gateway não configurado" }, { status: 503 });
  }

  return NextResponse.json({ clientId });
}
