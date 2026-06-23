import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  KNOWLEDGE_MAX_FILES,
  KNOWLEDGE_MAX_FILE_BYTES,
  detectFileKind,
  extractTextFromFile,
} from "@/lib/knowledge";

/**
 * "Ensine sua IA" — upload de arquivo (PDF/TXT/DOCX):
 *   POST   multipart { file, agent_id } → Storage + extração + agent_knowledge
 *   DELETE ?id=                          → remove a fonte (e o arquivo)
 */

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Envie o arquivo como multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  const agentId = form.get("agent_id");
  if (!(file instanceof File) || typeof agentId !== "string" || !agentId) {
    return NextResponse.json({ error: "file e agent_id são obrigatórios" }, { status: 400 });
  }

  if (file.size > KNOWLEDGE_MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "Arquivo muito grande — o limite é 5MB por arquivo." },
      { status: 400 }
    );
  }

  const kind = detectFileKind(file.name);
  if (!kind) {
    return NextResponse.json(
      { error: "Formato não aceito. Envie PDF, TXT ou DOCX." },
      { status: 400 }
    );
  }

  const supabase = await createServerSupabase();

  // RLS garante que o agente pertence à organização do usuário
  const { data: agent } = await supabase
    .from("agents")
    .select("id")
    .eq("id", agentId)
    .maybeSingle();
  if (!agent) {
    return NextResponse.json({ error: "Agente não encontrado" }, { status: 404 });
  }

  const { count } = await supabase
    .from("agent_knowledge")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId);
  if ((count ?? 0) >= KNOWLEDGE_MAX_FILES) {
    return NextResponse.json(
      { error: `Limite de ${KNOWLEDGE_MAX_FILES} fontes atingido. Exclua uma fonte para adicionar outra.` },
      { status: 400 }
    );
  }

  // 1. Guarda o arquivo original no Storage (bucket privado "knowledge")
  const safeName = file.name.replace(/[^\p{L}\p{N}._-]/gu, "_").slice(-80);
  const storagePath = `${session.profile.org_id}/${agentId}/${Date.now()}_${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from("knowledge")
    .upload(storagePath, buffer, { contentType: file.type || "application/octet-stream" });
  if (uploadError) {
    return NextResponse.json(
      { error: "Falha ao salvar o arquivo. Tente novamente." },
      { status: 500 }
    );
  }

  // 2. Cria o registro em processamento (o card aparece imediatamente)
  const { data: row, error: insertError } = await supabase
    .from("agent_knowledge")
    .insert({
      agent_id: agentId,
      source_type: "file",
      source_name: file.name,
      content: "",
      status: "processing",
      storage_path: storagePath,
      meta: { size_bytes: file.size },
    })
    .select("*")
    .single();
  if (insertError || !row) {
    return NextResponse.json({ error: "Falha ao registrar a fonte." }, { status: 500 });
  }

  // 3. Extrai o texto (síncrono — arquivos de até 5MB)
  try {
    const text = await extractTextFromFile(buffer, kind);
    if (text.length < 20) {
      throw new Error(
        "Não encontrei texto legível no arquivo. PDFs escaneados (imagem) não são suportados."
      );
    }
    const { data: updated } = await supabase
      .from("agent_knowledge")
      .update({ content: text, status: "ready", error_message: null })
      .eq("id", row.id)
      .select("*")
      .single();
    return NextResponse.json({ knowledge: updated ?? row });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Não consegui ler este arquivo.";
    const { data: updated } = await supabase
      .from("agent_knowledge")
      .update({ status: "error", error_message: message })
      .eq("id", row.id)
      .select("*")
      .single();
    return NextResponse.json({ knowledge: updated ?? row });
  }
}

export async function DELETE(request: Request) {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });
  }

  const supabase = await createServerSupabase();

  const { data: row } = await supabase
    .from("agent_knowledge")
    .select("id, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (!row) {
    return NextResponse.json({ error: "Fonte não encontrada" }, { status: 404 });
  }

  if (row.storage_path) {
    await supabase.storage.from("knowledge").remove([row.storage_path]);
  }
  const { error } = await supabase.from("agent_knowledge").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: "Não foi possível excluir." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
