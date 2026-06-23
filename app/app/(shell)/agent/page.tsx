import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { AgentView } from "@/components/agent/agent-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Agente IA" };

export default async function AgentPage() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) redirect("/app/onboarding");
  const orgId = session.profile.org_id;

  const supabase = await createServerSupabase();

  // Um agente por organização — cria o padrão na primeira visita
  let { data: agent } = await supabase
    .from("agents")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!agent) {
    const { data: created } = await supabase
      .from("agents")
      .insert({
        org_id: orgId,
        name: "Assistente",
        tone_preset: "suporte",
        welcome_message: "Olá! 👋 Como posso ajudar você hoje?",
        away_message:
          "Estamos fora do horário de atendimento, mas pode deixar sua mensagem que respondemos assim que possível!",
      })
      .select("*")
      .single();
    agent = created;
  }

  if (!agent) redirect("/app/inbox");

  const [{ data: faqs }, { data: org }, { data: knowledge }] = await Promise.all([
    supabase
      .from("agent_faqs")
      .select("*")
      .eq("agent_id", agent.id)
      .order("position", { ascending: true }),
    supabase.from("organizations").select("name").eq("id", orgId).maybeSingle(),
    supabase
      .from("agent_knowledge")
      .select("*")
      .eq("agent_id", agent.id)
      .order("created_at", { ascending: true }),
  ]);

  return (
    <AgentView
      initialAgent={agent}
      initialFaqs={faqs ?? []}
      initialKnowledge={knowledge ?? []}
      orgName={org?.name ?? ""}
    />
  );
}
