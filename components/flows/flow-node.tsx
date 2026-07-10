"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { Check, X, type LucideIcon } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { nodeMeta } from "./node-meta";
import type { FlowNodeData, FlowNodeType } from "@/lib/flow-types";

/**
 * Renderizador único dos blocos do canvas. O conteúdo do corpo e as saídas
 * (handles) variam por tipo: condição tem Sim/Não, menu tem uma saída por
 * opção, mensagem tem uma saída por botão + saída padrão.
 */

/** data.__error é injetado pelo editor quando a validação aponta problema. */
export type EditorNodeData = FlowNodeData & { __error?: boolean };

function summaryText(type: FlowNodeType, data: FlowNodeData, t: (s: string) => string): string {
  switch (type) {
    case "start":
      return t("O fluxo começa aqui quando o cliente manda mensagem.");
    case "message":
      return data.text?.trim() || t("Clique para escrever a mensagem…");
    case "question":
      return data.question?.trim() || t("Clique para escrever a pergunta…");
    case "condition":
      return data.keywords?.trim()
        ? `${t("Se contiver:")} ${data.keywords}`
        : t("Clique para definir as palavras…");
    case "menu":
      return data.menuTitle?.trim() || t("Clique para montar o menu…");
    case "ai":
      return data.aiInstructions?.trim() || t("Clique para instruir a IA…");
    case "handoff":
      return data.handoffMessage?.trim() || t("Transfere para sua equipe.");
    case "tag":
      return data.tag?.trim() ? `🏷️ ${data.tag}` : t("Clique para definir a etiqueta…");
    case "csat":
      return t("Pede a nota de 1 a 5 ao cliente.");
    case "transfer_unit":
      return data.unitId?.trim()
        ? t("🏢 Transfere a conversa para a unidade escolhida.")
        : t("Clique para escolher a unidade…");
    case "wait": {
      const unitLabel: Record<string, string> = {
        minutes: t("minutos"),
        hours: t("horas"),
        days: t("dias"),
      };
      return data.waitAmount
        ? `⏳ ${data.waitAmount} ${unitLabel[data.waitUnit ?? "minutes"]}`
        : t("Clique para definir o tempo…");
    }
    case "end":
      return data.endMessage?.trim() || t("Encerra e marca como resolvida.");
    default:
      return "";
  }
}

/** Saídas nomeadas (rótulo + handle) exibidas na parte de baixo do bloco. */
function namedOutputs(
  type: FlowNodeType,
  data: FlowNodeData,
  t: (s: string) => string
): { handle: string; label: string; icon?: LucideIcon }[] {
  if (type === "condition") {
    return [
      { handle: "yes", label: t("Sim"), icon: Check },
      { handle: "no", label: t("Não"), icon: X },
    ];
  }
  if (type === "menu") {
    return (data.options ?? [])
      .map((o, i) => ({ handle: `opt-${i}`, label: `${i + 1}. ${o || "…"}` }))
      .slice(0, 10);
  }
  if (type === "message") {
    return (data.buttons ?? [])
      .filter((b) => b.trim())
      .map((b, i) => ({ handle: `btn-${i}`, label: `🔘 ${b}` }))
      .slice(0, 3);
  }
  return [];
}

/** Tipos sem saída padrão "out" (terminais ou só saídas nomeadas). */
const noDefaultOut: FlowNodeType[] = ["handoff", "end", "condition", "menu"];

function FlowNodeComponent({ type, data, selected }: NodeProps<EditorNodeData>) {
  const t = useT();
  const nodeType = (type ?? "message") as FlowNodeType;
  const meta = nodeMeta[nodeType];
  const Icon = meta.icon;
  const outputs = namedOutputs(nodeType, data, t);
  const hasDefaultOut = !noDefaultOut.includes(nodeType);

  return (
    <div
      className={cn(
        "w-56 rounded-xl border bg-surface shadow-pop transition-shadow",
        selected ? "border-lime/70 shadow-glow" : "border-line",
        data.__error && "animate-pulse border-danger"
      )}
      style={{ borderLeftWidth: 3, borderLeftColor: data.__error ? "#EF4444" : meta.accent }}
    >
      {/* Entrada (todos menos o Início) */}
      {nodeType !== "start" && (
        <Handle
          type="target"
          position={Position.Left}
          id="in"
          className="!h-3 !w-3 !border-2 !border-ink !bg-txt-mut"
        />
      )}

      {/* Cabeçalho */}
      <div
        className="flex items-center gap-2 rounded-t-xl px-3 py-2"
        style={{ backgroundColor: meta.soft }}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: meta.accent }} aria-hidden />
        <p className="truncate text-xs font-semibold text-txt">{t(meta.label)}</p>
      </div>

      {/* Corpo: resumo da configuração */}
      <p className="line-clamp-3 px-3 py-2 text-[11px] leading-relaxed text-txt-mut">
        {summaryText(nodeType, data, t)}
      </p>

      {/* Saídas nomeadas (condição / menu / botões) */}
      {outputs.length > 0 && (
        <div className="space-y-1 border-t border-line px-0 py-1.5">
          {outputs.map((o) => (
            <div key={o.handle} className="relative flex items-center justify-end gap-1 pr-4">
              {o.icon && <o.icon className="h-2.5 w-2.5 shrink-0 text-txt-dim" aria-hidden />}
              <span className="truncate pl-3 text-[10px] text-txt-dim">{o.label}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={o.handle}
                className="!h-2.5 !w-2.5 !border-2 !border-ink !bg-lime"
                style={{ position: "absolute", right: -5, top: "50%" }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Saída padrão */}
      {hasDefaultOut && (
        <Handle
          type="source"
          position={Position.Right}
          id="out"
          className="!h-3 !w-3 !border-2 !border-ink !bg-lime"
        />
      )}
    </div>
  );
}

export const FlowNodeRenderer = memo(FlowNodeComponent);
