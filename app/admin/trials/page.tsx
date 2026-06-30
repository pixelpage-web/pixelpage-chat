import { createAdminClient } from "@/lib/supabase/admin";
import { TrialsManager } from "@/components/admin/trials-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Trials · Admin" };

function monthStartIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export default async function AdminTrialsPage() {
  const admin = createAdminClient();
  const now = new Date();
  const monthStart = monthStartIso();

  // Todos os orgs em trial
  const { data: subs } = await admin
    .from("subscriptions")
    .select("org_id, trial_ends_at, trial_extended_count")
    .eq("status", "trial");

  const orgIds = (subs ?? []).map((s) => s.org_id);

  const [{ data: orgs }, { data: owners }, { data: usages }, { data: converted }] =
    await Promise.all([
      orgIds.length > 0
        ? admin.from("organizations").select("id, name, slug, owner_id, created_at").in("id", orgIds)
        : { data: [] },
      // Donos (role = owner) de cada org
      orgIds.length > 0
        ? admin
            .from("profiles")
            .select("id, org_id")
            .in("org_id", orgIds)
            .eq("role", "owner")
        : { data: [] },
      // Uso de mensagens por org neste mês
      orgIds.length > 0
        ? admin
            .from("usage_counters")
            .select("org_id, ai_messages_used")
            .in("org_id", orgIds)
            .eq("period_start", monthStart.slice(0, 10))
        : { data: [] },
      // Clientes convertidos para pago este mês
      admin
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .gte("created_at", monthStart),
    ]);

  // Buscar emails dos donos via auth admin list (para cada profile.id)
  const ownerIds = (owners ?? []).map((o) => o.id);
  const emailByOwner: Record<string, string> = {};

  // Supabase Admin API para emails — batch por profile
  if (ownerIds.length > 0) {
    for (const ownerId of ownerIds) {
      try {
        const { data: userData } = await admin.auth.admin.getUserById(ownerId);
        if (userData.user?.email) {
          emailByOwner[ownerId] = userData.user.email;
        }
      } catch {
        // ignora erros de usuário não encontrado
      }
    }
  }

  const ownerByOrg: Record<string, string> = {};
  for (const o of owners ?? []) {
    if (o.org_id) ownerByOrg[o.org_id] = o.id;
  }

  const usageByOrg: Record<string, number> = {};
  for (const u of usages ?? []) {
    usageByOrg[u.org_id] = u.ai_messages_used ?? 0;
  }

  const subByOrg: Record<string, { trial_ends_at: string | null; trial_extended_count: number }> = {};
  for (const s of subs ?? []) {
    subByOrg[s.org_id] = { trial_ends_at: s.trial_ends_at, trial_extended_count: s.trial_extended_count ?? 0 };
  }

  // Montar lista de orgs com dados de trial
  const trialOrgs = (orgs ?? [])
    .map((org) => {
      const sub = subByOrg[org.id];
      const trialEndsAt = sub?.trial_ends_at ?? null;
      const daysLeft = trialEndsAt
        ? Math.ceil((new Date(trialEndsAt).getTime() - now.getTime()) / 86_400_000)
        : -999;
      const ownerId = ownerByOrg[org.id];
      const ownerEmail = ownerId ? (emailByOwner[ownerId] ?? null) : null;

      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        ownerEmail,
        trialEndsAt,
        daysLeft,
        messagesThisMonth: usageByOrg[org.id] ?? 0,
        createdAt: org.created_at,
        extendedCount: sub?.trial_extended_count ?? 0,
      };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft); // urgentes primeiro

  const stats = {
    active: trialOrgs.length,
    expiringToday: trialOrgs.filter((o) => o.daysLeft >= 0 && o.daysLeft <= 0).length,
    expiringIn3Days: trialOrgs.filter((o) => o.daysLeft >= 1 && o.daysLeft <= 3).length,
    convertedThisMonth: (converted as unknown as { count: number } | null)?.count ?? 0,
  };

  return <TrialsManager orgs={trialOrgs} stats={stats} />;
}
