import * as cheerio from "cheerio";
import mammoth from "mammoth";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { isUrlSafeForOutbound } from "@/lib/ssrf-guard";

/**
 * "Ensine sua IA" — extração de texto de arquivos (PDF/TXT/DOCX) e de sites.
 * O conteúdo extraído vai para agent_knowledge e entra no system prompt do bot.
 */

export const KNOWLEDGE_MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB por arquivo
export const KNOWLEDGE_MAX_FILES = 5; // limite de fontes por agente
/** Orçamento de caracteres do conhecimento dentro do system prompt (~12k tokens) */
export const KNOWLEDGE_PROMPT_BUDGET = 48_000;
/** Limite de armazenamento por fonte (evita estourar a linha no banco) */
const MAX_CONTENT_CHARS = 120_000;

// -----------------------------------------------------------------------------
// Arquivos
// -----------------------------------------------------------------------------

export type KnowledgeFileKind = "pdf" | "docx" | "txt";

export function detectFileKind(fileName: string): KnowledgeFileKind | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".txt")) return "txt";
  return null;
}

export async function extractTextFromFile(
  buffer: Buffer,
  kind: KnowledgeFileKind
): Promise<string> {
  let text = "";
  if (kind === "pdf") {
    const result = await pdfParse(buffer);
    text = result.text;
  } else if (kind === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
  } else {
    text = buffer.toString("utf8");
  }
  return normalizeText(text);
}

function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_CONTENT_CHARS);
}

// -----------------------------------------------------------------------------
// Sites
// -----------------------------------------------------------------------------

/** Caminhos padrão visitados além da home. */
const CRAWL_PATHS = ["/", "/sobre", "/servicos", "/faq", "/contato", "/produtos"];
const FETCH_TIMEOUT_MS = 10_000;

function extractHtmlText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, iframe, nav, footer, form").remove();
  const title = $("title").first().text().trim();
  const body = $("body").text();
  return normalizeText(title ? `${title}\n${body}` : body);
}

const MAX_REDIRECTS = 3;

/**
 * Busca uma página validando SSRF a cada hop — inclusive redirecionamentos,
 * que são seguidos manualmente (redirect: "manual") e revalidados um a um
 * antes de seguir. Sem isso, um site malicioso poderia devolver um 302 para
 * um alvo interno (ex.: 169.254.169.254) e o fetch seguiria sem checagem.
 */
async function fetchPage(url: string): Promise<string | null> {
  let currentUrl = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const check = await isUrlSafeForOutbound(currentUrl);
    if (!check.safe) return null;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(currentUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "ZariBot/1.0 (+https://pixelpagechat.com.br)",
          Accept: "text/html",
        },
        redirect: "manual",
      });
      clearTimeout(timer);

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) return null;
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }
      if (!res.ok) return null;
      const type = res.headers.get("content-type") ?? "";
      if (!type.includes("text/html") && !type.includes("text/plain")) return null;
      return await res.text();
    } catch {
      return null;
    }
  }
  return null; // excedeu o limite de redirecionamentos
}

export interface CrawlResult {
  /** Texto combinado de todas as páginas lidas */
  content: string;
  /** Quantas páginas retornaram conteúdo */
  pagesRead: number;
}

/**
 * Lê as páginas principais do site e combina o texto.
 * Bloqueia alvos internos (SSRF) via lib/ssrf-guard.ts — mesma proteção do
 * webhook n8n: resolve DNS de verdade e checa os IPs contra faixas privadas,
 * em vez de só olhar o hostname literal. Exige https:// (mesmo padrão do
 * guard compartilhado).
 */
export async function crawlWebsite(rawUrl: string): Promise<CrawlResult> {
  let base: URL;
  try {
    base = new URL(rawUrl.includes("://") ? rawUrl : `https://${rawUrl}`);
  } catch {
    throw new Error("Endereço inválido. Use o formato https://suaempresa.com.br");
  }

  const baseCheck = await isUrlSafeForOutbound(base.toString());
  if (!baseCheck.safe) {
    throw new Error("Não consegui acessar o site.");
  }

  const seen = new Set<string>();
  const sections: string[] = [];
  let pagesRead = 0;

  for (const path of CRAWL_PATHS) {
    const url = new URL(path, base.origin).toString();
    if (seen.has(url)) continue;
    seen.add(url);

    const html = await fetchPage(url);
    if (!html) continue;
    const text = extractHtmlText(html);
    if (text.length < 80) continue; // página vazia/erro disfarçado

    pagesRead += 1;
    sections.push(`### Página: ${url}\n${text.slice(0, 25_000)}`);
  }

  if (pagesRead === 0) {
    throw new Error("Não consegui acessar o site.");
  }

  return {
    content: normalizeText(sections.join("\n\n")),
    pagesRead,
  };
}

// -----------------------------------------------------------------------------
// Conhecimento no prompt do bot
// -----------------------------------------------------------------------------

/**
 * Busca as fontes prontas do agente e monta o bloco de conhecimento que entra
 * no system prompt, respeitando o orçamento de caracteres.
 */
export async function getAgentKnowledge(
  client: SupabaseClient<Database>,
  agentId: string
): Promise<{ name: string; content: string }[]> {
  const { data } = await client
    .from("agent_knowledge")
    .select("source_name, content")
    .eq("agent_id", agentId)
    .eq("status", "ready")
    .order("created_at", { ascending: true });

  const sources = (data ?? []).filter((k) => k.content.trim());
  if (sources.length === 0) return [];

  // Distribui o orçamento igualmente entre as fontes
  const perSource = Math.floor(KNOWLEDGE_PROMPT_BUDGET / sources.length);
  return sources.map((k) => ({
    name: k.source_name,
    content: k.content.slice(0, perSource),
  }));
}
