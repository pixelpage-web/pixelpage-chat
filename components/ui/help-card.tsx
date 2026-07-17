import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Card de introdução no topo das páginas (ajuda inline).
 * Explica em uma frase para que a página serve.
 */
export function HelpCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-2.5",
        className
      )}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-txt-mut" aria-hidden />
      <p className="text-xs leading-relaxed text-txt-mut">{children}</p>
    </div>
  );
}
