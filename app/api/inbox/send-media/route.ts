import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSubscriptionBlocked } from "@/lib/billing";
import { isSuperAdmin } from "@/lib/access";
import { canSend, sendMedia } from "@/lib/send";
import type { MessageType } from "@/types/database";

/**
 * Anexo no inbox: recebe o arquivo (FormData), sobe no Storage (bucket media),
 * envia pelo canal da conexão (Meta ou QR Code) e salva no histórico.
 */

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

function classify(mime: string): { kind: "image" | "document"; type: MessageType } {
  if (mime.startsWith("image/")) return { kind: "image", type: "image" };
  return { kind: "document", type: "document" };
}

export async function POST(request: Request) {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const orgId = session.profile.org_id;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const conversationId = form?.get("conversation_id");
  if (!form || !(file instanceof File) || typeof conversationId !== "string") {
    return NextResponse.json(
      { error: "Envie file e conversation_id" },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Arquivo acima de 8 MB" },
      { status: 413 }
    );
  }

  const supabase = await createServerSupabase();

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("status, trial_ends_at, current_period_end")
    .eq("org_id", orgId)
    .maybeSingle();
  // Super Admin não é bloqueado (acesso de demonstração a todos os planos)
  if (!isSuperAdmin(session.user.email) && (await isSubscriptionBlocked(orgId, subscription ?? null))) {
    return NextResponse.json(
      { error: "Seu plano expirou — faça upgrade para voltar a responder." },
      { status: 403 }
    );
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, contact_id, connection_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }
  const { data: contact } = await supabase
    .from("contacts")
    .select("phone")
    .eq("id", conversation.contact_id)
    .maybeSingle();
  if (!contact) {
    return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 });
  }

  // Upload no Storage (service role — bucket media é público para leitura)
  const admin = createAdminClient();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const path = `${orgId}/${conversation.id}/${Date.now()}_${safeName}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadError } = await admin.storage
    .from("media")
    .upload(path, bytes, { contentType: file.type || "application/octet-stream" });
  if (uploadError) {
    return NextResponse.json(
      { error: "Falha ao subir o arquivo" },
      { status: 500 }
    );
  }
  const { data: pub } = admin.storage.from("media").getPublicUrl(path);
  const mediaUrl = pub.publicUrl;

  const { kind, type } = classify(file.type || "");

  // Envia pelo canal quando a conexão está ativa (senão, só registra)
  let providerId: string | null = null;
  if (conversation.connection_id) {
    const { data: connection } = await supabase
      .from("whatsapp_connections")
      .select("connection_type, phone_number_id, evolution_instance_id, status")
      .eq("id", conversation.connection_id)
      .maybeSingle();
    if (connection && canSend(connection)) {
      const result = await sendMedia(
        connection,
        contact.phone,
        kind,
        mediaUrl,
        undefined,
        safeName
      );
      if (!result.ok) {
        return NextResponse.json(
          { error: `Falha no envio: ${result.error}` },
          { status: 502 }
        );
      }
      providerId = result.providerMessageId;
    }
  }

  const { data: message, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversation.id,
      direction: "outbound",
      sender_type: "human",
      sender_id: session.user.id,
      content: kind === "image" ? "" : safeName,
      message_type: type,
      media_url: mediaUrl,
      meta_message_id: providerId,
    })
    .select("*")
    .single();

  if (error || !message) {
    return NextResponse.json(
      { error: "Arquivo enviado, mas houve falha ao salvar no histórico." },
      { status: 500 }
    );
  }

  return NextResponse.json({ message });
}
