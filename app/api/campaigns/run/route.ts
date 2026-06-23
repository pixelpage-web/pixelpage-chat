import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processCampaignBatch } from "@/lib/campaigns";

/**
 * Cron de campanhas — chame a cada minuto (Vercel Cron ou similar):
 *   GET /api/campaigns/run  (header Authorization: Bearer CRON_SECRET,
 *   que a Vercel envia automaticamente, ou ?key=CRON_SECRET)
 *
 * 1. Inicia campanhas agendadas cujo horário chegou
 * 2. Continua (em lotes) as campanhas em execução com pendências
 */

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const url = new URL(request.url);
    const header = request.headers.get("authorization");
    const ok =
      header === `Bearer ${secret}` || url.searchParams.get("key") === secret;
    if (!ok) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  // 1. Agendadas que chegaram na hora → running
  const { data: due } = await admin
    .from("campaigns")
    .select("id")
    .eq("status", "scheduled")
    .lte("scheduled_at", nowIso)
    .limit(10);
  for (const c of due ?? []) {
    await admin.from("campaigns").update({ status: "running" }).eq("id", c.id);
  }

  // 2. Em execução: processa um lote de cada (mais antigas primeiro)
  const { data: running } = await admin
    .from("campaigns")
    .select("id")
    .eq("status", "running")
    .order("created_at", { ascending: true })
    .limit(3);

  const results: { id: string; processed: number; remaining: number }[] = [];
  for (const c of running ?? []) {
    const result = await processCampaignBatch(c.id, 40);
    results.push({ id: c.id, ...result });
  }

  return NextResponse.json({ started: (due ?? []).length, batches: results });
}
