import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { TONE, type Tone } from "@/lib/tone";

type EmptyStateTone = Extract<Tone, "neutral" | "success" | "destructive" | "warning" | "info">;

export function EmptyState({
  icon: Icon,
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
  const style = TONE[tone];
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl px-6 py-10 text-center ring-1 ring-inset",
        style.panel,
      )}
    >
      <span
        className={cn("flex h-12 w-12 items-center justify-center rounded-full", style.iconWrap)}
      >
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
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
