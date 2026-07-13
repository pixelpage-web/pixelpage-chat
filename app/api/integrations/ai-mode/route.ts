import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAnthropicKey } from "@/lib/claude";
import { verifyOpenAiKey } from "@/lib/openai-provider";
import { encryptSecret } from "@/lib/crypto";
import type { AiMode, AiProvider } from "@/types/database";

/**
 * Configura o modo de IA da organização:
 * - managed  → chave/modelo gerenciados pela plataforma (padrão de hoje, sem mudança).
 * - byok     → a org usa a própria chave (Anthropic ou OpenAI). Sem teto de
 *              custo da plataforma (o gasto é do cliente), mas a chave só é
 *              salva depois de verificada com sucesso contra o provider.
 * - disabled → desliga respostas automáticas de IA para a org.
 * Só owner/admin conseguem mudar, e sempre na PRÓPRIA org (nunca org alheia
 * — org_id vem de session.profile, nunca do corpo da requisição).
 */

const VALID_MODES: AiMode[] = ["managed", "byok", "disabled"];
const VALID_PROVIDERS: AiProvider[] = ["anthropic", "openai"];

export async function POST(request: Request) {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (session.profile.role !== "owner" && session.profile.role !== "admin") {
    return NextResponse.json(
      { error: "Apenas o dono ou administrador da organização pode configurar o modo de IA." },
      { status: 403 }
    );
  }
  const orgId = session.profile.org_id;

  let body: { ai_mode?: string; ai_provider?: string; api_key?: string };
  try {
    body = (await request.json()) as {
      ai_mode?: string;
      ai_provider?: string;
      api_key?: string;
    };
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const aiMode = body.ai_mode as AiMode;
  if (!VALID_MODES.includes(aiMode)) {
    return NextResponse.json({ error: "ai_mode inválido" }, { status: 400 });
  }

  const admin = createAdminClient();

  // -------------------------------------------------------- managed/disabled
  if (aiMode === "managed" || aiMode === "disabled") {
    // managed aceita opcionalmente escolher o provider (ex.: OpenAI gpt-5.6-luna
    // em vez do Anthropic default da plataforma). Sem provider informado (ou
    // valor inválido) -> null = default (Anthropic). Sempre grava algo aqui
    // (nunca deixa o campo como estava) porque senão um ai_provider órfão de
    // um BYOK anterior ficaria "escondido" no banco e voltaria a valer assim
    // que a org saísse do byok — resolveOrgAiConfig agora lê esse campo também
    // em modo managed.
    const requestedProvider =
      aiMode === "managed" ? (body.ai_provider as AiProvider | undefined) : undefined;
    const ai_provider =
      requestedProvider && VALID_PROVIDERS.includes(requestedProvider) ? requestedProvider : null;

    const { error } = await admin
      .from("organizations")
      .update({ ai_mode: aiMode, ai_provider })
      .eq("id", orgId);
    if (error) {
      return NextResponse.json(
        { error: "Não foi possível atualizar o modo de IA." },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true });
  }

  // ------------------------------------------------------------------ byok
  const provider = body.ai_provider as AiProvider;
  const apiKey = body.api_key?.trim();

  if (!VALID_PROVIDERS.includes(provider) || !apiKey) {
    return NextResponse.json(
      { error: "ai_provider e api_key são obrigatórios para o modo byok." },
      { status: 400 }
    );
  }

  // Verifica a chave contra o provider ANTES de salvar qualquer coisa —
  // nunca gravamos uma chave que não comprovamos ser válida.
  let verified: boolean;
  try {
    verified =
      provider === "anthropic"
        ? await verifyAnthropicKey(apiKey)
        : await verifyOpenAiKey(apiKey);
  } catch (err) {
    // Erro relançado por verifyAnthropicKey/verifyOpenAiKey que NÃO é de
    // autenticação (ex.: rate limit, rede) — não é o mesmo que "chave errada".
    console.error("[ai-mode] erro ao verificar chave BYOK:", orgId, provider, err);
    await admin.from("audit_logs").insert({
      org_id: orgId,
      actor_id: session.user.id,
      action: "ai_byok.failed",
      metadata: { provider, reason: "verification_error" },
    });
    return NextResponse.json({ error: "Chave inválida ou sem permissão." }, { status: 400 });
  }

  if (!verified) {
    await admin.from("audit_logs").insert({
      org_id: orgId,
      actor_id: session.user.id,
      action: "ai_byok.failed",
      metadata: { provider, reason: "invalid_key" },
    });
    return NextResponse.json({ error: "Chave inválida ou sem permissão." }, { status: 400 });
  }

  // Cifra e salva — encryptSecret lança se CREDENTIALS_ENCRYPTION_KEY estiver
  // ausente/malformada; propositalmente NÃO capturamos esse erro aqui (uma
  // config de cifra quebrada precisa quebrar a request de forma visível, não
  // salvar em texto puro nem fingir sucesso).
  const encrypted = encryptSecret(apiKey);

  const { error: secretsError } = await admin
    .from("org_secrets")
    .upsert({ org_id: orgId, ai_byok_key_encrypted: encrypted }, { onConflict: "org_id" });
  if (secretsError) {
    return NextResponse.json({ error: "Não foi possível salvar a chave." }, { status: 500 });
  }

  const { error: orgError } = await admin
    .from("organizations")
    .update({
      ai_mode: "byok",
      ai_provider: provider,
      ai_byok_verified_at: new Date().toISOString(),
    })
    .eq("id", orgId);
  if (orgError) {
    return NextResponse.json(
      { error: "Não foi possível atualizar o modo de IA." },
      { status: 500 }
    );
  }

  // Log de sucesso — nunca inclui a api_key, nem truncada/mascarada.
  await admin.from("audit_logs").insert({
    org_id: orgId,
    actor_id: session.user.id,
    action: "ai_byok.configure",
    metadata: { provider },
  });

  return NextResponse.json({ ok: true });
}
