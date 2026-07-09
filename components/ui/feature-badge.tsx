"use client";

import { Unlock } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Badge exibido quando o Super Admin está vendo um recurso que o plano da
 * organização não cobre (override de acesso). Usuários normais nunca veem.
 */
export function FeatureBadge({
  requiredPlan,
  className,
}: {
  requiredPlan: string;
  className?: string;
}) {
  const t = useT();
  return (
    <span
      title={t("Seu email de Super Admin libera este recurso para demonstração e testes. Clientes neste plano não têm acesso — para liberar, eles precisam fazer upgrade.")}
      className={cn(
        "inline-flex cursor-help items-center gap-1 rounded-full bg-lime-soft px-2 py-0.5 text-[11px] font-medium leading-4 text-lime",
        className
      )}
    >
      <Unlock className="h-3 w-3 shrink-0" aria-hidden />
      {t("Recurso do plano")} {requiredPlan} — {t("visível como Super Admin")}
    </span>
  );
}
