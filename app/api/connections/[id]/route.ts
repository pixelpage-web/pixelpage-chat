import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * DELETE /api/connections/{id}
 * Exclui uma conexão WhatsApp (API Oficial/Meta). Conexões QR Code passam por
 * /api/whatsapp/qr (precisa deslogar a instância na Evolution API antes).
 * Antes desta rota, components/connections/connections-view.tsx excluía
 * direto via client Supabase, sem checar papel — só a RLS de organização,
 * então qualquer membro da equipe (inclusive "Agente") podia desconectar o
 * WhatsApp da empresa inteira. Mesmo padrão de checagem de
 * /api/integrations/ai-mode: só owner ou admin.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (session.profile.role !== "owner" && session.profile.role !== "admin") {
    return NextResponse.json(
      { error: "Apenas o dono ou administrador da organização pode excluir uma conexão." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const supabase = await createServerSupabase();

  const { data: connection } = await supabase
    .from("whatsapp_connections")
    .select("id, org_id")
    .eq("id", id)
    .maybeSingle();
  if (!connection || connection.org_id !== session.profile.org_id) {
    return NextResponse.json({ error: "Conexão não encontrada" }, { status: 404 });
  }

  const { error } = await supabase.from("whatsapp_connections").delete().eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: "Não foi possível excluir a conexão." },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
