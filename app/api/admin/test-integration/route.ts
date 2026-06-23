import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSessionProfile } from "@/lib/auth";
import { getClaudeConfig } from "@/lib/settings";
import { testEvolutionConnection } from "@/lib/evolution";
import { isAsaasConfigured } from "@/lib/asaas";

/**
 * Botões "Testar conexão" do painel admin.
 * POST { type: "claude" | "evolution" | "asaas" | "meta" }
 */

export async function POST(request: Request) {
  const session = await getSessionProfile();
  if (session?.profile?.role !== "admin") {
    return NextResponse.json({ error: "Apenas admin" }, { status: 403 });
  }

  let body: { type?: string };
  try {
    body = (await request.json()) as { type?: string };
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  // ---------------------------------------------------------------- Claude
  if (body.type === "claude") {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { ok: false, detail: "ANTHROPIC_API_KEY não configurada (somente env)" },
        { status: 200 }
      );
    }
    try {
      const config = await getClaudeConfig();
      const client = new Anthropic();
      const model = await client.models.retrieve(config.model);
      return NextResponse.json({
        ok: true,
        detail: `Chave válida · modelo ${model.id} disponível`,
      });
    } catch (err) {
      return NextResponse.json({
        ok: false,
        detail:
          err instanceof Anthropic.AuthenticationError
            ? "Chave da Claude API inválida"
            : err instanceof Error
              ? err.message
              : "Falha ao testar a Claude API",
      });
    }
  }

  // -------------------------------------------------------------- Evolution
  if (body.type === "evolution") {
    const result = await testEvolutionConnection();
    return NextResponse.json({
      ok: result.ok,
      detail: result.ok
        ? `Conectado · Evolution API v${result.version ?? "?"}`
        : (result.error ?? "Falha ao conectar"),
    });
  }

  // ------------------------------------------------------------------ Asaas
  if (body.type === "asaas") {
    if (!isAsaasConfigured()) {
      return NextResponse.json({
        ok: false,
        detail: "ASAAS_API_KEY não configurada — modo demonstração ativo",
      });
    }
    try {
      const base =
        process.env.ASAAS_ENV === "production"
          ? "https://api.asaas.com/v3"
          : "https://api-sandbox.asaas.com/v3";
      const res = await fetch(`${base}/customers?limit=1`, {
        headers: { access_token: process.env.ASAAS_API_KEY as string },
      });
      return NextResponse.json({
        ok: res.ok,
        detail: res.ok
          ? `Conectado ao Asaas (${process.env.ASAAS_ENV ?? "sandbox"})`
          : `Asaas respondeu ${res.status} — confira a chave e o ambiente`,
      });
    } catch {
      return NextResponse.json({ ok: false, detail: "Falha de rede no Asaas" });
    }
  }

  // ------------------------------------------------------------------- Meta
  if (body.type === "meta") {
    const token = process.env.META_SYSTEM_USER_TOKEN;
    if (!token) {
      return NextResponse.json({
        ok: false,
        detail: "META_SYSTEM_USER_TOKEN não configurado (somente env)",
      });
    }
    try {
      const ver = process.env.META_GRAPH_VERSION || "v21.0";
      const res = await fetch(`https://graph.facebook.com/${ver}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => null)) as {
        name?: string;
        id?: string;
        error?: { message?: string };
      } | null;
      return NextResponse.json({
        ok: res.ok,
        detail: res.ok
          ? `Token válido · System User: ${json?.name ?? json?.id}`
          : (json?.error?.message ?? `Meta respondeu ${res.status}`),
      });
    } catch {
      return NextResponse.json({ ok: false, detail: "Falha de rede na Meta" });
    }
  }

  return NextResponse.json({ error: "Tipo desconhecido" }, { status: 400 });
}
