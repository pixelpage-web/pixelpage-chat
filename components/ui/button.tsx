import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  // Alto contraste neutro invertido (txt/ink) — sem cor, efeito tipo
  // Linear/Vercel. Verde fica reservado só ao logo/wordmark
  // (components/logo.tsx) — nada mais no sistema usa verde.
  primary:
    "bg-txt text-ink font-semibold hover:bg-txt/90 active:bg-txt/80 disabled:bg-txt/40",
  secondary:
    "bg-surface-raised text-txt border border-line hover:bg-surface-hover hover:border-line-strong",
  ghost: "text-txt-mut hover:text-txt hover:bg-surface-raised",
  danger:
    "bg-danger-soft text-danger border border-danger/30 hover:bg-danger/20",
  outline:
    "border border-line-strong text-txt hover:border-txt-mut hover:bg-surface-raised",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-11 px-6 text-sm gap-2",
  icon: "h-9 w-9",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variant = "primary", size = "md", loading, disabled, children, ...props },
    ref
  ) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "focus-ring inline-flex select-none items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-60",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {children}
      </button>
    );
  }
);
