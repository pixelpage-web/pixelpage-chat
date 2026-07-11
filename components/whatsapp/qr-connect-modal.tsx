"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, QrCode, RefreshCw, Smartphone } from "lucide-react";
import { useT } from "@/lib/i18n";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

const LABEL_MAX_LENGTH = 30;

/**
 * Modal de conexão via QR Code (Evolution API).
 * Numa conexão nova, pede um nome de identificação antes de tudo (ex:
 * "Vendas", "Suporte") — essencial pra distinguir conexões quando a org
 * tem mais de um número. Numa reconexão (existingConnectionId), pula essa
 * etapa: a conexão já tem nome.
 * Depois disso, cria/reativa a instância e faz polling do estado a cada
 * 2s, exibindo o QR ao vivo até a leitura pelo celular.
 */
export function QrConnectModal({
  open,
  onClose,
  existingConnectionId,
  onConnected,
}: {
  open: boolean;
  onClose: () => void;
  /** quando informado, é uma reconexão (sessão caída) */
  existingConnectionId?: string | null;
  onConnected: () => void;
}) {
  const t = useT();
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [phase, setPhase] = useState<
    "naming" | "starting" | "waiting" | "connected" | "error"
  >(existingConnectionId ? "starting" : "naming");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const poll = useCallback(
    async (connId: string) => {
      try {
        const res = await fetch(`/api/whatsapp/qr?connection_id=${connId}`);
        const json = (await res.json()) as {
          status?: string;
          qr?: string | null;
          phone_display?: string | null;
          error?: string;
        };
        if (!res.ok) {
          setPhase("error");
          setErrorMsg(json.error ?? t("Erro de conexão."));
          stopPolling();
          return;
        }
        if (json.status === "connected") {
          setPhase("connected");
          setPhone(json.phone_display ?? null);
          stopPolling();
          setTimeout(() => onConnected(), 1800);
          return;
        }
        if (json.qr) {
          setQr(json.qr.startsWith("data:") ? json.qr : `data:image/png;base64,${json.qr}`);
          setPhase("waiting");
        }
      } catch {
        // falha pontual de rede — o próximo tick tenta de novo
      }
    },
    [onConnected, stopPolling, t]
  );

  /** Cria a instância (conexão nova, com o nome informado) ou reativa uma existente. */
  const startSession = useCallback(
    (connName?: string) => {
      setPhase("starting");
      let cancelled = false;

      void (async () => {
        try {
          let connId = existingConnectionId ?? null;
          const res = await fetch("/api/whatsapp/qr", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              connId
                ? { action: "reconnect", connection_id: connId }
                : { action: "create", label: connName }
            ),
          });
          const json = (await res.json()) as { connection_id?: string; error?: string };
          if (!res.ok) {
            if (!cancelled) {
              setPhase("error");
              setErrorMsg(json.error ?? t("Erro de conexão."));
            }
            return;
          }
          connId = connId ?? json.connection_id ?? null;
          if (!connId || cancelled) return;
          setConnectionId(connId);
          void poll(connId);
          timerRef.current = setInterval(() => void poll(connId as string), 2000);
        } catch {
          if (!cancelled) {
            setPhase("error");
            setErrorMsg(t("Erro de conexão."));
          }
        }
      })();

      return () => {
        cancelled = true;
      };
    },
    [existingConnectionId, poll, t]
  );

  useEffect(() => {
    if (!open) {
      stopPolling();
      setConnectionId(null);
      setQr(null);
      setLabel("");
      setPhase(existingConnectionId ? "starting" : "naming");
      setErrorMsg(null);
      setPhone(null);
      return;
    }

    // Reconexão: sem nome pra pedir, começa direto. Conexão nova: fica em
    // "naming" até o usuário confirmar (ver handleConfirmName).
    if (existingConnectionId) {
      const cleanup = startSession();
      return () => {
        cleanup();
        stopPolling();
      };
    }

    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existingConnectionId]);

  function handleConfirmName(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) return;
    startSession(trimmed);
  }

  return (
    <Modal open={open} onClose={onClose} title={t("Conectar via QR Code")}>
      <div className="flex flex-col items-center text-center">
        {phase === "naming" && (
          <form onSubmit={handleConfirmName} className="w-full py-2 text-left">
            <p className="text-center text-sm leading-relaxed text-txt-mut">
              {t("Dê um nome pra essa conexão — ajuda a identificar qual número é qual quando você tiver mais de um.")}
            </p>
            <div className="mt-4">
              <Label htmlFor="qr-connection-name">{t("Nome desta conexão")}</Label>
              <Input
                id="qr-connection-name"
                required
                autoFocus
                maxLength={LABEL_MAX_LENGTH}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={t("Ex: Vendas, Suporte, Atendimento...")}
              />
              <p className="mt-1 text-right text-[11px] text-txt-dim">
                {label.length}/{LABEL_MAX_LENGTH}
              </p>
            </div>
            <Button type="submit" className="mt-1 w-full" disabled={!label.trim()}>
              {t("Continuar")}
            </Button>
          </form>
        )}

        {phase === "starting" && (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 className="h-8 w-8 animate-spin text-lime" aria-hidden />
            <p className="text-sm text-txt-mut">{t("Preparando sua sessão…")}</p>
          </div>
        )}

        {phase === "waiting" && (
          <>
            <p className="text-sm leading-relaxed text-txt-mut">
              {t("Abra o WhatsApp no celular → Dispositivos conectados → Conectar dispositivo, e aponte a câmera:")}
            </p>
            <div className="mt-4 rounded-xl bg-white p-3">
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="QR Code" className="h-56 w-56" />
              ) : (
                <div className="flex h-56 w-56 items-center justify-center">
                  <QrCode className="h-10 w-10 animate-pulse text-gray-400" aria-hidden />
                </div>
              )}
            </div>
            <p className="mt-3 flex items-center gap-2 text-xs text-txt-dim">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              {t("Aguardando leitura…")}
            </p>
          </>
        )}

        {phase === "connected" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCircle2 className="h-12 w-12 animate-fade-up text-ok" aria-hidden />
            <p className="font-display text-base font-semibold text-ok">
              {t("Conectado!")}
            </p>
            {phone && (
              <p className="flex items-center gap-1.5 text-sm text-txt-mut">
                <Smartphone className="h-4 w-4" aria-hidden /> +{phone}
              </p>
            )}
          </div>
        )}

        {phase === "error" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <p className="text-sm text-danger">{errorMsg}</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setErrorMsg(null);
                if (connectionId) {
                  setPhase("starting");
                  void fetch("/api/whatsapp/qr", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      action: "reconnect",
                      connection_id: connectionId,
                    }),
                  }).then(() => {
                    timerRef.current = setInterval(
                      () => void poll(connectionId),
                      2000
                    );
                  });
                } else {
                  toast.error(t("Feche e abra o modal para tentar novamente."));
                }
              }}
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              {t("Tentar novamente")}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
