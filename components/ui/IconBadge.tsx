import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: { box: "h-9 w-9", icon: "h-4 w-4" },
  md: { box: "h-11 w-11", icon: "h-5 w-5" },
  lg: { box: "h-14 w-14", icon: "h-6 w-6" },
} as const;

interface IconBadgeProps {
  icon: LucideIcon;
  size?: keyof typeof SIZES;
  className?: string;
}

/** Badge circular com ícone — neutro (verde reservado só ao logo/wordmark). */
export function IconBadge({ icon: Icon, size = "md", className }: IconBadgeProps) {
  const { box, icon } = SIZES[size];
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border",
        box,
        className
      )}
      style={{
        background: "var(--surface-2)",
        borderColor: "var(--border)",
      }}
    >
      <Icon className={icon} style={{ color: "var(--text-muted)" }} aria-hidden />
    </div>
  );
}
