import type { LucideIcon } from "lucide-react";
import { IconMedallion } from "@/components/ui/IconMedallion";
import { TONE, type Tone } from "@/lib/tone";
import { cn } from "@/lib/utils";

type EmptyStateTone = Extract<Tone, "neutral" | "success" | "destructive" | "warning" | "info">;

export function EmptyState({
  icon,
  title,
  description,
  tone = "neutral",
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  tone?: EmptyStateTone;
  action?: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl px-6 py-10 text-center ring-1 ring-inset",
        TONE[tone].panel,
      )}
    >
      <IconMedallion icon={icon} tone={tone} size="xl" />
      <div className="space-y-1">
        <p className="text-base font-semibold">{title}</p>
        {description ? (
          <p className="max-w-md text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
