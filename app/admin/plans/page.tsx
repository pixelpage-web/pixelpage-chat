import { createAdminClient } from "@/lib/supabase/admin";
import { PlansManager } from "@/components/admin/plans-manager";
import { HelpCard } from "@/components/ui/help-card";

export const metadata = { title: "Planos · Admin" };

export default async function AdminPlansPage() {
  const admin = createAdminClient();
  const { data: plans } = await admin
    .from("plans")
    .select("*")
    .order("ai_messages_limit", { ascending: true });

  return (
    <>
      <div className="mx-auto max-w-4xl px-4 pt-4 sm:px-6">
        <HelpCard>
          Edite preços e limites sem código. Afeta novos clientes imediatamente.
        </HelpCard>
      </div>
      <PlansManager initialPlans={plans ?? []} />
    </>
  );
}
