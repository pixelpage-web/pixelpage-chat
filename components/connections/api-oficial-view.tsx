"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  Clock,
  Headphones,
  Lock,
  Plug,
  ShieldCheck,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const included = [
  { icon: BadgeCheck, text: "Número configurado e verificado" },
  { icon: Plug, text: "API Meta ativada em até 48h úteis" },
  { icon: Headphones, text: "Suporte na configuração" },
  { icon: ShieldCheck, text: "Integração automática com o PixelPage Chat" },
];

const steps = [
  "Você preenche o formulário abaixo",
  "Nossa equipe entra em contato em até 24h",
  "Você fornece os dados da empresa",
  "Em 48h o número está ativo",
];

/** Página de venda interna + formulário de interesse da API Oficial. */
export function ApiOficialView({
  defaultName,
  defaultEmail,
  defaultCompany,
  alreadyRequested,
  hasPlan3,
}: {
  defaultName: string;
  defaultEmail: string;
  defaultCompany: string;
  alreadyRequested: boolean;
  hasPlan3: boolean;
}) {
  const t = useT();
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    company_name: defaultCompany,
    document: "",
    desired_phone: "",
    contact_name: defaultName,
    contact_email: defaultEmail,
    contact_whatsapp: "",
  });

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.company_name || !form.contact_name || !form.contact_whatsapp) {
      toast.error(t("Preencha empresa, responsável e WhatsApp de contato."));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/connections/api-oficial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        toast.error(json?.error ?? t("Não foi possível enviar. Tente novamente."));
        return;
      }
      setSent(true);
      toast.success(t("Pedido enviado! Entraremos em contato em até 24h."));
    } catch {
      toast.error(t("Erro de conexão."));
    } finally {
      setSaving(false);
    }
  }

  const done = sent || alreadyRequested;

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

        {/* Estado bloqueado — org não tem Plano 3 */}
        {!hasPlan3 && (
          <Card className="border-line">
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-hover">
                <Lock className="h-7 w-7 text-txt-dim" aria-hidden />
              </div>
              <div>
                <CardTitle>{t("Disponível no Plano 3")}</CardTitle>
                <CardDescription className="mt-1 max-w-sm">
                  {t("A API Oficial da Meta está incluída no Plano 3 da PixelPage Chat — número verificado com selo ✓ verde, templates aprovados e sem risco de banimento.")}
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

        {/* Oferta — só visível para Plano 3 */}
        {hasPlan3 && (
        <Card className="border-ok/30 bg-gradient-to-br from-ok-soft to-transparent">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ok-soft">
              <ShieldCheck className="h-6 w-6 text-ok" aria-hidden />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>🟢 {t("Número WhatsApp com API Oficial da Meta")}</CardTitle>
                <Badge tone="ok">{t("Incluído no Plano 3")}</Badge>
              </div>
              <CardDescription>
                {t("Número verificado, com selo ✓ verde, templates aprovados e zero risco de banimento por uso correto.")}
              </CardDescription>
            </div>
          </div>

          {/* Incluído */}
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

          {/* Como funciona */}
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold text-txt-mut">{t("Como funciona")}</p>
            <ol className="space-y-2">
              {steps.map((step, i) => (
                <li key={step} className="flex items-center gap-2.5 text-sm text-txt-mut">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-lime-soft text-[11px] font-semibold text-lime">
                    {i + 1}
                  </span>
                  {t(step)}
                </li>
              ))}
            </ol>
          </div>
        </Card>
        )}

        {/* Formulário — só para Plano 3 */}
        {/* Estado: já enviado */}
        {hasPlan3 && done ? (
          <Card className="border-ok/30">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-ok" aria-hidden />
              <div>
                <CardTitle>{t("Pedido recebido!")}</CardTitle>
                <CardDescription>
                  {t("Nossa equipe entra em contato em até 24h pelo WhatsApp ou email informado. Você pode acompanhar pelo suporte.")}
                </CardDescription>
                <div className="mt-3 flex items-center gap-1.5 text-xs text-amber">
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  {t("Status: aguardando contato da equipe")}
                </div>
              </div>
            </div>
          </Card>
        ) : hasPlan3 ? (
          /* Formulário de interesse */
          <Card>
            <CardTitle>{t("Quero meu número com API Oficial")}</CardTitle>
            <CardDescription>
              {t("Preencha os dados abaixo. Sem compromisso — primeiro entramos em contato para tirar suas dúvidas.")}
            </CardDescription>

            <form onSubmit={submit} className="mt-4 space-y-4">
              <div>
                <Label htmlFor="company_name">{t("Nome da empresa")}</Label>
                <Input
                  id="company_name"
                  value={form.company_name}
                  onChange={(e) => set("company_name", e.target.value)}
                  placeholder={t("Ex.: Pizzaria do João")}
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="document">
                    CNPJ <span className="font-normal text-txt-dim">({t("opcional")})</span>
                  </Label>
                  <Input
                    id="document"
                    value={form.document}
                    onChange={(e) => set("document", e.target.value)}
                    placeholder={t("CNPJ ou CPF (para MEI)")}
                  />
                  <p className="mt-1 text-[11px] text-txt-dim">
                    {t("MEI pode usar CPF. Deixe em branco se ainda não tiver.")}
                  </p>
                </div>
                <div>
                  <Label htmlFor="desired_phone">{t("Número de telefone desejado")}</Label>
                  <Input
                    id="desired_phone"
                    value={form.desired_phone}
                    onChange={(e) => set("desired_phone", e.target.value)}
                    placeholder={t("ou “qualquer disponível”")}
                  />
                  <p className="mt-1 text-[11px] text-txt-dim">
                    {t("Se já tem um número em mente, informe com DDD.")}
                  </p>
                </div>
              </div>

              <div>
                <Label htmlFor="contact_name">{t("Nome do responsável")}</Label>
                <Input
                  id="contact_name"
                  value={form.contact_name}
                  onChange={(e) => set("contact_name", e.target.value)}
                  placeholder={t("Quem vamos procurar")}
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="contact_email">{t("Email de contato")}</Label>
                  <Input
                    id="contact_email"
                    type="email"
                    value={form.contact_email}
                    onChange={(e) => set("contact_email", e.target.value)}
                    placeholder="voce@empresa.com.br"
                  />
                </div>
                <div>
                  <Label htmlFor="contact_whatsapp">{t("WhatsApp para contato")}</Label>
                  <Input
                    id="contact_whatsapp"
                    value={form.contact_whatsapp}
                    onChange={(e) => set("contact_whatsapp", e.target.value)}
                    placeholder="(11) 98888-7777"
                    required
                  />
                  <p className="mt-1 text-[11px] text-txt-dim">
                    {t("É por aqui que falaremos com você.")}
                  </p>
                </div>
              </div>

              <Button type="submit" loading={saving} className="w-full sm:w-auto">
                {t("Quero meu número com API Oficial")}
                <ShieldCheck className="h-4 w-4" aria-hidden />
              </Button>
            </form>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
