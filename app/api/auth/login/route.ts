import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Login server-side — existe só pra aplicar rate limit de aplicação (defesa
 * em profundidade além da proteção nativa do Supabase Auth). O client chama
 * esta rota em vez de supabase.auth.signInWithPassword() direto, porque uma
 * chamada feita do browser vai direto pro domínio do Supabase e nunca passa
 * pelo nosso servidor — não dava pra rate-limitar de jeito nenhum antes.
 */
export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const rl = checkRateLimit(`login:${ip}`, { limit: 10, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde um instante e tente novamente." },
      { status: 429 }
    );
  }

  let body: { email?: unknown; password?: unknown; captchaToken?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";
  const captchaToken =
    typeof body.captchaToken === "string" ? body.captchaToken : undefined;

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email e senha são obrigatórios." },
      { status: 400 }
    );
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
    options: { captchaToken },
  });

  if (error) {
    return NextResponse.json(
      {
        error:
          error.message === "Invalid login credentials"
            ? "Email ou senha incorretos."
            : "Não foi possível entrar. Tente novamente.",
      },
      { status: 401 }
    );
  }

  return NextResponse.json({ ok: true });
}
