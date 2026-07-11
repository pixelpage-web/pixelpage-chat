"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Info, Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import type { AgentRow, Json, TonePreset } from "@/types/database";

const tonePresets: { value: TonePreset; label: string; hint: string }[] = [
  { value: "vendedor", label: "Vendedor", hint: "entusiasmado, conduz à compra" },
  { value: "suporte", label: "Suporte", hint: "paciente e resolutivo" },
  { value: "formal", label: "Formal", hint: "polido, sem gírias" },
  { value: "casual", label: "Casual", hint: "leve e próximo" },
];

const dayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export interface BusinessHours {
  enabled: boolean;
  days: number[];
  open: string;
  close: string;
}

export function parseBusinessHours(value: Json): BusinessHours {
  const v = (value ?? {}) as Partial<BusinessHours>;
  return {
    enabled: v.enabled === true,
    days: Array.isArray(v.days) ? v.days.filter((d) => typeof d === "number") : [1, 2, 3, 4, 5],
    open: typeof v.open === "string" ? v.open : "09:00",
    close: typeof v.close === "string" ? v.close : "18:00",
  };
}

export function AgentForm({
  agent,
  onChange,
}: {
  agent: AgentRow;
  onChange: (agent: AgentRow) => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState<AgentRow>(agent);
  const [hours, setHours] = useState<BusinessHours>(parseBusinessHours(agent.business_hours));
  const [keywordInput, setKeywordInput] = useState("");
  const [saving, setSaving] = useState(false);

  function set<K extends keyof AgentRow>(key: K, value: AgentRow[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function addKeyword() {
    const k = keywordInput.trim().toLowerCase();
    if (!k) return;
    if (!draft.handoff_keywords.includes(k)) {
      set("handoff_keywords", [...draft.handoff_keywords, k]);
    }
    setKeywordInput("");
  }

  async function handleSave() {
    setSaving(true);
    try {
      const supabase = createClient();
      const patch = {
        name: draft.name.trim() || "Assistente",
        active: draft.active,
        tone_preset: draft.tone_preset,
        system_prompt: draft.system_prompt,
        welcome_message: draft.welcome_message,
        away_message: draft.away_message,
        handoff_keywords: draft.handoff_keywords,
        business_hours: hours as unknown as Json,
      };
      const { error } = await supabase
        .from("agents")
        .update(patch)
        .eq("id", agent.id);
      if (error) {
        toast.error(t("Não foi possível salvar o agente."));
        return;
      }
      const updated = { ...draft, ...patch } as AgentRow;
      onChange(updated);
      toast.success(t("Agente salvo! O simulador já usa a nova configuração."));
    } catch {
      toast.error(t("Erro de conexão ao salvar. Tente novamente."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>{t("Identidade do bot")}</CardTitle>
            <CardDescription>
              {t("Nome, tom de voz e instruções que definem como ele atende.")}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-txt-mut">
              {draft.active ? t("Ativo") : t("Inativo")}
            </span>
            <Switch
              checked={draft.active}
              onChange={(v) => set("active", v)}
              label={t("Bot ativo")}
            />
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <Label htmlFor="bot-name">{t("Nome do bot")}</Label>
            <Input
              id="bot-name"
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Assistente"
            />
          </div>

          <div>
            <Label>{t("Tom de voz")}</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {tonePresets.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => set("tone_preset", preset.value)}
                  className={cn(
                    "focus-ring rounded-lg border p-2.5 text-left transition-colors",
                    draft.tone_preset === preset.value
                      ? "border-lime/60 bg-lime-soft"
                      : "border-line bg-surface-raised hover:border-line-strong"
                  )}
                >
                  <p
                    className={cn(
                      "text-xs font-semibold",
                      draft.tone_preset === preset.value ? "text-lime" : "text-txt"
                    )}
                  >
                    {t(preset.label)}
                  </p>
                  <p className="mt-0.5 text-[10px] leading-tight text-txt-dim">
                    {t(preset.hint)}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label
              htmlFor="bot-prompt"
              hint={t("o que ele vende, políticas, como deve se comportar")}
            >
              {t("Instruções / personalidade")}
            </Label>
            <Textarea
              id="bot-prompt"
              rows={6}
              value={draft.system_prompt}
              onChange={(e) => set("system_prompt", e.target.value)}
              placeholder={
                "Ex.: Você atende a Pizzaria do Zé. Temos pizzas tradicionais (R$ 45) e especiais (R$ 62). Entregamos em até 50 min na zona sul. Não aceitamos encomendas para outros dias."
              }
            />
            <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-txt-dim">
              <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              {t(
                "A Meta proíbe o uso do WhatsApp Business API para IA de propósito geral — mantenha as instruções focadas no seu negócio (produtos, serviços, agendamento, suporte)."
              )}
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle>{t("Mensagens automáticas")}</CardTitle>
        <CardDescription>
          {t("Boas-vindas para novos contatos e resposta fora do horário.")}
        </CardDescription>
        <div className="mt-5 space-y-4">
          <div>
            <Label htmlFor="welcome">{t("Mensagem de boas-vindas")}</Label>
            <Textarea
              id="welcome"
              rows={2}
              value={draft.welcome_message}
              onChange={(e) => set("welcome_message", e.target.value)}
              placeholder="Olá! 👋 Como posso ajudar você hoje?"
            />
          </div>
          <div>
            <Label htmlFor="away">{t("Mensagem de ausência")}</Label>
            <Textarea
              id="away"
              rows={2}
              value={draft.away_message}
              onChange={(e) => set("away_message", e.target.value)}
              placeholder="Estamos fora do horário de atendimento…"
            />
          </div>

          <div className="rounded-lg border border-line bg-ink p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{t("Horário de funcionamento")}</p>
                <p className="mt-0.5 text-xs text-txt-mut">
                  {t("Fora do horário, o bot envia a mensagem de ausência.")}
                </p>
              </div>
              <Switch
                checked={hours.enabled}
                onChange={(v) => setHours((h) => ({ ...h, enabled: v }))}
                label={t("Usar horário de funcionamento")}
              />
            </div>
            {hours.enabled && (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {dayLabels.map((label, i) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() =>
                        setHours((h) => ({
                          ...h,
                          days: h.days.includes(i)
                            ? h.days.filter((d) => d !== i)
                            : [...h.days, i].sort(),
                        }))
                      }
                      className={cn(
                        "focus-ring rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                        hours.days.includes(i)
                          ? "bg-lime text-white"
                          : "bg-surface-raised text-txt-dim hover:text-txt"
                      )}
                    >
                      {t(label)}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <Label htmlFor="open">{t("Abre às")}</Label>
                    <Input
                      id="open"
                      type="time"
                      value={hours.open}
                      onChange={(e) => setHours((h) => ({ ...h, open: e.target.value }))}
                    />
                  </div>
                  <div className="flex-1">
                    <Label htmlFor="close">{t("Fecha às")}</Label>
                    <Input
                      id="close"
                      type="time"
                      value={hours.close}
                      onChange={(e) => setHours((h) => ({ ...h, close: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle>{t("Transferência para humano")}</CardTitle>
        <CardDescription>
          {t("Quando o cliente usar uma destas palavras, o bot pausa nesta conversa e sua equipe assume pelo inbox.")}
        </CardDescription>
        <div className="mt-4">
          <div className="flex flex-wrap gap-1.5">
            {draft.handoff_keywords.map((keyword) => (
              <span
                key={keyword}
                className="inline-flex items-center gap-1 rounded-full border border-amber/30 bg-amber-soft px-2.5 py-1 text-xs text-amber"
              >
                {keyword}
                <button
                  onClick={() =>
                    set(
                      "handoff_keywords",
                      draft.handoff_keywords.filter((k) => k !== keyword)
                    )
                  }
                  className="focus-ring rounded-full hover:text-danger"
                  aria-label={`${t("Remover")} ${keyword}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {draft.handoff_keywords.length === 0 && (
              <p className="text-xs text-txt-dim">
                {t("Nenhuma palavra-chave. Sugestões: atendente, humano, falar com alguém.")}
              </p>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <Input
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addKeyword();
                }
              }}
              placeholder="Ex.: atendente"
              className="h-9"
            />
            <Button type="button" variant="secondary" size="sm" onClick={addKeyword} className="h-9">
              <Plus className="h-4 w-4" aria-hidden />
              {t("Adicionar")}
            </Button>
          </div>
        </div>
      </Card>

      <div className="sticky bottom-0 -mx-1 bg-gradient-to-t from-ink via-ink/95 to-transparent px-1 pb-2 pt-4">
        <Button onClick={() => void handleSave()} loading={saving} className="w-full sm:w-auto">
          {t("Salvar agente")}
        </Button>
      </div>
    </div>
  );
}
