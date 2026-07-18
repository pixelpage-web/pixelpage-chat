"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Flag, Globe, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Card, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import type { FeatureFlagRow } from "@/types/database";

interface OrgOption {
  id: string;
  name: string;
}

export function FeatureFlagsManager({
  initialFlags,
  orgs,
}: {
  initialFlags: FeatureFlagRow[];
  orgs: OrgOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [flags, setFlags] = useState(initialFlags);
  const [saving, setSaving] = useState<string | null>(null);
  const [orgInput, setOrgInput] = useState<Record<string, string>>({});

  const supabase = createClient();

  async function toggleGlobal(flag: FeatureFlagRow) {
    const next = !flag.enabled_globally;
    setSaving(flag.id);
    try {
      const { error } = await supabase
        .from("feature_flags")
        .update({ enabled_globally: next })
        .eq("id", flag.id);
      if (error) throw error;
      setFlags((prev) => prev.map((f) => f.id === flag.id ? { ...f, enabled_globally: next } : f));
      toast.success(next ? `"${flag.name}" habilitada globalmente.` : `"${flag.name}" desabilitada globalmente.`);
      startTransition(() => router.refresh());
    } catch {
      toast.error("Não foi possível atualizar a flag.");
    } finally {
      setSaving(null);
    }
  }

  async function addOrg(flag: FeatureFlagRow) {
    const input = orgInput[flag.id]?.trim().toLowerCase();
    if (!input) return;

    // Encontrar org pelo nome ou id
    const org = orgs.find(
      (o) => o.name.toLowerCase() === input || o.id === input
    );
    if (!org) {
      toast.error("Organização não encontrada.");
      return;
    }
    if ((flag.enabled_for_orgs as string[]).includes(org.id)) {
      toast.error("Organização já adicionada.");
      return;
    }

    const next = [...(flag.enabled_for_orgs as string[]), org.id];
    setSaving(flag.id);
    try {
      const { error } = await supabase
        .from("feature_flags")
        .update({ enabled_for_orgs: next })
        .eq("id", flag.id);
      if (error) throw error;
      setFlags((prev) => prev.map((f) => f.id === flag.id ? { ...f, enabled_for_orgs: next } : f));
      setOrgInput((prev) => ({ ...prev, [flag.id]: "" }));
      toast.success(`${org.name} adicionada ao early access de "${flag.name}".`);
    } catch {
      toast.error("Não foi possível atualizar.");
    } finally {
      setSaving(null);
    }
  }

  async function removeOrg(flag: FeatureFlagRow, orgId: string) {
    const next = (flag.enabled_for_orgs as string[]).filter((id) => id !== orgId);
    setSaving(flag.id);
    try {
      const { error } = await supabase
        .from("feature_flags")
        .update({ enabled_for_orgs: next })
        .eq("id", flag.id);
      if (error) throw error;
      setFlags((prev) => prev.map((f) => f.id === flag.id ? { ...f, enabled_for_orgs: next } : f));
      toast.success("Organização removida do early access.");
    } catch {
      toast.error("Não foi possível remover.");
    } finally {
      setSaving(null);
    }
  }

  const orgNameById = new Map(orgs.map((o) => [o.id, o.name]));

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="font-display text-lg font-semibold">Feature Flags</h1>
        <p className="mt-0.5 text-sm text-txt-mut">
          Habilite ou desabilite funcionalidades por organização (early access) ou para todos.
        </p>
      </header>

      <div className="space-y-3">
        {flags.map((flag) => {
          const earlyOrgs = (flag.enabled_for_orgs as string[]).filter(Boolean);
          return (
            <div
              key={flag.id}
              className="relative overflow-hidden rounded-card border border-panel-border bg-panel-card p-6"
            >
              {/* Acento verde discreto (mesmo padrão do item ativo na sidebar
                  do admin, ver admin-shell.tsx) — não um contorno/glow claro
                  espalhado pelo card inteiro. */}
              {flag.enabled_globally && (
                <span
                  className="absolute inset-y-0 left-0 w-[3px] bg-forest"
                  aria-hidden
                />
              )}
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                    flag.enabled_globally ? "bg-surface-hover" : "bg-surface-raised"
                  )}>
                    <Flag className={cn("h-4 w-4", flag.enabled_globally ? "text-txt" : "text-txt-dim")} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{flag.name}</p>
                      <code className="rounded border border-line bg-ink px-1.5 py-0.5 text-[10px] text-txt-dim">
                        {flag.key}
                      </code>
                      {flag.enabled_globally ? (
                        <Badge tone="ok">
                          <Globe className="mr-1 h-3 w-3" />
                          Global
                        </Badge>
                      ) : earlyOrgs.length > 0 ? (
                        <Badge tone="amber">
                          {earlyOrgs.length} org{earlyOrgs.length !== 1 ? "s" : ""}
                        </Badge>
                      ) : (
                        <Badge tone="neutral">
                          <Lock className="mr-1 h-3 w-3" />
                          Desabilitada
                        </Badge>
                      )}
                    </div>
                    {flag.description && (
                      <p className="mt-0.5 text-xs text-txt-dim">{flag.description}</p>
                    )}
                  </div>
                </div>

                <Switch
                  checked={flag.enabled_globally}
                  onChange={() => void toggleGlobal(flag)}
                  label="Habilitar globalmente"
                  disabled={saving === flag.id || isPending}
                  variant="forest"
                />
              </div>

              {/* Early access por org */}
              {!flag.enabled_globally && (
                <div className="mt-4 border-t border-line pt-4">
                  <p className="mb-2 text-xs font-medium text-txt-mut">Early access por organização</p>

                  {earlyOrgs.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {earlyOrgs.map((orgId) => (
                        <span
                          key={orgId}
                          className="flex items-center gap-1.5 rounded-full border border-line bg-surface-raised px-2.5 py-1 text-xs"
                        >
                          {orgNameById.get(orgId) ?? orgId.slice(0, 8) + "…"}
                          <button
                            onClick={() => void removeOrg(flag, orgId)}
                            className="ml-0.5 text-txt-dim hover:text-danger"
                            aria-label="Remover"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Input
                      value={orgInput[flag.id] ?? ""}
                      onChange={(e) => setOrgInput((prev) => ({ ...prev, [flag.id]: e.target.value }))}
                      placeholder="Nome da organização (early access)"
                      className="flex-1"
                      onKeyDown={(e) => { if (e.key === "Enter") void addOrg(flag); }}
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void addOrg(flag)}
                      disabled={saving === flag.id}
                    >
                      Adicionar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {flags.length === 0 && (
        <Card className="py-12 text-center">
          <Flag className="mx-auto h-8 w-8 text-txt-dim" />
          <p className="mt-3 font-medium">Nenhuma feature flag</p>
          <p className="mt-1 text-sm text-txt-dim">Execute a migration 0013 para criar as flags padrão.</p>
        </Card>
      )}
    </div>
  );
}
