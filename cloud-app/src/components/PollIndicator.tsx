"use client";

import { useEffect, useState } from "react";
import { formatSecondsAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Live freshness indicator for polled data.
 *
 * - With `lastUpdated`: shows "Updated 3s ago" and ticks every second.
 * - Without `lastUpdated`: falls back to "Refreshes every Xs" (used on server-rendered headers).
 * - `isFetching`: when true, the dot pulses harder to signal an in-flight refetch.
 */
export function PollIndicator({
  intervalSeconds,
  lastUpdated,
  isFetching = false,
  className,
}: {
  intervalSeconds: number;
  lastUpdated?: number;
  isFetching?: boolean;
  className?: string;
}) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (lastUpdated == null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [lastUpdated]);

  const label =
    lastUpdated != null && now != null
      ? formatSecondsAgo((now - lastUpdated) / 1000)
      : `Refreshes every ${intervalSeconds}s`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground",
        className,
      )}
      aria-label={`Refreshes every ${intervalSeconds} seconds`}
    >
      <span className="relative inline-flex h-1.5 w-1.5">
        <span
          className={cn(
            "absolute inset-0 rounded-full bg-success",
            isFetching ? "animate-pulse-soft" : "opacity-70",
          )}
        />
      </span>
      {label}
    </span>
  );
}
