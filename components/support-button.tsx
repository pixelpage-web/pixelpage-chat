"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  LifeBuoy,
  MessageSquarePlus,
  Send,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";

/** FAQ rápido exibido no modal de suporte. */
const faqs: { q: string; a: string }[] = [
  {
    q: "Como conecto meu WhatsApp?",
    a: "Vá em Conexões → Conectar agora. Você pode usar QR Code (rápido, qualquer número) ou pedir um número com API Oficial da Meta.",
  },
  {
    q: "Minha conexão caiu, e agora?",
    a: "No topo do painel aparece um aviso com o botão Reconectar. Em Conexões, clique em Reconectar e escaneie o QR Code novamente.",
  },
  {
    q: "Como treino o bot de IA?",
    a: "Em Agente IA você define o tom, as perguntas frequentes e pode enviar arquivos (cardápio, catálogo) para o bot aprender sobre o seu negócio.",
  },
  {
    q: "Atingi o limite de mensagens. Como aumento?",
    a: "Em Assinatura você escolhe um plano com mais mensagens de IA. O upgrade é imediato.",
  },
];

/**
 * Botão de suporte flutuante ("?") fixo no canto inferior direito, presente em
 * todas as páginas do app. Abre um modal com FAQ rápido, abertura de ticket e
 * link para a Central de Ajuda.
 */
export function SupportButton() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (message.trim().length < 5) {
      toast.error(t("Conte um pouco mais sobre o que você precisa."));
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, message }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        toast.error(json?.error ?? t("Não foi possível enviar. Tente novamente."));
        return;
      }
      setSent(true);
      setSubject("");
      setMessage("");
    } catch {
      toast.error(t("Erro de conexão."));
    } finally {
      setSending(false);
    }
  }

  function close() {
    setOpen(false);
    // Reseta o estado de "enviado" só depois do fade do modal
    setTimeout(() => setSent(false), 200);
  }

  return (
    <>
      {/* Botão flutuante */}
      <button
        onClick={() => setOpen(true)}
        aria-label={t("Ajuda e suporte")}
        className="focus-ring fixed bottom-20 right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-txt text-ink shadow-pop transition-transform hover:scale-105 active:scale-95 md:bottom-5 md:right-5"
      >
        <LifeBuoy className="h-6 w-6" aria-hidden />
      </button>

      <Modal open={open} onClose={close} title={t("Ajuda e suporte")} className="max-w-md">
        {sent ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-ok" aria-hidden />
            <div>
              <p className="font-display text-sm font-semibold">{t("Mensagem enviada!")}</p>
              <p className="mt-1 text-xs text-txt-mut">
                {t("Nossa equipe responde pelo email da sua conta o quanto antes.")}
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={close}>
              {t("Fechar")}
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            {/* FAQ rápido */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-txt-dim">
                {t("Perguntas frequentes")}
              </p>
              <div className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                {faqs.map((faq, i) => (
                  <div key={faq.q}>
                    <button
                      onClick={() => setOpenFaq(openFaq === i ? null : i)}
                      className="focus-ring flex w-full items-center justify-between gap-2 bg-surface-raised px-3 py-2 text-left text-xs font-medium text-txt hover:bg-surface-hover"
                    >
                      {t(faq.q)}
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 text-txt-dim transition-transform",
                          openFaq === i && "rotate-180"
                        )}
                        aria-hidden
                      />
                    </button>
                    {openFaq === i && (
                      <p className="bg-ink px-3 py-2 text-xs leading-relaxed text-txt-mut">
                        {t(faq.a)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Abrir ticket */}
            <form onSubmit={submit} className="space-y-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-txt-dim">
                <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden />
                {t("Falar com a equipe")}
              </p>
              <div>
                <Label htmlFor="support_subject">{t("Assunto")}</Label>
                <Input
                  id="support_subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={t("Ex.: Dúvida sobre conexão")}
                />
              </div>
              <div>
                <Label htmlFor="support_message">{t("Sua mensagem")}</Label>
                <Textarea
                  id="support_message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t("Descreva o que você precisa…")}
                  required
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <Link
                  href="/app/help"
                  onClick={close}
                  className="focus-ring inline-flex items-center gap-1.5 rounded text-xs text-txt-mut transition-colors hover:text-txt"
                >
                  <BookOpen className="h-3.5 w-3.5" aria-hidden />
                  {t("Central de Ajuda")}
                </Link>
                <Button type="submit" size="sm" loading={sending}>
                  <Send className="h-3.5 w-3.5" aria-hidden />
                  {t("Enviar")}
                </Button>
              </div>
            </form>
          </div>
        )}
      </Modal>
    </>
  );
}
