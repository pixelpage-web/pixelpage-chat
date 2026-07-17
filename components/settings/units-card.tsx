"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2, Pencil, Plus, Trash2, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import type { OrgUnitRow } from "@/types/database";

/**
 * Unidades/filiais: permite rotear conversas de um único número de WhatsApp
 * pra equipes diferentes por local (ver bloco "Transferir para unidade" no
 * builder de fluxos e o filtro de unidade no inbox).
 */

interface Member {
  id: string;
  name: string;
}

export function UnitsCard({ orgId, members }: { orgId: string; members: Member[] }) {
  const t = useT();
  const supabase = createClient();

  const [units, setUnits] = useState<OrgUnitRow[]>([]);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [assigned, setAssigned] = useState<string[]>([]); // profile_ids da unidade em edição
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<OrgUnitRow | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("org_units")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at");
    const list = data ?? [];
    setUnits(list);
    if (list.length > 0) {
      const { data: links } = await supabase
        .from("team_member_units")
        .select("unit_id, profile_id")
        .in("unit_id", list.map((u) => u.id));
      const counts: Record<string, number> = {};
      for (const link of links ?? []) {
        counts[link.unit_id] = (counts[link.unit_id] ?? 0) + 1;
      }
      setMemberCounts(counts);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, [orgId]); // eslint-disable-line

  function openCreate() {
    setEditing(null);
    setName("");
    setIsActive(true);
    setAssigned([]);
    setModalOpen(true);
  }

  async function openEdit(unit: OrgUnitRow) {
    setEditing(unit);
    setName(unit.name);
    setIsActive(unit.is_active);
    const { data } = await supabase
      .from("team_member_units")
      .select("profile_id")
      .eq("unit_id", unit.id);
    setAssigned((data ?? []).map((r) => r.profile_id));
    setModalOpen(true);
  }

  function toggleAssigned(profileId: string) {
    setAssigned((prev) =>
      prev.includes(profileId) ? prev.filter((id) => id !== profileId) : [...prev, profileId]
    );
  }

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) { toast.error(t("Preencha o nome da unidade.")); return; }
    setSaving(true);
    try {
      let unitId = editing?.id ?? null;
      if (editing) {
        const { error } = await supabase
          .from("org_units")
          .update({ name: trimmed, is_active: isActive })
          .eq("id", editing.id);
        if (error) { toast.error(t("Não foi possível salvar a unidade.")); return; }
      } else {
        const { data, error } = await supabase
          .from("org_units")
          .insert({ org_id: orgId, name: trimmed, is_active: isActive })
          .select("id")
          .single();
        if (error) { toast.error(t("Não foi possível criar a unidade.")); return; }
        unitId = data.id;
      }

      // Sincroniza os vínculos de equipe: remove tudo e recria (lista pequena,
      // simples e sem risco de ficar dessincronizado).
      if (unitId) {
        await supabase.from("team_member_units").delete().eq("unit_id", unitId);
        if (assigned.length > 0) {
          await supabase
            .from("team_member_units")
            .insert(assigned.map((profileId) => ({ unit_id: unitId as string, profile_id: profileId })));
        }
      }

      toast.success(editing ? t("Unidade atualizada.") : t("Unidade criada."));
      setModalOpen(false);
      void load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(unit: OrgUnitRow) {
    const { error } = await supabase.from("org_units").delete().eq("id", unit.id);
    if (error) { toast.error(t("Não foi possível excluir a unidade.")); return; }
    setUnits((prev) => prev.filter((u) => u.id !== unit.id));
    toast.success(t("Unidade removida. As conversas dela voltam a ficar visíveis pra todo mundo."));
  }

  return (
    <Card>
      <div className="flex items-start gap-3">
        <Building2 className="mt-0.5 h-5 w-5 text-txt-dim" aria-hidden />
        <div className="flex-1">
          <CardTitle>{t("Unidades")}</CardTitle>
          <CardDescription>
            {t("Roteie conversas de um único número de WhatsApp para equipes diferentes por local. Membros vinculados a uma unidade só veem as conversas dela; conversas sem unidade continuam visíveis pra todo mundo.")}
          </CardDescription>
        </div>
        <Button onClick={openCreate} size="sm" variant="secondary" className="shrink-0">
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {t("Nova unidade")}
        </Button>
      </div>

      {loading ? (
        <div className="mt-4 space-y-2">
          <div className="h-12 animate-pulse rounded-lg bg-surface-raised" />
          <div className="h-12 animate-pulse rounded-lg bg-surface-raised" />
        </div>
      ) : units.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-line px-3 py-4 text-center text-xs text-txt-dim">
          {t("Nenhuma unidade criada ainda. Se você tem só um local de atendimento, não precisa criar nenhuma.")}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-lg border border-line">
          {units.map((unit) => (
            <li key={unit.id} className="flex items-center gap-3 bg-ink px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{unit.name}</p>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-txt-dim">
                  <Users className="h-3 w-3" aria-hidden />
                  {memberCounts[unit.id] ?? 0} {(memberCounts[unit.id] ?? 0) === 1 ? t("membro") : t("membros")}
                </p>
              </div>
              {!unit.is_active && <Badge tone="neutral">{t("Inativa")}</Badge>}
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => void openEdit(unit)}
                  className="focus-ring rounded-md p-1.5 text-txt-dim hover:bg-surface-hover hover:text-txt"
                  aria-label={t("Editar")}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => void handleDelete(unit)}
                  className="focus-ring rounded-md p-1.5 text-txt-dim hover:bg-danger-soft hover:text-danger"
                  aria-label={t("Excluir")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? t("Editar unidade") : t("Nova unidade")}
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="unit_name">{t("Nome")}</Label>
            <Input
              id="unit_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("ex: Unidade Centro")}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-line p-3">
            <div>
              <p className="text-sm font-medium">{t("Ativa")}</p>
              <p className="text-xs text-txt-dim">
                {t("Unidades inativas não aparecem no bloco de fluxo nem no filtro do inbox.")}
              </p>
            </div>
            <Switch checked={isActive} onChange={setIsActive} />
          </div>
          <div>
            <Label>{t("Membros da equipe nesta unidade")}</Label>
            <p className="-mt-0.5 mb-1.5 text-[11px] leading-snug text-txt-dim">
              {t("Quem estiver marcado só vai ver, no inbox, as conversas desta unidade (e as sem unidade). Dono e admin sempre veem tudo.")}
            </p>
            {members.length === 0 ? (
              <p className="text-xs text-txt-dim">{t("Nenhum outro membro na equipe ainda.")}</p>
            ) : (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
                {members.map((m) => (
                  <label
                    key={m.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-hover"
                  >
                    <input
                      type="checkbox"
                      checked={assigned.includes(m.id)}
                      onChange={() => toggleAssigned(m.id)}
                      className="accent-txt"
                    />
                    {m.name}
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>{t("Cancelar")}</Button>
            <Button onClick={() => void handleSave()} loading={saving}>{t("Salvar")}</Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
