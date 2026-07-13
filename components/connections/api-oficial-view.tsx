"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  Clock,
  Headphones,
  Loader2,
  Lock,
  Plug,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmbeddedSignupButton } from "@/components/whatsapp/embedded-signup-button";
import { formatPhone } from "@/lib/utils";
import type { WhatsappConnectionRow } from "@/types/database";

type Phase = "idle" | "connecting" | "success" | "error";

function initialPhase(conn: WhatsappConnectionRow | null): Phase {
  if (!conn) return "idle";
  if (conn.status === "connected") return "success";
  if (conn.status === "error") return "error";
  return "idle";
}

const included = [
  { icon: BadgeCheck, text: "Número configurado e verificado" },
  { icon: Plug, text: "Ativação automática via Meta" },
  { icon: Headphones, text: "Suporte na configuração" },
  { icon: ShieldCheck, text: "Integração automática com o PixelPage Chat" },
];

/** O que o cliente precisa saber antes de conectar — não é aviso legal, é orientação prática. */
const beforeConnect = [
  {
    icon: Sparkles,
    text: "O mais rápido é conectar um número limpo, sem WhatsApp pessoal ativo nele.",
  },
  {
    icon: Clock,
    text: "Já usa esse número? Saia do WhatsApp pessoal antes e aguarde uns 5 minutos — a Meta não permite duas sessões ao mesmo tempo.",
  },
  {
    icon: Lock,
    text: "Depois de conectado, o número passa a funcionar só pelo painel do PixelPage Chat, não mais no WhatsApp do celular.",
  },
];

export function ApiOficialView({
  hasPlan3,
  existingConnection,
}: {
  hasPlan3: boolean;
  existingConnection: WhatsappConnectionRow | null;
}) {
  const t = useT();
  const [phase, setPhase] = useState<Phase>(initialPhase(existingConnection));
  const [connection, setConnection] = useState<WhatsappConnectionRow | null>(existingConnection);
  const [errorMsg, setErrorMsg] = useState<string | null>(
    existingConnection?.status === "error" ? (existingConnection.error_detail ?? null) : null
  );

  const handleConnecting = useCallback(() => {
    setPhase("connecting");
    setErrorMsg(null);
  }, []);

  const handleConnected = useCallback((conn: WhatsappConnectionRow) => {
    setConnection(conn);
    setPhase("success");
  }, []);

  const handleError = useCallback((msg: string) => {
    setErrorMsg(msg);
    setPhase("error");
  }, []);

  const handleRetry = useCallback(() => {
    setPhase("idle");
    setErrorMsg(null);
  }, []);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
        <Link
          href="/app/connections"
          className="focus-ring inline-flex items-center gap-1.5 rounded text-xs text-txt-mut transition-colors hover:text-txt"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          {t("Voltar para Conexões")}
        </Link>

        {/* Gate — plano insuficiente */}
        {!hasPlan3 && (
          <Card className="border-line">
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-hover">
                <Lock className="h-7 w-7 text-txt-dim" aria-hidden />
              </div>
              <div>
                <CardTitle>{t("Disponível no Plano Pro")}</CardTitle>
                <CardDescription className="mt-1 max-w-sm">
                  {t("A API Oficial da Meta está incluída no Plano Pro da PixelPage Chat — número verificado com selo verde, templates aprovados e sem risco de banimento.")}
                </CardDescription>
              </div>
              <Link
                href="/app/billing"
                className="inline-flex items-center gap-1.5 rounded-lg bg-lime px-4 py-2 text-sm font-semibold text-black hover:opacity-90"
              >
                {t("Ver planos")}
              </Link>
            </div>
          </Card>
        )}

        {/* Conteúdo Pro */}
        {hasPlan3 && (
          <>
            {/* Card de apresentação */}
            <Card>
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ok-soft">
                  <ShieldCheck className="h-6 w-6 text-ok" aria-hidden />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle>{t("Número WhatsApp com API Oficial da Meta")}</CardTitle>
                    <Badge tone="ok">{t("Incluído no Plano Pro")}</Badge>
                  </div>
                  <CardDescription>
                    {t("Número verificado, com selo verde, templates aprovados e zero risco de banimento por uso correto.")}
                  </CardDescription>
                </div>
              </div>

              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold text-txt-mut">{t("O que está incluído")}</p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {included.map((item) => (
                    <li key={item.text} className="flex items-center gap-2 text-sm text-txt">
                      <item.icon className="h-4 w-4 shrink-0 text-ok" aria-hidden />
                      {t(item.text)}
                    </li>
                  ))}
                </ul>
              </div>
            </Card>

            {/* Antes de conectar — orientação prática, não aviso legal */}
            {phase === "idle" && (
              <Card>
                <CardTitle>{t("Antes de conectar")}</CardTitle>
                <ul className="mt-3 space-y-2.5">
                  {beforeConnect.map((item) => (
                    <li key={item.text} className="flex items-start gap-2.5 text-sm text-txt-mut">
                      <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden />
                      <span className="leading-relaxed">{t(item.text)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {/* Estado: idle — botão de conexão */}
            {phase === "idle" && (
              <Card>
                <CardTitle>{t("Conectar via Embedded Signup da Meta")}</CardTitle>
                <CardDescription>
                  {t("Clique no botão abaixo para iniciar o fluxo oficial da Meta. Um popup abrirá para você autorizar seu WhatsApp Business — o processo leva menos de 2 minutos.")}
                </CardDescription>
                <div className="mt-5">
                  <EmbeddedSignupButton
                    onConnecting={handleConnecting}
                    onConnected={handleConnected}
                    onError={handleError}
                  />
                </div>
              </Card>
            )}

            {/* Estado: connecting */}
            {phase === "connecting" && (
              <Card>
                <div className="flex items-center gap-3 py-1">
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin text-lime" aria-hidden />
                  <div>
                    <p className="text-sm font-medium">{t("Configurando sua conexão...")}</p>
                    <p className="text-xs text-txt-dim">
                      {t("Registrando seu número na API da Meta. Aguarde alguns segundos.")}
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {/* Estado: success */}
            {phase === "success" && connection && (
              <Card className="border-ok/30">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-ok" aria-hidden />
                  <div className="flex-1">
                    <CardTitle>{t("Número conectado com sucesso!")}</CardTitle>
                    <CardDescription>
                      {connection.phone_display
                        ? formatPhone(connection.phone_display)
                        : connection.phone_number_id}{" "}
                      {connection.label ? `— ${connection.label}` : ""}
                    </CardDescription>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge tone="ok">{t("API Oficial ativa")}</Badge>
                      <Badge tone="lime">{t("Parceiro Meta")}</Badge>
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  <Link
                    href="/app/connections"
                    className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-medium text-txt transition-colors hover:border-lime/50 hover:text-lime"
                  >
                    {t("Ver todas as conexões")}
                  </Link>
                </div>
              </Card>
            )}

            {/* Estado: error */}
            {phase === "error" && (
              <Card className="border-danger/30">
                <div className="flex items-start gap-3">
                  <XCircle className="mt-0.5 h-6 w-6 shrink-0 text-danger" aria-hidden />
                  <div className="flex-1">
                    <CardTitle>{t("Não foi possível conectar")}</CardTitle>
                    <CardDescription>
                      {errorMsg ?? t("Ocorreu um erro ao registrar seu número. Tente novamente.")}
                    </CardDescription>
                  </div>
                </div>
                <div className="mt-4">
                  <Button variant="secondary" size="sm" onClick={handleRetry}>
                    {t("Tentar novamente")}
                  </Button>
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
