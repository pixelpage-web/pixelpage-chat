import { cache } from "react";
import { cookies } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProfileRow } from "@/types/database";
import type { User } from "@supabase/supabase-js";

/** Cookie que ativa o modo "ver como cliente" (somente admin). */
export const IMPERSONATE_COOKIE = "pixelpage_impersonate_org";

export interface SessionInfo {
  user: User;
  profile: ProfileRow | null;
  /** org_id sendo impersonada pelo admin (suporte), se houver */
  impersonating: boolean;
}

/**
 * Sessão + perfil do usuário logado (server-side).
 * Faz o bootstrap do admin global: o primeiro login do email definido em
 * ADMIN_EMAIL recebe a role 'admin' automaticamente.
 *
 * cache() do React: dedupe por request — layout.tsx e cada page.tsx do
 * grupo (shell) chamam isso de forma independente (cada um precisa do
 * org_id/role na hora), o que sem isso batia 2x em auth.getUser() (rede,
 * valida o JWT no servidor de Auth) + 2x em profiles.select toda vez que
 * uma página carregava. Não cobre a chamada de auth.getUser() feita em
 * middleware.ts — middleware roda numa fase separada do Next.js, fora do
 * render de Server Components onde o cache() do React tem efeito.
 */
export const getSessionProfile = cache(async (): Promise<SessionInfo | null> => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  let profile: ProfileRow | null = data ?? null;

  // Bootstrap de privilégios por email:
  //   SUPERADMIN_EMAIL → role 'superadmin' (admin global + acesso a todos os planos)
  //   ADMIN_EMAIL      → role 'admin' (painel /admin)
  const superadminEmail = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const userEmail = user.email?.toLowerCase();

  const targetRole =
    !!superadminEmail && userEmail === superadminEmail
      ? ("superadmin" as const)
      : !!adminEmail && userEmail === adminEmail
        ? ("admin" as const)
        : null;

  if (
    targetRole &&
    profile?.role !== targetRole &&
    // admin nunca rebaixa um superadmin já promovido
    !(targetRole === "admin" && profile?.role === "superadmin")
  ) {
    try {
      const admin = createAdminClient();
      const { data: upserted } = await admin
        .from("profiles")
        .upsert({
          id: user.id,
          org_id: profile?.org_id ?? null,
          role: targetRole,
          name: profile?.name || user.email || "",
        })
        .select("*")
        .single();
      profile = upserted ?? profile;
    } catch {
      // Service role ausente em dev — segue sem promover; o painel admin
      // simplesmente não abre até configurar SUPABASE_SERVICE_ROLE_KEY.
    }
  }

  // Impersonação (suporte): admin global navega o /app como uma organização.
  // O RLS de admin já enxerga todos os dados — aqui só trocamos o org_id de
  // contexto. Nunca se aplica a usuários não-admin.
  let impersonating = false;
  if (profile?.role === "admin" || profile?.role === "superadmin") {
    const cookieStore = await cookies();
    const impersonatedOrg = cookieStore.get(IMPERSONATE_COOKIE)?.value;
    if (impersonatedOrg && /^[0-9a-f-]{36}$/i.test(impersonatedOrg)) {
      profile = { ...profile, org_id: impersonatedOrg };
      impersonating = true;
    }
  }

  return { user, profile, impersonating };
});
