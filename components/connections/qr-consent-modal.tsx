"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, Ban, Check, ShieldCheck } from "lucide-react";
import { useT } from "@/lib/i18n";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

/**
 * Modal de aceite OBRIGATÓRIO antes de conectar via QR Code (WhatsApp Web).
 * O cliente só prossegue após clicar em "Entendi e quero continuar" — fluxo
 * crítico para deixar claro que a conexão é não oficial e os riscos de ban.
 */
export function QrConsentModal({
  open,
  onClose,
  onAccept,
}: {
  open: boolean;
  onClose: () => void;
  /** chamado quando o cliente aceita os termos e quer prosseguir para o QR */
  onAccept: () => void;
}) {
  const t = useT();

  return (
    <Modal open={open} onClose={onClose} title={t("Antes de conectar")} className="max-w-md">
      <div className="space-y-4">
        {/* Cabeçalho de atenção */}
        <div className="flex items-start gap-3 rounded-lg border border-amber/30 bg-amber-soft p-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-amber">
              {t("Importante — leia antes de conectar")}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-txt-mut">
              {t("Esta conexão usa o WhatsApp Web (não oficial).")}
            </p>
          </div>
        </div>

        {/* O que permite / não permite */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-line bg-surface-raised p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ok">
              <Check className="h-3.5 w-3.5" aria-hidden /> {t("Permite")}
            </p>
            <ul className="space-y-1 text-xs leading-relaxed text-txt-mut">
              <li>{t("Responder mensagens")}</li>
              <li>{t("Criar automações")}</li>
              <li>{t("Usar o bot de IA")}</li>
            </ul>
          </div>
          <div className="rounded-lg border border-line bg-surface-raised p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-danger">
              <Ban className="h-3.5 w-3.5" aria-hidden /> {t("Não permite")}
            </p>
            <ul className="space-y-1 text-xs leading-relaxed text-txt-mut">
              <li>{t("Templates oficiais")}</li>
              <li>{t("API Meta verificada")}</li>
              <li>{t("Número com ✓ verde")}</li>
            </ul>
          </div>
        </div>

        {/* Riscos assumidos */}
        <div className="rounded-lg border border-danger/25 bg-danger-soft p-3">
          <p className="mb-1.5 text-xs font-semibold text-danger">
            ⚠️ {t("Riscos que você assume ao usar:")}
          </p>
          <ul className="list-inside list-disc space-y-1 text-xs leading-relaxed text-txt-mut">
            <li>
              {t("Enviar spam ou mensagens em massa não solicitadas pode levar ao banimento do seu número pelo WhatsApp.")}
            </li>
            <li>
              {t("Não ative disparos para listas de contatos que não pediram suas mensagens.")}
            </li>
            <li>{t("O uso responsável é de sua responsabilidade.")}</li>
          </ul>
        </div>

        {/* Caminho alternativo: API oficial */}
        <Link
          href="/app/connections/api-oficial"
          className="focus-ring flex items-center justify-between gap-2 rounded-lg border border-ok/30 bg-ok-soft px-3 py-2.5 text-xs font-medium text-ok transition-colors hover:border-ok/60"
        >
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            {t("Quer um número com API oficial da Meta?")}
          </span>
          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
        </Link>

        {/* Ações */}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose}>
            {t("Cancelar")}
          </Button>
          <Button onClick={onAccept}>
            {t("Entendi e quero continuar")}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>
    </Modal>
  );
}
