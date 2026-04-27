import { cn } from "@/lib/utils";

export function PollIndicator({
  intervalSeconds,
  className,
}: {
  intervalSeconds: number;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}
      aria-label={`Auto-refreshes every ${intervalSeconds} seconds`}
    >
      <span className="relative inline-flex h-1.5 w-1.5">
        <span className="absolute inset-0 animate-pulse-soft rounded-full bg-success" />
      </span>
      Live, refreshes every {intervalSeconds}s
    </span>
  );
}
