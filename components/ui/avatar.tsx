import { cn, initials } from "@/lib/utils";

/** Cores determinísticas por nome para avatares sem foto. */
const palettes = [
  "bg-[#2E3B2A] text-lime",
  "bg-[#3B2A2E] text-[#F4A0B5]",
  "bg-[#2A323B] text-[#7FC4F4]",
  "bg-[#3B362A] text-amber",
  "bg-[#2F2A3B] text-[#B6A0F4]",
  "bg-[#2A3B38] text-ok",
];

function paletteFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return palettes[Math.abs(hash) % palettes.length];
}

export function Avatar({
  name,
  imageUrl,
  size = "md",
  className,
  colorSeed,
}: {
  name: string | null | undefined;
  imageUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Seed determinístico para cor de fundo (usa contact.id para Meta API onde não há foto). */
  colorSeed?: string;
}) {
  const sizes = {
    sm: "h-8 w-8 text-[11px]",
    md: "h-10 w-10 text-xs",
    lg: "h-12 w-12 text-sm",
  };

  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <div
        className={cn(
          "shrink-0 overflow-hidden rounded-full",
          sizes[size],
          className
        )}
        aria-hidden
      >
        <img src={imageUrl} alt="" className="h-full w-full object-cover" />
      </div>
    );
  }

  const display = name?.trim() || "?";
  return (
    <div
      className={cn(
        "flex shrink-0 select-none items-center justify-center rounded-full font-semibold",
        sizes[size],
        paletteFor(colorSeed ?? display),
        className
      )}
      aria-hidden
    >
      {initials(display)}
    </div>
  );
}
