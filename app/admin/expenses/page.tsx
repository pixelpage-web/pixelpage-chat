import { createAdminClient } from "@/lib/supabase/admin";
import { ExpensesManager } from "@/components/admin/expenses-manager";

export const dynamic = "force-dynamic";

export const metadata = { title: "Gastos · Admin" };

export default async function AdminExpensesPage() {
  const admin = createAdminClient();

  const [{ data: expenses }, { data: subscriptions }, { data: plans }] = await Promise.all([
    admin
      .from("business_expenses")
      .select("*")
      .order("category", { ascending: true })
      .order("name", { ascending: true }),
    // Receita mensal atual: todas as assinaturas ativas, qualquer provider —
    // mesma lógica de /admin/financeiro (mrrTotal), pra nunca divergir entre
    // os dois painéis por causa disso.
    admin
      .from("subscriptions")
      .select("plan_id")
      .eq("status", "active"),
    admin.from("plans").select("id, price_cents"),
  ]);

  const priceByPlan = new Map((plans ?? []).map((p) => [p.id, p.price_cents]));
  const revenueMonthlyCents = (subscriptions ?? []).reduce(
    (sum, s) => sum + (priceByPlan.get(s.plan_id) ?? 0),
    0
  );

  return (
    <ExpensesManager initial={expenses ?? []} revenueMonthlyCents={revenueMonthlyCents} />
  );
}
