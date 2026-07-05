import { NextResponse } from "next/server";
import { isValidCPF, isValidPhoneBR } from "@/lib/br-validators";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST — valida CPF/telefone e checa unicidade de CPF antes do signUp.
 * RLS impede o client de consultar profiles de outros usuários, então a
 * checagem de unicidade precisa passar por aqui (via service role).
 * Nunca repassa o texto bruto de erros do Postgres/Supabase ao cliente.
 */
export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const rl = checkRateLimit(`register:${ip}`, { limit: 10, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde um instante e tente novamente." },
      { status: 429 }
    );
  }

  let body: { cpf?: unknown; phone?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Requisição inválida." },
      { status: 400 }
    );
  }

  const cpf = typeof body.cpf === "string" ? body.cpf : "";
  const phone = typeof body.phone === "string" ? body.phone : "";

  if (!isValidCPF(cpf)) {
    return NextResponse.json(
      { error: "CPF inválido." },
      { status: 400 }
    );
  }

  if (!isValidPhoneBR(phone)) {
    return NextResponse.json(
      { error: "Telefone inválido." },
      { status: 400 }
    );
  }

  const cpfDigits = cpf.replace(/\D/g, "");

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("check_cpf_available", {
      p_cpf: cpfDigits,
    });

    if (error) {
      console.error(`[register-check] check_cpf_available error: ${error.message}`);
      return NextResponse.json(
        { error: "Não foi possível verificar seus dados agora. Tente novamente." },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Este CPF já está cadastrado." },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[register-check] unexpected error: ${err instanceof Error ? err.message : err}`);
    return NextResponse.json(
      { error: "Não foi possível verificar seus dados agora. Tente novamente." },
      { status: 500 }
    );
  }
}
