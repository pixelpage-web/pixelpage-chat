"use client";

import { Plus, Trash2, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { nodeMeta } from "./node-meta";
import type { EditorNodeData } from "./flow-node";
import type { FlowNodeType, WaitUnit } from "@/lib/flow-types";

/**
 * Painel direito de configuração do bloco selecionado.
 * Padrão dos formulários: label + subtexto explicativo + placeholder real.
 */

export interface TeamOption {
  id: string;
  name: string;
}

export interface UnitOption {
  id: string;
  name: string;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label>{label}</Label>
      {hint && <p className="-mt-0.5 mb-1.5 text-[11px] leading-snug text-txt-dim">{hint}</p>}
      {children}
    </div>
  );
}

export function NodeConfigPanel({
  nodeId,
  nodeType,
  data,
  team,
  units,
  onChange,
  onDelete,
  onClose,
}: {
  nodeId: string;
  nodeType: FlowNodeType;
  data: EditorNodeData;
  team: TeamOption[];
  units: UnitOption[];
  onChange: (patch: Partial<EditorNodeData>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const meta = nodeMeta[nodeType];
  const Icon = meta.icon;

  function updateList(key: "buttons" | "options", index: number, value: string) {
    const list = [...(data[key] ?? [])];
    list[index] = value;
    onChange({ [key]: list });
  }

  function removeFromList(key: "buttons" | "options", index: number) {
    const list = [...(data[key] ?? [])];
    list.splice(index, 1);
    onChange({ [key]: list });
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <Icon className="h-4 w-4 shrink-0" style={{ color: meta.accent }} aria-hidden />
        <h2 className="flex-1 truncate font-display text-sm font-semibold">{t(meta.label)}</h2>
        <button
          onClick={onClose}
          className="focus-ring rounded-md p-1 text-txt-mut hover:bg-surface-hover hover:text-txt"
          aria-label={t("Fechar painel")}
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <p className="rounded-lg border border-line bg-ink px-3 py-2 text-[11px] leading-relaxed text-txt-dim">
          {t(meta.description)}
        </p>

        {nodeType === "start" && (
          <p className="text-xs text-txt-mut">
            {t("O Início não tem configuração. Conecte a saída dele ao primeiro bloco do seu atendimento.")}
          </p>
        )}

        {nodeType === "message" && (
          <>
            <Field
              label={t("Texto da mensagem")}
              hint={t("Digite o que o bot vai enviar. Use {nome} para incluir o nome do cliente automaticamente.")}
            >
              <Textarea
                rows={4}
                value={data.text ?? ""}
                onChange={(e) => onChange({ text: e.target.value })}
                placeholder="Olá, {nome}! Bem-vindo à nossa empresa. Como posso ajudar? 😊"
              />
            </Field>
            <Field
              label={t("Botões de resposta rápida (opcional, até 3)")}
              hint={t("Botões facilitam a vida do cliente — ele só clica em vez de digitar. Use para as opções mais comuns. Cada botão conecta para um bloco diferente no canvas.")}
            >
              <div className="space-y-2">
                {(data.buttons ?? []).map((b, i) => (
                  <div key={i} className="flex gap-1.5">
                    <Input
                      value={b}
                      onChange={(e) => updateList("buttons", i, e.target.value)}
                      placeholder={`${t("Botão")} ${i + 1}`}
                      className="h-9"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 text-txt-dim hover:text-danger"
                      onClick={() => removeFromList("buttons", i)}
                      aria-label={t("Remover botão")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                {(data.buttons ?? []).length < 3 && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => onChange({ buttons: [...(data.buttons ?? []), ""] })}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    {t("Adicionar botão")}
                  </Button>
                )}
              </div>
            </Field>
          </>
        )}

        {nodeType === "question" && (
          <>
            <Field
              label={t("Pergunta")}
              hint={t("O bot envia esta pergunta e aguarda a resposta do cliente antes de continuar.")}
            >
              <Textarea
                rows={3}
                value={data.question ?? ""}
                onChange={(e) => onChange({ question: e.target.value })}
                placeholder={t("Qual é o seu nome completo?")}
              />
            </Field>
            <Field
              label={t("Salvar resposta como")}
              hint={t("Dê um nome para guardar o que o cliente responder. Você vai poder usar este dado nos próximos blocos com {nome_da_variavel}.")}
            >
              <Input
                value={data.variable ?? ""}
                onChange={(e) =>
                  onChange({
                    variable: e.target.value
                      .toLowerCase()
                      .replace(/\s+/g, "_")
                      .replace(/[^\p{L}\p{N}_]/gu, ""),
                  })
                }
                placeholder="nome_cliente"
              />
            </Field>
            <Field
              label={t("Tipo de resposta")}
              hint={t("Se o cliente responder algo diferente do esperado, o bot pede para repetir.")}
            >
              <Select
                value={data.answerType ?? "text"}
                onChange={(e) =>
                  onChange({ answerType: e.target.value as EditorNodeData["answerType"] })
                }
              >
                <option value="text">{t("Qualquer texto")}</option>
                <option value="number">{t("Número")}</option>
                <option value="email">Email</option>
                <option value="date">{t("Data")}</option>
              </Select>
            </Field>
          </>
        )}

        {nodeType === "condition" && (
          <Field
            label={t("Se a mensagem contiver")}
            hint={t("Palavras que ativam o caminho 'Sim'. Separe várias palavras com vírgula.")}
          >
            <Textarea
              rows={3}
              value={data.keywords ?? ""}
              onChange={(e) => onChange({ keywords: e.target.value })}
              placeholder="cancelar, cancela, quero cancelar, desistir"
            />
          </Field>
        )}

        {nodeType === "menu" && (
          <>
            <Field label={t("Título do menu")}>
              <Input
                value={data.menuTitle ?? ""}
                onChange={(e) => onChange({ menuTitle: e.target.value })}
                placeholder={t("Escolha uma das opções abaixo:")}
              />
            </Field>
            <Field
              label={t("Opções (até 10)")}
              hint={t("O cliente escolhe digitando o número ou clicando na opção. Cada opção conecta para um bloco no canvas.")}
            >
              <div className="space-y-2">
                {(data.options ?? []).map((o, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="w-5 shrink-0 text-center text-xs text-txt-dim">{i + 1}.</span>
                    <Input
                      value={o}
                      onChange={(e) => updateList("options", i, e.target.value)}
                      placeholder={`${t("Opção")} ${i + 1}`}
                      className="h-9"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 text-txt-dim hover:text-danger"
                      onClick={() => removeFromList("options", i)}
                      aria-label={t("Remover opção")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                {(data.options ?? []).length < 10 && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => onChange({ options: [...(data.options ?? []), ""] })}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    {t("Adicionar opção")}
                  </Button>
                )}
              </div>
            </Field>
          </>
        )}

        {nodeType === "ai" && (
          <>
            <Field
              label={t("Como a IA deve se comportar aqui")}
              hint={t("Explique para a IA o que ela deve fazer neste ponto da conversa. Seja específico — quanto mais detalhe, melhor a resposta.")}
            >
              <Textarea
                rows={5}
                value={data.aiInstructions ?? ""}
                onChange={(e) => onChange({ aiInstructions: e.target.value })}
                placeholder={t("Responda dúvidas sobre horários e valores da clínica. Seja simpático. Se o cliente quiser agendar, peça nome, data e procedimento desejado.")}
              />
            </Field>
            <Field
              label={t("Quando continuar para o próximo bloco")}
              hint={t("Define quando o fluxo passa para o próximo passo.")}
            >
              <Select
                value={data.aiContinue ?? "always"}
                onChange={(e) =>
                  onChange({ aiContinue: e.target.value as EditorNodeData["aiContinue"] })
                }
              >
                <option value="always">{t("Sempre avança após responder")}</option>
                <option value="await_confirm">{t("Aguarda o cliente confirmar")}</option>
                <option value="never">{t("Nunca — fica neste bloco até handoff")}</option>
              </Select>
            </Field>
          </>
        )}

        {nodeType === "handoff" && (
          <>
            <Field
              label={t("Mensagem antes de transferir")}
              hint={t("O bot envia esta mensagem para o cliente antes de transferir o atendimento.")}
            >
              <Textarea
                rows={3}
                value={data.handoffMessage ?? ""}
                onChange={(e) => onChange({ handoffMessage: e.target.value })}
                placeholder={t("Vou te conectar com um atendente. Um momento! 👋")}
              />
            </Field>
            <Field
              label={t("Atribuir para")}
              hint={t("Escolha quem vai receber esta conversa. 'Qualquer disponível' distribui para o primeiro agente livre.")}
            >
              <Select
                value={data.assignTo ?? ""}
                onChange={(e) => onChange({ assignTo: e.target.value || null })}
              >
                <option value="">{t("Qualquer disponível")}</option>
                {team.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex items-start justify-between gap-3 rounded-lg border border-line bg-ink p-3">
              <div>
                <p className="text-xs font-medium text-txt">
                  {t("Gerar resumo automático para o agente")}
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-txt-dim">
                  {t("A IA cria um resumo da conversa para o atendente ler antes de responder. Recomendamos deixar ativado.")}
                </p>
              </div>
              <Switch
                checked={data.generateSummary !== false}
                onChange={(v) => onChange({ generateSummary: v })}
                label={t("Gerar resumo automático")}
              />
            </div>
          </>
        )}

        {nodeType === "tag" && (
          <Field
            label={t("Etiqueta")}
            hint={t("Marca esta conversa com uma etiqueta para filtrar depois no inbox.")}
          >
            <Input
              value={data.tag ?? ""}
              onChange={(e) => onChange({ tag: e.target.value })}
              placeholder="lead-quente"
            />
          </Field>
        )}

        {nodeType === "csat" && (
          <p className="text-xs leading-relaxed text-txt-mut">
            {t("Sem configuração — envia automaticamente a mensagem de CSAT definida nas configurações da conexão WhatsApp.")}
          </p>
        )}

        {nodeType === "transfer_unit" && (
          <>
            {units.length === 0 ? (
              <p className="text-xs leading-relaxed text-txt-mut">
                {t("Você ainda não criou nenhuma unidade. Crie unidades em Configurações → Unidades para poder usar este bloco.")}
              </p>
            ) : (
              <Field
                label={t("Unidade de destino")}
                hint={t("A equipe vinculada a essa unidade passa a ver esta conversa no inbox.")}
              >
                <Select
                  value={data.unitId ?? ""}
                  onChange={(e) => onChange({ unitId: e.target.value || null })}
                >
                  <option value="">{t("Selecione uma unidade")}</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </>
        )}

        {nodeType === "wait" && (
          <Field
            label={t("Aguardar por")}
            hint={t("O fluxo pausa aqui e continua depois do tempo definido. Útil para enviar follow-up automático.")}
          >
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                value={data.waitAmount ?? ""}
                onChange={(e) =>
                  onChange({ waitAmount: Math.max(Number(e.target.value) || 0, 0) })
                }
                placeholder="30"
                className="w-24"
              />
              <Select
                value={data.waitUnit ?? "minutes"}
                onChange={(e) => onChange({ waitUnit: e.target.value as WaitUnit })}
                className="flex-1"
              >
                <option value="minutes">{t("minutos")}</option>
                <option value="hours">{t("horas")}</option>
                <option value="days">{t("dias")}</option>
              </Select>
            </div>
          </Field>
        )}

        {nodeType === "end" && (
          <Field
            label={t("Mensagem de encerramento")}
            hint={t("Mensagem final enviada ao cliente. A conversa é marcada como resolvida automaticamente após o envio.")}
          >
            <Textarea
              rows={3}
              value={data.endMessage ?? ""}
              onChange={(e) => onChange({ endMessage: e.target.value })}
              placeholder={t("Obrigado pelo contato! Se precisar de algo mais, é só chamar. Até mais! 😊")}
            />
          </Field>
        )}
      </div>

      {nodeType !== "start" && (
        <footer className="border-t border-line p-3">
          <Button
            variant="danger"
            size="sm"
            className="w-full"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            {t("Excluir bloco")}
          </Button>
        </footer>
      )}
      {/* nodeId mantém o painel re-renderizando ao trocar de bloco */}
      <span className="hidden" data-node={nodeId} />
    </div>
  );
}
