"use client";

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
        "inline-flex cursor-help items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4",
        className
      )}
      style={{ backgroundColor: "rgba(93, 214, 44, 0.15)", color: "#5DD62C" }}
    >
      🔓 {t("Recurso do plano")} {requiredPlan} — {t("visível como Super Admin")}
    </span>
  );
}
