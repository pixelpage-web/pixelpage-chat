import Link from "next/link";
import { Building2, ChevronRight, Search } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { timeAgo } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { HelpCard } from "@/components/ui/help-card";

export const metadata = { title: "Organizações · Admin" };

const statusTone: Record<string, "lime" | "ok" | "amber" | "danger" | "neutral"> = {
  trial: "lime",
  active: "ok",
  past_due: "amber",
  canceled: "danger",
};

const statusLabel: Record<string, string> = {
  trial: "Trial",
  active: "Ativa",
  past_due: "Pendente",
  canceled: "Cancelada",
};

export default async function AdminOrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const admin = createAdminClient();

  let query = admin
    .from("organizations")
    .select("id, name, slug, suspended, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (q?.trim()) {
    query = query.ilike("name", `%${q.trim()}%`);
  }

  const [{ data: orgs }, { data: subscriptions }, { data: plans }] =
    await Promise.all([
      query,
      admin.from("subscriptions").select("org_id, status, plan_id"),
      admin.from("plans").select("id, name"),
    ]);

  const planNames = new Map((plans ?? []).map((p) => [p.id, p.name]));
  const subByOrg = new Map((subscriptions ?? []).map((s) => [s.org_id, s]));

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-lg font-semibold">Organizações</h1>
          <p className="mt-0.5 text-sm text-txt-mut">
            {orgs?.length ?? 0} organização(ões)
          </p>
        </div>
        <form className="relative" action="/admin/organizations">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-txt-dim"
            aria-hidden
          />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Buscar por nome…"
            className="focus-ring h-9 w-56 rounded-lg border border-line bg-surface pl-9 pr-3 text-sm placeholder:text-txt-dim"
          />
        </form>
      </header>

      <HelpCard>
        Veja, edite plano ou entre como o cliente (impersonar) para suporte.
      </HelpCard>

      {!orgs?.length ? (
        <EmptyState
          icon={Building2}
          title={q ? "Nenhum resultado" : "Nenhuma organização ainda"}
          description={
            q
              ? `Nada encontrado para "${q}".`
              : "As organizações aparecem aqui conforme os clientes se registram."
          }
        />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
          {orgs.map((org) => {
            const sub = subByOrg.get(org.id);
            return (
              <li key={org.id}>
                <Link
                  href={`/admin/organizations/${org.id}`}
                  className="focus-ring flex items-center justify-between gap-3 bg-surface px-4 py-3 transition-colors hover:bg-surface-hover"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{org.name}</p>
                      {org.suspended && <Badge tone="danger">Suspensa</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs text-txt-dim">
                      /{org.slug} · criada {timeAgo(org.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {sub && (
                      <>
                        <span className="hidden text-xs text-txt-mut sm:inline">
                          {planNames.get(sub.plan_id) ?? "—"}
                        </span>
                        <Badge tone={statusTone[sub.status] ?? "neutral"}>
                          {statusLabel[sub.status] ?? sub.status}
                        </Badge>
                      </>
                    )}
                    <ChevronRight className="h-4 w-4 text-txt-dim" aria-hidden />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
