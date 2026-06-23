import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { KNOWLEDGE_MAX_FILES, crawlWebsite } from "@/lib/knowledge";

/**
 * "Ensine sua IA" — processamento de site:
 * lê as páginas principais (/, /sobre, /servicos, /faq, /contato, /produtos),
 * extrai o texto e salva como fonte de conhecimento do agente.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

interface UrlBody {
  agent_id?: string;
  url?: string;
}

export async function POST(request: Request) {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  let body: UrlBody;
  try {
    body = (await request.json()) as UrlBody;
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const url = body.url?.trim();
  if (!body.agent_id || !url) {
    return NextResponse.json({ error: "agent_id e url são obrigatórios" }, { status: 400 });
  }

  const supabase = await createServerSupabase();

  const { data: agent } = await supabase
    .from("agents")
    .select("id")
    .eq("id", body.agent_id)
    .maybeSingle();
  if (!agent) {
    return NextResponse.json({ error: "Agente não encontrado" }, { status: 404 });
  }

  const { count } = await supabase
    .from("agent_knowledge")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", body.agent_id);
  if ((count ?? 0) >= KNOWLEDGE_MAX_FILES) {
    return NextResponse.json(
      { error: `Limite de ${KNOWLEDGE_MAX_FILES} fontes atingido. Exclua uma fonte para adicionar outra.` },
      { status: 400 }
    );
  }

  const hostname = (() => {
    try {
      return new URL(url.includes("://") ? url : `https://${url}`).hostname;
    } catch {
      return url;
    }
  })();

  const { data: row, error: insertError } = await supabase
    .from("agent_knowledge")
    .insert({
      agent_id: body.agent_id,
      source_type: "url",
      source_name: hostname,
      content: "",
      status: "processing",
      meta: { url },
    })
    .select("*")
    .single();
  if (insertError || !row) {
    return NextResponse.json({ error: "Falha ao registrar a fonte." }, { status: 500 });
  }

  try {
    const result = await crawlWebsite(url);
    const { data: updated } = await supabase
      .from("agent_knowledge")
      .update({
        content: result.content,
        status: "ready",
        error_message: null,
        meta: { url, pages_read: result.pagesRead },
      })
      .eq("id", row.id)
      .select("*")
      .single();
    return NextResponse.json({ knowledge: updated ?? row, pages_read: result.pagesRead });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Não consegui acessar o site.";
    const { data: updated } = await supabase
      .from("agent_knowledge")
      .update({ status: "error", error_message: message })
      .eq("id", row.id)
      .select("*")
      .single();
    return NextResponse.json({ knowledge: updated ?? row });
  }
}
