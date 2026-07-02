import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchEvolutionProfilePicture } from "@/lib/evolution";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const orgId = session.profile.org_id;

  const admin = createAdminClient();

  // Verifica que o contato pertence à org
  const { data: contact } = await admin
    .from("contacts")
    .select("id, phone, profile_photo_status")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!contact) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 });

  // Usa a instância QR Code conectada mais recente da org
  const { data: connection } = await admin
    .from("whatsapp_connections")
    .select("evolution_instance_id")
    .eq("org_id", orgId)
    .eq("connection_type", "qr_code")
    .eq("status", "connected")
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!connection?.evolution_instance_id) {
    return NextResponse.json({ error: "Nenhuma conexão WhatsApp ativa" }, { status: 422 });
  }

  let avatarUrl: string | null = null;
  let status: "available" | "private" | "unknown" = "unknown";
  try {
    avatarUrl = await fetchEvolutionProfilePicture(
      connection.evolution_instance_id,
      contact.phone
    );
    status = avatarUrl ? "available" : "private";
  } catch {
    status = "unknown";
  }

  await admin
    .from("contacts")
    .update({ profile_photo_status: status, ...(avatarUrl ? { avatar_url: avatarUrl } : {}) })
    .eq("id", id);

  return NextResponse.json({ ok: true, status, avatar_url: avatarUrl });
}
