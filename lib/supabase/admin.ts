import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Client com service_role — IGNORA RLS. Uso exclusivo no servidor:
 * webhooks (Meta/Stripe), API pública, rotinas do bot e painel admin.
 * Nunca importar em código que vá para o browser.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Supabase não configurado: defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
