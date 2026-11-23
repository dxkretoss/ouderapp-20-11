import { cn } from "@/lib/utils";

/** Herkenbaar rond merkteken van Co, de digitale meedenker: donkergroen, subtiel driedimensionaal, zonder gezicht. */
export function CoBadge({ maat = "md", className }: { maat?: "sm" | "md" | "lg"; className?: string }) {
  const maten = { sm: "size-6 text-[10px]", md: "size-8 text-xs", lg: "size-11 text-sm" } as const;
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold tracking-tight text-ai-ink",
        "bg-ai-space [background:radial-gradient(circle_at_32%_28%,var(--ai-reply)_0%,var(--ai-space)_62%)]",
        "ring-1 ring-inset ring-ai-soft/40",
        maten[maat],
        className,
      )}
    >
      Co
    </span>
  );
}
