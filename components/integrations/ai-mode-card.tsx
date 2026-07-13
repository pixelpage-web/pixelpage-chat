"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Bot, Check, KeyRound, PowerOff, Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import type { AiMode, AiProvider } from "@/types/database";

type Panel = "disabled-confirm" | "byok-form" | null;

const modeCards: {
  mode: AiMode;
  title: string;
  description: string;
  icon: typeof Sparkles;
}[] = [
  {
    mode: "managed",
    title: "Gerenciado",
    description:
      "Usamos nossa própria infraestrutura de IA. Simples, sem configuração.",
    icon: Sparkles,
  },
  {
    mode: "byok",
    title: "Minha IA",
    description:
      "Conecte sua própria chave da Anthropic ou OpenAI. Sem limite de custo nosso — o gasto é direto com o provedor.",
    icon: KeyRound,
  },
  {
    mode: "disabled",
    title: "Desligado",
    description:
      "O assistente automático para de responder. Mensagens continuam chegando normalmente para sua equipe responder manualmente.",
    icon: PowerOff,
  },
];

const providerLabels: Record<AiProvider, string> = {
  anthropic: "Claude (Anthropic)",
  openai: "ChatGPT (OpenAI)",
};

const providerPlaceholders: Record<AiProvider, string> = {
  anthropic: "sk-ant-...",
  openai: "sk-...",
};

export function AiModeCard({
  initialAiMode,
  initialAiProvider,
  initialVerifiedAt,
  initialHasAiKey,
  showByok = true,
}: {
  initialAiMode: AiMode;
  initialAiProvider: AiProvider | null;
  initialVerifiedAt: string | null;
  initialHasAiKey: boolean;
  /** false = plano básico (Free/Starter) — some do seletor, mas não desmonta nada de quem já está em BYOK */
  showByok?: boolean;
}) {
  const t = useT();
  const [mode, setMode] = useState<AiMode>(initialAiMode);
  const [provider, setProvider] = useState<AiProvider | null>(initialAiProvider);
  const [verifiedAt, setVerifiedAt] = useState<string | null>(initialVerifiedAt);
  const [hasAiKey, setHasAiKey] = useState(initialHasAiKey);

  const [panel, setPanel] = useState<Panel>(null);
  const [switchingManaged, setSwitchingManaged] = useState(false);
  const [confirmingDisable, setConfirmingDisable] = useState(false);

  const [formProvider, setFormProvider] = useState<AiProvider>(
    initialAiProvider ?? "anthropic"
  );
  const [apiKey, setApiKey] = useState("");
  const [byokBusy, setByokBusy] = useState(false);
  const [byokError, setByokError] = useState<string | null>(null);

  function openByokForm() {
    setFormProvider(provider ?? "anthropic");
    setApiKey("");
    setByokError(null);
    setPanel("byok-form");
  }

  async function handleSelect(target: AiMode) {
    if (target === mode) return;

    if (target === "managed") {
      setPanel(null);
      setSwitchingManaged(true);
      try {
        const res = await fetch("/api/integrations/ai-mode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ai_mode: "managed" }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          toast.error(data.error ?? t("Não foi possível atualizar o modo de IA."));
          return;
        }
        setMode("managed");
        setProvider(null);
        setVerifiedAt(null);
        toast.success(t("Modo gerenciado ativado."));
      } catch {
        toast.error(t("Erro de conexão."));
      } finally {
        setSwitchingManaged(false);
      }
      return;
    }

    if (target === "disabled") {
      setPanel("disabled-confirm");
      return;
    }

    // byok
    openByokForm();
  }

  async function confirmDisable() {
    setConfirmingDisable(true);
    try {
      const res = await fetch("/api/integrations/ai-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ai_mode: "disabled" }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? t("Não foi possível desligar a IA."));
        return;
      }
      setMode("disabled");
      setPanel(null);
      toast.success(t("Respostas automáticas desligadas."));
    } catch {
      toast.error(t("Erro de conexão."));
    } finally {
      setConfirmingDisable(false);
    }
  }

  async function handleConnect() {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setByokError(t("Informe a chave de API."));
      return;
    }
    setByokBusy(true);
    setByokError(null);
    try {
      const res = await fetch("/api/integrations/ai-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ai_mode: "byok",
          ai_provider: formProvider,
          api_key: trimmed,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        ok?: boolean;
      };
      if (!res.ok) {
        setByokError(data.error ?? t("Chave inválida ou sem permissão."));
        return;
      }
      setMode("byok");
      setProvider(formProvider);
      setVerifiedAt(new Date().toISOString());
      setHasAiKey(true);
      setPanel(null);
      setApiKey("");
      toast.success(t("Conectado! Sua IA já está em uso."));
    } catch {
      setByokError(t("Erro de conexão ao verificar a chave."));
    } finally {
      setByokBusy(false);
    }
  }

  const statusText =
    mode === "managed"
      ? t("Modo atual: Gerenciado")
      : mode === "disabled"
        ? t("Modo atual: Desligado")
        : `${t("Modo atual: Minha IA")}${provider ? ` (${providerLabels[provider].split(" ")[0]})` : ""}${
            verifiedAt && hasAiKey ? ` — ${t("conectado")}` : ""
          }`;

  return (
    <Card>
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-lime-soft">
          <Bot className="h-5 w-5 text-lime" aria-hidden />
        </div>
        <div>
          <CardTitle>{t("Modo de atendimento por IA")}</CardTitle>
          <CardDescription>
            {t("Escolha quem processa as respostas automáticas da sua organização.")}
          </CardDescription>
        </div>
      </div>

      <p className="mt-4 text-xs font-medium text-txt-mut">{statusText}</p>

      <div className="mt-3 space-y-2.5">
        {modeCards
          .filter((card) => showByok || card.mode !== "byok")
          .map((card) => {
          const selected = mode === card.mode;
          const isLoadingThis = card.mode === "managed" && switchingManaged;
          return (
            <button
              key={card.mode}
              type="button"
              onClick={() => void handleSelect(card.mode)}
              disabled={isLoadingThis}
              className={cn(
                "focus-ring w-full rounded-lg border p-4 text-left transition-colors disabled:cursor-wait",
                selected
                  ? "border-lime/60 bg-lime-soft"
                  : "border-line bg-surface-raised hover:border-line-strong"
              )}
            >
              <div className="flex items-start gap-3">
                <card.icon
                  className={cn(
                    "mt-0.5 h-5 w-5 shrink-0",
                    selected ? "text-lime" : "text-txt-dim"
                  )}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{t(card.title)}</p>
                    {selected && (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-lime">
                        <Check className="h-3 w-3" aria-hidden />
                        {t("ativo")}
                      </span>
                    )}
                    {isLoadingThis && (
                      <span className="text-[11px] text-txt-dim">
                        {t("aplicando...")}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-txt-mut">
                    {t(card.description)}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Confirmação para desligar */}
      {panel === "disabled-confirm" && (
        <div className="animate-fade-up mt-3 rounded-lg border border-danger/30 bg-danger-soft p-4">
          <p className="text-sm font-medium text-danger">
            {t("Tem certeza que quer desligar a IA?")}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-txt-mut">
            {t(
              "O assistente automático para de responder imediatamente. As mensagens continuam chegando normalmente — sua equipe passa a responder manualmente pelo inbox."
            )}
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setPanel(null)}>
              {t("Cancelar")}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => void confirmDisable()}
              loading={confirmingDisable}
            >
              {t("Confirmar")}
            </Button>
          </div>
        </div>
      )}

      {/* Formulário BYOK */}
      {panel === "byok-form" && (
        <div className="animate-fade-up mt-3 rounded-lg border border-line bg-surface-raised p-4">
          <Label>{t("Provedor")}</Label>
          <div className="flex gap-1 rounded-lg border border-line bg-surface p-1">
            {(["anthropic", "openai"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setFormProvider(p)}
                className={cn(
                  "focus-ring flex flex-1 items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  formProvider === p
                    ? "bg-lime-soft text-lime"
                    : "text-txt-mut hover:bg-surface-hover hover:text-txt"
                )}
              >
                {providerLabels[p]}
              </button>
            ))}
          </div>

          <div className="mt-3">
            <Label htmlFor="byok-key">{t("Chave de API")}</Label>
            <Input
              id="byok-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={providerPlaceholders[formProvider]}
              autoComplete="off"
            />
            {byokError && (
              <p className="mt-1.5 text-xs text-danger">{byokError}</p>
            )}
          </div>

          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setPanel(null)}>
              {t("Cancelar")}
            </Button>
            <Button size="sm" onClick={() => void handleConnect()} loading={byokBusy}>
              {t("Testar e conectar")}
            </Button>
          </div>
        </div>
      )}

      {/* Estado conectado (BYOK ativo e verificado) */}
      {panel === null && mode === "byok" && (
        <div className="animate-fade-up mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ok/30 bg-ok-soft p-4">
          <p className="flex items-center gap-1.5 text-xs text-ok">
            <Check className="h-4 w-4 shrink-0" aria-hidden />
            {hasAiKey && verifiedAt ? (
              <>
                {t("Conectado")} · {provider ? providerLabels[provider] : ""} ·{" "}
                {t("verificado")} {timeAgo(verifiedAt)}
              </>
            ) : (
              t("Minha IA está ativa.")
            )}
          </p>
          <Button variant="secondary" size="sm" onClick={openByokForm}>
            {t("Trocar chave")}
          </Button>
        </div>
      )}
    </Card>
  );
}
