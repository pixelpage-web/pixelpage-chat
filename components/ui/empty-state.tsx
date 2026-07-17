import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Estado vazio ilustrado com ícone, título, descrição e ação opcional. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-14 text-center",
        className
      )}
    >
      <div className="relative mb-5">
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface-raised">
          <Icon className="h-6 w-6 text-txt-mut" aria-hidden />
        </div>
      </div>
      <h3 className="font-display text-sm font-semibold text-txt">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-txt-mut">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
