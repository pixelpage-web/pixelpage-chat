"use client";

import { useState } from "react";
import { Bot, GraduationCap, MessageCircleQuestion, PlayCircle } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { AgentForm } from "./agent-form";
import { FaqEditor } from "./faq-editor";
import { KnowledgeManager } from "./knowledge-manager";
import { Simulator } from "./simulator";
import type { AgentFaqRow, AgentKnowledgeListRow, AgentRow } from "@/types/database";

type Tab = "config" | "faq" | "knowledge" | "simulator";

const tabs: { value: Tab; label: string; icon: typeof Bot }[] = [
  { value: "config", label: "Configuração", icon: Bot },
  { value: "faq", label: "FAQ", icon: MessageCircleQuestion },
  { value: "knowledge", label: "Ensine sua IA", icon: GraduationCap },
  { value: "simulator", label: "Simulador", icon: PlayCircle },
];

export function AgentView({
  initialAgent,
  initialFaqs,
  initialKnowledge,
  orgName,
}: {
  initialAgent: AgentRow;
  initialFaqs: AgentFaqRow[];
  initialKnowledge: AgentKnowledgeListRow[];
  orgName: string;
}) {
  const t = useT();
  const [agent, setAgent] = useState(initialAgent);
  const [tab, setTab] = useState<Tab>("config");

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="border-b border-line px-4 py-4 sm:px-6">
        <h1 className="font-display text-lg font-semibold">{t("Agente IA")}</h1>
        <p className="mt-0.5 text-sm text-txt-mut">
          {t("Configure a personalidade do bot e teste no simulador — antes mesmo de conectar o WhatsApp.")}
        </p>
        {/* Abas — mobile e telas médias */}
        <nav className="mt-3 flex gap-1 xl:hidden">
          {tabs.map((item) => (
            <button
              key={item.value}
              onClick={() => setTab(item.value)}
              className={cn(
                "focus-ring flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                tab === item.value
                  ? "bg-surface-raised text-txt"
                  : "text-txt-dim hover:bg-surface-raised hover:text-txt"
              )}
            >
              <item.icon className="h-3.5 w-3.5" aria-hidden />
              {t(item.label)}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Telas largas: configuração + FAQ à esquerda, simulador fixo à direita */}
        <div className="hidden min-w-0 flex-1 overflow-y-auto p-6 xl:block">
          <div className="mx-auto max-w-2xl space-y-8">
            <AgentForm agent={agent} onChange={setAgent} />
            <KnowledgeManager agentId={agent.id} initialKnowledge={initialKnowledge} />
            <FaqEditor agentId={agent.id} initialFaqs={initialFaqs} />
          </div>
        </div>
        <aside className="hidden w-[400px] shrink-0 border-l border-line xl:flex">
          <Simulator agent={agent} orgName={orgName} />
        </aside>

        {/* Telas menores: conteúdo por aba */}
        <div className="min-w-0 flex-1 overflow-y-auto xl:hidden">
          {tab === "config" && (
            <div className="mx-auto max-w-2xl p-4 sm:p-6">
              <AgentForm agent={agent} onChange={setAgent} />
            </div>
          )}
          {tab === "faq" && (
            <div className="mx-auto max-w-2xl p-4 sm:p-6">
              <FaqEditor agentId={agent.id} initialFaqs={initialFaqs} />
            </div>
          )}
          {tab === "knowledge" && (
            <div className="mx-auto max-w-2xl p-4 sm:p-6">
              <KnowledgeManager agentId={agent.id} initialKnowledge={initialKnowledge} />
            </div>
          )}
          {tab === "simulator" && (
            <div className="h-full">
              <Simulator agent={agent} orgName={orgName} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
