"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Lightbulb, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

/**
 * Caixa de sugestões: qualquer usuário envia ideias de melhoria,
 * que aparecem no painel admin (/admin/suggestions) para triagem.
 */
export function SuggestionForm({
  orgId,
  authorName,
}: {
  orgId: string;
  authorName: string;
}) {
  const t = useT();
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit() {
    const text = content.trim();
    if (!text) return;
    setSending(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase.from("suggestions").insert({
        org_id: orgId,
        author_id: user?.id ?? null,
        author_name: authorName,
        content: text,
      });
      if (error) {
        toast.error(t("Não foi possível enviar a sugestão. Tente novamente."));
        return;
      }
      setContent("");
      setSent(true);
      toast.success(t("Sugestão enviada — obrigado! 💚"));
    } catch {
      toast.error(t("Erro de conexão ao enviar a sugestão."));
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-lime/25 bg-lime-soft p-3">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-lime" aria-hidden />
        <div>
          <p className="text-xs font-medium text-lime">
            {t("Sugestão enviada — obrigado! 💚")}
          </p>
          <button
            onClick={() => setSent(false)}
            className="focus-ring mt-1 text-[11px] text-txt-mut underline hover:text-txt"
          >
            {t("Enviar outra sugestão")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder={t("Sua ideia de melhoria — o que facilitaria seu dia a dia na PixelPage Chat?")}
        className="text-xs"
      />
      <Button
        onClick={() => void handleSubmit()}
        loading={sending}
        disabled={!content.trim()}
        variant="secondary"
        size="sm"
        className="mt-2"
      >
        <Send className="h-3.5 w-3.5" aria-hidden />
        {t("Enviar sugestão")}
      </Button>
    </div>
  );
}
