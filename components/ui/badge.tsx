import { cn } from "@/lib/utils";

type Tone = "lime" | "amber" | "danger" | "ok" | "neutral";

const tones: Record<Tone, string> = {
  lime: "bg-lime-soft text-lime border-lime/25",
  amber: "bg-amber-soft text-amber border-amber/25",
  danger: "bg-danger-soft text-danger border-danger/25",
  ok: "bg-ok-soft text-ok border-ok/25",
  neutral: "bg-surface-raised text-txt-mut border-line",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
