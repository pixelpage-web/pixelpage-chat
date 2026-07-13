import OpenAI from "openai";
import type { ChatTurn, AgentReplyResult } from "@/lib/claude";

/**
 * Integração com a OpenAI — usada tanto por orgs em BYOK (ai_provider =
 * 'openai', chave do próprio cliente) quanto managed (ai_provider =
 * 'openai', chave da própria plataforma via OPENAI_API_KEY). Usa a
 * Responses API (não a Chat Completions API) — orientação atual da OpenAI
 * para novas integrações de chat de propósito geral.
 */

/** Mesmo formato de retorno que lib/claude.ts usa para o resultado do provider. */
export type ProviderCallResult = AgentReplyResult;

/** Modelo managed padrão — mesmo espírito do CLAUDE_MODEL default em lib/settings.ts. */
export const DEFAULT_MANAGED_OPENAI_MODEL = "gpt-5.6-luna";

export async function callOpenAI(params: {
  /** Se omitida (modo managed), usa OPENAI_API_KEY do ambiente — mesmo padrão de callAnthropic. */
  apiKey?: string;
  model: string;
  systemPrompt: string;
  history: ChatTurn[]; // mesmo ChatTurn de lib/claude.ts
  userMessage: string;
  maxTokens: number;
}): Promise<ProviderCallResult> {
  const fail = (error: string): ProviderCallResult => ({
    ok: false,
    text: "",
    inputTokens: 0,
    outputTokens: 0,
    model: params.model,
    error,
  });

  const client = params.apiKey ? new OpenAI({ apiKey: params.apiKey }) : new OpenAI();

  // Mesma janela/limpeza de histórico usada para o Anthropic em lib/claude.ts.
  const history = params.history.slice(-20).filter((t) => t.content.trim());

  try {
    const response = await client.responses.create({
      model: params.model,
      instructions: params.systemPrompt,
      input: [
        ...history.map((t) => ({
          role: t.role,
          content: [{ type: "input_text" as const, text: t.content }],
        })),
        {
          role: "user" as const,
          content: [{ type: "input_text" as const, text: params.userMessage }],
        },
      ],
      max_output_tokens: params.maxTokens,
    });

    const text = (response.output_text ?? "").trim();
    if (!text) {
      return fail("O modelo não retornou texto. Tente novamente.");
    }

    return {
      ok: true,
      text,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      model: response.model || params.model,
      error: null,
    };
  } catch (error) {
    if (error instanceof OpenAI.AuthenticationError) {
      return fail("Chave da OpenAI inválida — verifique a chave configurada.");
    }
    if (error instanceof OpenAI.RateLimitError) {
      return fail("Limite de requisições da OpenAI atingido — tente em instantes.");
    }
    if (error instanceof OpenAI.APIError) {
      return fail(`Erro da API OpenAI (${error.status}): ${error.message}`);
    }
    return fail("Falha de conexão com a API da OpenAI.");
  }
}

/**
 * Checagem de custo quase zero (só autenticação) via GET /models — usada para
 * validar a chave do cliente antes de salvar em BYOK. Retorna false SOMENTE
 * para erro de autenticação; qualquer outro erro (rate limit, rede) é
 * relançado para o chamador decidir como tratar — não é o mesmo que "chave
 * inválida".
 */
export async function verifyOpenAiKey(apiKey: string): Promise<boolean> {
  const client = new OpenAI({ apiKey });
  try {
    await client.models.list();
    return true;
  } catch (error) {
    if (error instanceof OpenAI.AuthenticationError) {
      return false;
    }
    throw error;
  }
}
