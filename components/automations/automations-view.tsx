"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { AutomationAction, TriggerConfig } from "@/lib/automations";
import type {
  AutomationRuleRow,
  AutomationTriggerType,
  Json,
} from "@/types/database";

/**
 * Página /app/automations — regras SE → ENTÃO.
 * Lista com toggle ativo/inativo + modal de criação/edição + exemplos prontos.
 */

export interface AutomationOption {
  id: string;
  name: string;
}

interface TriggerMeta {
  value: AutomationTriggerType;
  label: string;
  hint: string;
}

const triggerMeta: TriggerMeta[] = [
  {
    value: "message_received",
    label: "Nova mensagem recebida",
    hint: "Toda vez que um cliente enviar uma mensagem",
  },
  {
    value: "keyword_match",
    label: "Mensagem contém palavra específica",
    hint: "Quando o cliente escrever algo específico",
  },
  {
    value: "no_response",
    label: "Conversa sem resposta por X horas",
    hint: "Quando ninguém da sua equipe responder dentro do prazo",
  },
  {
    value: "outside_hours",
    label: "Fora do horário de funcionamento",
    hint: "Quando chegar mensagem fora do horário configurado na conexão",
  },
  {
    value: "new_conversation",
    label: "Nova conversa iniciada (primeiro contato)",
    hint: "Quando alguém enviar mensagem pela primeira vez",
  },
  {
    value: "conversation_resolved",
    label: "Conversa resolvida",
    hint: "Quando um atendimento for marcado como finalizado",
  },
];

interface ActionMeta {
  type: AutomationAction["type"];
  label: string;
  hint: string;
}

const actionMeta: ActionMeta[] = [
  {
    type: "send_message",
    label: "Enviar mensagem automática",
    hint: "Esta mensagem será enviada automaticamente para o cliente.",
  },
  {
    type: "assign_agent",
    label: "Atribuir conversa para agente",
    hint: "A conversa será transferida automaticamente para este agente.",
  },
  {
    type: "add_tag",
    label: "Adicionar etiqueta",
    hint: "A conversa receberá esta etiqueta automaticamente.",
  },
  {
    type: "start_flow",
    label: "Ativar fluxo",
    hint: "O bot vai iniciar este fluxo de conversa automaticamente.",
  },
  {
    type: "notify_email",
    label: "Notificar equipe por email",
    hint: "Todos os membros da equipe receberão um email de alerta.",
  },
  {
    type: "pause_bot",
    label: "Pausar bot nesta conversa",
    hint: "O bot para de responder e aguarda atendimento humano.",
  },
  {
    type: "send_csat",
    label: "Enviar pesquisa de satisfação (CSAT)",
    hint: "Envia a pesquisa configurada na conexão para o cliente avaliar.",
  },
];

/** Descrição automática do card: "Quando X → Y". */
function describeRule(rule: AutomationRuleRow, t: (s: string) => string): string {
  const trigger = triggerMeta.find((m) => m.value === rule.trigger_type);
  const actions = (
    Array.isArray(rule.actions) ? rule.actions : []
  ) as unknown as AutomationAction[];
  const actionLabels = actions
    .map((a) => actionMeta.find((m) => m.type === a.type)?.label)
    .filter(Boolean)
    .map((l) => t(l!).toLowerCase());
  return `${t("Quando")} ${t(trigger?.label ?? rule.trigger_type).toLowerCase()} → ${
    actionLabels.length > 0 ? actionLabels.join(" + ") : t("nenhuma ação")
  }`;
}

interface PresetRule {
  title: string;
  description: string;
  emoji: string;
  rule: {
    name: string;
    trigger_type: AutomationTriggerType;
    trigger_config: TriggerConfig;
    actions: AutomationAction[];
  };
}

const presets: PresetRule[] = [
  {
    title: "Mensagem de ausência",
    description: "Fora do horário → enviar mensagem automática",
    emoji: "🌙",
    rule: {
      name: "Mensagem de ausência",
      trigger_type: "outside_hours",
      trigger_config: {},
      actions: [
        {
          type: "send_message",
          message:
            "Nosso horário de atendimento é de segunda a sexta, das 8h às 18h. Retornaremos assim que possível! 😊",
        },
      ],
    },
  },
  {
    title: "Alerta de cliente ignorado",
    description: "Sem resposta há 2h → notificar equipe",
    emoji: "🔔",
    rule: {
      name: "Alerta de cliente ignorado",
      trigger_type: "no_response",
      trigger_config: { hours: 2 },
      actions: [{ type: "notify_email" }],
    },
  },
  {
    title: "Etiquetar reclamações",
    description: 'Contém "cancelar, reclamação…" → etiqueta + atribuir',
    emoji: "🏷️",
    rule: {
      name: "Etiquetar reclamações",
      trigger_type: "keyword_match",
      trigger_config: { keywords: "cancelar, reclamação, insatisfeito" },
      actions: [{ type: "add_tag", tag: "reclamação" }, { type: "assign_agent" }],
    },
  },
  {
    title: "CSAT ao finalizar",
    description: "Conversa resolvida → enviar pesquisa CSAT",
    emoji: "⭐",
    rule: {
      name: "CSAT ao finalizar",
      trigger_type: "conversation_resolved",
      trigger_config: {},
      actions: [{ type: "send_csat" }],
    },
  },
];

interface EditorState {
  id: string | null;
  name: string;
  trigger_type: AutomationTriggerType;
  trigger_config: TriggerConfig;
  actions: AutomationAction[];
  connection_id: string | null;
}

const emptyEditor: EditorState = {
  id: null,
  name: "",
  trigger_type: "message_received",
  trigger_config: {},
  actions: [{ type: "send_message", message: "" }],
  connection_id: null,
};

export function AutomationsView({
  orgId,
  initialRules,
  connections,
  team,
  flows,
  existingTags,
}: {
  orgId: string;
  initialRules: AutomationRuleRow[];
  connections: AutomationOption[];
  team: AutomationOption[];
  flows: AutomationOption[];
  existingTags: string[];
}) {
  const t = useT();
  const supabase = useMemo(() => createClient(), []);
  const [rules, setRules] = useState(initialRules);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);

  function openPreset(preset: PresetRule) {
    setEditor({
      id: null,
      name: preset.rule.name,
      trigger_type: preset.rule.trigger_type,
      trigger_config: { ...preset.rule.trigger_config },
      actions: preset.rule.actions.map((a) => ({ ...a })),
      connection_id: null,
    });
  }

  function openEdit(rule: AutomationRuleRow) {
    setEditor({
      id: rule.id,
      name: rule.name,
      trigger_type: rule.trigger_type,
      trigger_config: { ...((rule.trigger_config ?? {}) as TriggerConfig) },
      actions: (
        (Array.isArray(rule.actions) ? rule.actions : []) as unknown as AutomationAction[]
      ).map((a) => ({ ...a })),
      connection_id: rule.connection_id,
    });
  }

  async function handleToggle(rule: AutomationRuleRow) {
    const next = !rule.active;
    setRules((prev) =>
      prev.map((r) => (r.id === rule.id ? { ...r, active: next } : r))
    );
    const { error } = await supabase
      .from("automation_rules")
      .update({ active: next })
      .eq("id", rule.id);
    if (error) {
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, active: !next } : r))
      );
      toast.error(t("Não foi possível atualizar a regra."));
    }
  }

  async function handleDelete(rule: AutomationRuleRow) {
    if (!window.confirm(t("Excluir esta automação?"))) return;
    const { error } = await supabase
      .from("automation_rules")
      .delete()
      .eq("id", rule.id);
    if (error) {
      toast.error(t("Não foi possível excluir a regra."));
      return;
    }
    setRules((prev) => prev.filter((r) => r.id !== rule.id));
    toast.success(t("Automação excluída."));
  }

  async function handleSave() {
    if (!editor) return;
    if (!editor.name.trim()) {
      toast.error(t("Dê um nome para a regra."));
      return;
    }
    const hasIncompleteAssignAgent = editor.actions.some(
      (a) => a.type === "assign_agent" && !a.agent_id
    );
    if (hasIncompleteAssignAgent) {
      toast.error(t("Selecione um agente para atribuir"));
      return;
    }
    const validActions = editor.actions.filter((a) => {
      if (a.type === "send_message") return !!a.message?.trim();
      if (a.type === "assign_agent") return !!a.agent_id;
      if (a.type === "add_tag") return !!a.tag?.trim();
      if (a.type === "start_flow") return !!a.flow_id;
      return true;
    });
    if (validActions.length === 0) {
      toast.error(t("Adicione e preencha pelo menos uma ação."));
      return;
    }
    if (
      editor.trigger_type === "keyword_match" &&
      !editor.trigger_config.keywords?.trim()
    ) {
      toast.error(t("Informe as palavras que disparam a regra."));
      return;
    }
    if (
      editor.trigger_type === "no_response" &&
      (!editor.trigger_config.hours || editor.trigger_config.hours <= 0)
    ) {
      toast.error(t("Informe o número de horas sem resposta."));
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: editor.name.trim(),
        trigger_type: editor.trigger_type,
        trigger_config: editor.trigger_config as unknown as Json,
        actions: validActions as unknown as Json,
        connection_id: editor.connection_id,
      };
      if (editor.id) {
        const { data, error } = await supabase
          .from("automation_rules")
          .update(payload)
          .eq("id", editor.id)
          .select("*")
          .single();
        if (error || !data) throw new Error(error?.message);
        setRules((prev) => prev.map((r) => (r.id === editor.id ? data : r)));
      } else {
        const { data, error } = await supabase
          .from("automation_rules")
          .insert({ ...payload, org_id: orgId, active: true })
          .select("*")
          .single();
        if (error || !data) throw new Error(error?.message);
        setRules((prev) => [data, ...prev]);
      }
      toast.success(t("Automação salva!"));
      setEditor(null);
    } catch {
      toast.error(t("Não foi possível salvar a automação."));
    } finally {
      setSaving(false);
    }
  }

  function updateAction(index: number, patch: Partial<AutomationAction>) {
    setEditor((prev) => {
      if (!prev) return prev;
      const actions = [...prev.actions];
      actions[index] = { ...actions[index], ...patch };
      return { ...prev, actions };
    });
  }

  const currentTrigger = editor
    ? triggerMeta.find((m) => m.value === editor.trigger_type)
    : null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-lg font-semibold">{t("Automações")}</h1>
            <p className="mt-0.5 max-w-xl text-sm text-txt-mut">
              {t("Crie regras automáticas para o sistema agir sem você precisar fazer nada. Por exemplo: enviar mensagem fora do horário de funcionamento, ou avisar sua equipe quando um cliente não for respondido.")}
            </p>
          </div>
          <Button onClick={() => setEditor({ ...emptyEditor, actions: [{ type: "send_message", message: "" }] })}>
            <Plus className="h-4 w-4" aria-hidden />
            {t("Criar automação")}
          </Button>
        </header>

        {/* Exemplos pré-prontos */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-txt-dim">
            {t("Comece com um exemplo pronto")}
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {presets.map((preset) => (
              <button
                key={preset.title}
                onClick={() => openPreset(preset)}
                className="focus-ring rounded-lg border border-line bg-surface-raised p-3 text-left transition-colors hover:border-lime/40"
              >
                <p aria-hidden>{preset.emoji}</p>
                <p className="mt-1 text-xs font-semibold">{t(preset.title)}</p>
                <p className="mt-0.5 text-[10px] leading-snug text-txt-dim">
                  {t(preset.description)}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Lista de regras */}
        {rules.length === 0 ? (
          <EmptyState
            icon={Zap}
            title={t("Nenhuma automação ainda")}
            description={t("Use um exemplo pronto acima ou crie uma regra do zero — o sistema passa a agir sozinho por você.")}
          />
        ) : (
          <div className="space-y-3">
            {rules.map((rule) => (
              <Card key={rule.id} className={cn(!rule.active && "opacity-60")}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-lime-soft">
                      <Zap className="h-5 w-5 text-lime" aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{rule.name}</p>
                      <p className="truncate text-xs text-txt-dim">
                        {describeRule(rule, t)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={rule.active}
                      onChange={() => void handleToggle(rule)}
                      label={`${t("Ativar")} ${rule.name}`}
                    />
                    <Button size="sm" variant="secondary" onClick={() => openEdit(rule)}>
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                      {t("Editar")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-txt-dim hover:text-danger"
                      onClick={() => void handleDelete(rule)}
                      aria-label={t("Excluir automação")}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Modal criar/editar */}
      <Modal
        open={editor !== null}
        onClose={() => setEditor(null)}
        title={editor?.id ? t("Editar automação") : t("Nova automação")}
        className="max-h-[88dvh] max-w-xl overflow-y-auto"
      >
        {editor && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="rule-name">{t("Nome da regra")}</Label>
              <Input
                id="rule-name"
                value={editor.name}
                onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                placeholder={t("Aviso fora do horário")}
              />
            </div>

            {connections.length > 1 && (
              <div>
                <Label>{t("Aplicar em")}</Label>
                <Select
                  value={editor.connection_id ?? ""}
                  onChange={(e) =>
                    setEditor({ ...editor, connection_id: e.target.value || null })
                  }
                >
                  <option value="">{t("Todas as conexões")}</option>
                  {connections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            {/* Trigger */}
            <div className="rounded-lg border border-line bg-ink p-3.5">
              <Label>{t("Quando acontecer…")}</Label>
              <Select
                value={editor.trigger_type}
                onChange={(e) =>
                  setEditor({
                    ...editor,
                    trigger_type: e.target.value as AutomationTriggerType,
                    trigger_config: {},
                  })
                }
              >
                {triggerMeta.map((m) => (
                  <option key={m.value} value={m.value}>
                    {t(m.label)}
                  </option>
                ))}
              </Select>
              {currentTrigger && (
                <p className="mt-1.5 text-[11px] text-txt-dim">{t(currentTrigger.hint)}</p>
              )}

              {editor.trigger_type === "keyword_match" && (
                <div className="mt-3">
                  <Label>{t("Palavras (separadas por vírgula)")}</Label>
                  <Input
                    value={editor.trigger_config.keywords ?? ""}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        trigger_config: { ...editor.trigger_config, keywords: e.target.value },
                      })
                    }
                    placeholder="cancelar, reembolso, reclamação, insatisfeito"
                  />
                </div>
              )}

              {editor.trigger_type === "no_response" && (
                <div className="mt-3">
                  <Label>{t("Horas sem resposta")}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={168}
                    value={editor.trigger_config.hours ?? ""}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        trigger_config: {
                          ...editor.trigger_config,
                          hours: Number(e.target.value) || 0,
                        },
                      })
                    }
                    placeholder="2"
                    className="w-28"
                  />
                </div>
              )}
            </div>

            {/* Ações */}
            <div className="rounded-lg border border-line bg-ink p-3.5">
              <Label>{t("Então fazer…")}</Label>
              <div className="space-y-3">
                {editor.actions.map((action, i) => {
                  const meta = actionMeta.find((m) => m.type === action.type);
                  return (
                    <div key={i} className="rounded-lg border border-line bg-surface p-3">
                      <div className="flex items-center gap-2">
                        <Select
                          value={action.type}
                          onChange={(e) =>
                            updateAction(i, {
                              type: e.target.value as AutomationAction["type"],
                              message: undefined,
                              agent_id: undefined,
                              tag: undefined,
                              flow_id: undefined,
                            })
                          }
                          className="h-9 flex-1"
                        >
                          {actionMeta.map((m) => (
                            <option key={m.type} value={m.type}>
                              {t(m.label)}
                            </option>
                          ))}
                        </Select>
                        {editor.actions.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 shrink-0 text-txt-dim hover:text-danger"
                            onClick={() =>
                              setEditor({
                                ...editor,
                                actions: editor.actions.filter((_, j) => j !== i),
                              })
                            }
                            aria-label={t("Remover ação")}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                      {meta && (
                        <p className="mt-1.5 text-[11px] text-txt-dim">{t(meta.hint)}</p>
                      )}

                      {action.type === "send_message" && (
                        <Textarea
                          rows={3}
                          className="mt-2"
                          value={action.message ?? ""}
                          onChange={(e) => updateAction(i, { message: e.target.value })}
                          placeholder={t("Nosso horário de atendimento é de segunda a sexta, das 8h às 18h. Retornaremos assim que possível! 😊")}
                        />
                      )}

                      {action.type === "assign_agent" && (
                        <Select
                          className="mt-2"
                          value={action.agent_id ?? ""}
                          onChange={(e) => updateAction(i, { agent_id: e.target.value })}
                        >
                          <option value="">{t("Escolha um agente…")}</option>
                          {team.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </Select>
                      )}

                      {action.type === "add_tag" && (
                        <>
                          <Input
                            className="mt-2"
                            list={`tags-${i}`}
                            value={action.tag ?? ""}
                            onChange={(e) => updateAction(i, { tag: e.target.value })}
                            placeholder="reclamação"
                          />
                          <datalist id={`tags-${i}`}>
                            {existingTags.map((tag) => (
                              <option key={tag} value={tag} />
                            ))}
                          </datalist>
                        </>
                      )}

                      {action.type === "start_flow" &&
                        (flows.length > 0 ? (
                          <Select
                            className="mt-2"
                            value={action.flow_id ?? ""}
                            onChange={(e) => updateAction(i, { flow_id: e.target.value })}
                          >
                            <option value="">{t("Escolha um fluxo publicado…")}</option>
                            {flows.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.name}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <p className="mt-2 rounded-md border border-amber/25 bg-amber-soft px-2.5 py-1.5 text-[11px] text-amber">
                            {t("Você ainda não tem fluxo publicado. Crie e publique um em Fluxos.")}
                          </p>
                        ))}
                    </div>
                  );
                })}
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={() =>
                  setEditor({
                    ...editor,
                    actions: [...editor.actions, { type: "send_message", message: "" }],
                  })
                }
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                {t("Adicionar ação")}
              </Button>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditor(null)}>
                {t("Cancelar")}
              </Button>
              <Button onClick={() => void handleSave()} loading={saving}>
                {t("Salvar automação")}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
