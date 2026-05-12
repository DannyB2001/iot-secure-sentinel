import type { LucideIcon } from "lucide-react";
import { TONE, type Tone } from "@/lib/tone";
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "xl";

const SIZE_STYLES: Record<Size, { wrap: string; icon: string }> = {
  sm: { wrap: "h-8 w-8 rounded-lg", icon: "h-4 w-4" },
  md: { wrap: "h-9 w-9 rounded-lg", icon: "h-5 w-5" },
  xl: { wrap: "h-12 w-12 rounded-full", icon: "h-6 w-6" },
};

/**
 * Tone-aware icon container used by stat cards, empty states, activity rows.
 * Visual consistency comes from one place; callers pick a {@link Tone} and a {@link Size}.
 */
export function IconMedallion({
  icon: Icon,
  tone,
  size = "sm",
  className,
}: {
  icon: LucideIcon;
  tone: Tone;
  size?: Size;
  className?: string;
}) {
  const sizing = SIZE_STYLES[size];
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center",
        sizing.wrap,
        TONE[tone].iconWrap,
        className,
      )}
    >
      <Icon className={sizing.icon} aria-hidden="true" />
    </span>
  );
}
