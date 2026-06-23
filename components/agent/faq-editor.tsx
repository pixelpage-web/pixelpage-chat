"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import type { AgentFaqRow } from "@/types/database";

/** CRUD de perguntas frequentes — entram no contexto do bot. */
export function FaqEditor({
  agentId,
  initialFaqs,
}: {
  agentId: string;
  initialFaqs: AgentFaqRow[];
}) {
  const t = useT();
  const [faqs, setFaqs] = useState<AgentFaqRow[]>(initialFaqs);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || !answer.trim()) return;
    setAdding(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("agent_faqs")
        .insert({
          agent_id: agentId,
          question: question.trim(),
          answer: answer.trim(),
          position: faqs.length,
        })
        .select("*")
        .single();
      if (error || !data) {
        toast.error(t("Não foi possível adicionar a pergunta."));
        return;
      }
      setFaqs((prev) => [...prev, data]);
      setQuestion("");
      setAnswer("");
      toast.success(t("Pergunta adicionada ao contexto do bot."));
    } catch {
      toast.error(t("Erro de conexão ao adicionar. Tente novamente."));
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    const previous = faqs;
    setFaqs((prev) => prev.filter((f) => f.id !== id));
    try {
      const supabase = createClient();
      const { error } = await supabase.from("agent_faqs").delete().eq("id", id);
      if (error) {
        setFaqs(previous);
        toast.error(t("Não foi possível remover a pergunta."));
      }
    } catch {
      setFaqs(previous);
      toast.error(t("Erro de conexão ao remover."));
    }
  }

  return (
    <Card>
      <CardTitle>{t("FAQ do bot")}</CardTitle>
      <CardDescription>
        {t("Pares de pergunta e resposta que o bot usa como fonte de verdade.")}
      </CardDescription>

      <ul className="mt-5 space-y-2">
        {faqs.map((faq) => (
          <li
            key={faq.id}
            className="group flex items-start justify-between gap-3 rounded-lg border border-line bg-ink p-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">{faq.question}</p>
              <p className="mt-1 text-xs leading-relaxed text-txt-mut">
                {faq.answer}
              </p>
            </div>
            <button
              onClick={() => void handleDelete(faq.id)}
              className="focus-ring shrink-0 rounded-md p-1.5 text-txt-dim transition-colors hover:bg-danger-soft hover:text-danger"
              aria-label={`${t("Remover pergunta:")} ${faq.question}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
        {faqs.length === 0 && (
          <li className="rounded-lg border border-dashed border-line p-4 text-center text-xs text-txt-dim">
            {t("Nenhuma pergunta ainda. Adicione as dúvidas mais comuns dos seus clientes — preço, entrega, horário, formas de pagamento…")}
          </li>
        )}
      </ul>

      <form onSubmit={(e) => void handleAdd(e)} className="mt-4 space-y-3 rounded-lg border border-line bg-surface-raised p-3">
        <div>
          <Label htmlFor="faq-q">{t("Pergunta")}</Label>
          <Input
            id="faq-q"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ex.: Vocês entregam no sábado?"
          />
        </div>
        <div>
          <Label htmlFor="faq-a">{t("Resposta")}</Label>
          <Textarea
            id="faq-a"
            rows={2}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Ex.: Sim! Aos sábados entregamos das 9h às 13h."
          />
        </div>
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          loading={adding}
          disabled={!question.trim() || !answer.trim()}
        >
          <Plus className="h-4 w-4" aria-hidden />
          {t("Adicionar pergunta")}
        </Button>
      </form>
    </Card>
  );
}
