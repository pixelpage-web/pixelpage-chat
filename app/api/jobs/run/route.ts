import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processDueJobs } from "@/lib/scheduled-jobs";

/**
 * Cron de jobs agendados — hoje 1x/dia (vercel.json, limite do plano Hobby;
 * o comentário abaixo em "a cada minuto" descreve a granularidade ideal, não
 * a atual — ver a checagem de ponte em lib/scheduled-jobs.ts que compensa
 * essa diferença a partir de tráfego real, enquanto o plano não muda):
 *   GET /api/jobs/run  (Authorization: Bearer CRON_SECRET ou ?key=)
 *
 * Tipos de job (tabela scheduled_jobs):
 *   csat_send        → envia a pesquisa CSAT após o atraso configurado
 *   flow_resume      → retoma o fluxo após o bloco "Aguardar"
 *   automation_check → "sem resposta há X horas" e "conversa resolvida"
 */

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 503 });
  }
  const url = new URL(request.url);
  const header = request.headers.get("authorization");
  const ok =
    header === `Bearer ${secret}` || url.searchParams.get("key") === secret;
  if (!ok) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const result = await processDueJobs(admin, { limit: 25 });
  return NextResponse.json(result);
}
