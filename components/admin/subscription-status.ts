/**
 * Mapeamento compartilhado de status de assinatura → tom/rótulo de Badge.
 * Extraído de app/admin/organizations/page.tsx para reuso no dashboard
 * financeiro (/admin/financeiro) sem duplicar a tabela.
 */

export const statusTone: Record<
  string,
  "lime" | "ok" | "amber" | "danger" | "neutral"
> = {
  trial: "lime",
  active: "ok",
  past_due: "amber",
  canceled: "danger",
};

export const statusLabel: Record<string, string> = {
  trial: "Trial",
  active: "Ativa",
  past_due: "Pendente",
  canceled: "Cancelada",
};
