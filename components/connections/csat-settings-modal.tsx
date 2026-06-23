"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import type { WhatsappConnectionRow } from "@/types/database";

/**
 * Aba "CSAT" da conexão — pesquisa de satisfação automática ao resolver
 * conversa: toggle, mensagem personalizada e atraso em minutos.
 */

export const DEFAULT_CSAT_MESSAGE_UI = [
  "Como foi seu atendimento hoje? 😊",
  "Responda com um número:",
  "1 ⭐ Ruim",
  "2 ⭐⭐ Regular",
  "3 ⭐⭐⭐ Bom",
  "4 ⭐⭐⭐⭐ Ótimo",
  "5 ⭐⭐⭐⭐⭐ Excelente",
].join("\n");

export function CsatSettingsModal({
  connection,
  open,
  onClose,
  onSaved,
}: {
  connection: WhatsappConnectionRow;
  open: boolean;
  onClose: () => void;
  onSaved: (patch: Partial<WhatsappConnectionRow>) => void;
}) {
  const t = useT();
  const [enabled, setEnabled] = useState(connection.csat_enabled);
  const [message, setMessage] = useState(
    connection.csat_message ?? DEFAULT_CSAT_MESSAGE_UI
  );
  const [delay, setDelay] = useState(connection.csat_delay_minutes ?? 5);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const patch = {
        csat_enabled: enabled,
        csat_message: message.trim() || DEFAULT_CSAT_MESSAGE_UI,
        csat_delay_minutes: Math.max(Math.min(delay, 1440), 0),
      };
      const supabase = createClient();
      const { error } = await supabase
        .from("whatsapp_connections")
        .update(patch)
        .eq("id", connection.id);
      if (error) {
        toast.error(t("Não foi possível salvar as configurações de CSAT."));
        return;
      }
      onSaved(patch);
      toast.success(
        enabled
          ? t("CSAT ativado! A pesquisa será enviada quando uma conversa for resolvida.")
          : t("Configurações de CSAT salvas.")
      );
      onClose();
    } catch {
      toast.error(t("Erro de conexão ao salvar."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${t("Pesquisa de satisfação (CSAT)")} · ${connection.label}`}
      className="max-h-[85dvh] overflow-y-auto"
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3 rounded-lg border border-line bg-ink p-3">
          <div>
            <p className="text-sm font-medium">
              {t("Enviar pesquisa de satisfação ao resolver conversa")}
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-txt-dim">
              {t("Quando ativado, o sistema envia automaticamente uma mensagem pedindo avaliação toda vez que um atendimento for marcado como resolvido.")}
            </p>
          </div>
          <Switch
            checked={enabled}
            onChange={setEnabled}
            label={t("Enviar pesquisa de satisfação")}
          />
        </div>

        <div>
          <Label htmlFor="csat-message">{t("Mensagem da pesquisa")}</Label>
          <p className="-mt-0.5 mb-1.5 text-[11px] text-txt-dim">
            {t("Personalize o texto. O cliente responde com um número de 1 a 5 e o sistema registra a nota automaticamente.")}
          </p>
          <Textarea
            id="csat-message"
            rows={8}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={DEFAULT_CSAT_MESSAGE_UI}
          />
        </div>

        <div>
          <Label htmlFor="csat-delay">{t("Aguardar X minutos antes de enviar")}</Label>
          <p className="-mt-0.5 mb-1.5 text-[11px] text-txt-dim">
            {t("Evita enviar imediatamente — dá um tempo para o cliente processar o atendimento.")}
          </p>
          <Input
            id="csat-delay"
            type="number"
            min={0}
            max={1440}
            value={delay}
            onChange={(e) => setDelay(Number(e.target.value) || 0)}
            className="w-32"
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            {t("Cancelar")}
          </Button>
          <Button onClick={() => void handleSave()} loading={saving}>
            {t("Salvar CSAT")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
