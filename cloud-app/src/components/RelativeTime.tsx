"use client";

import { useEffect, useState } from "react";
import { formatAbsolute, formatRelative } from "@/lib/format";

export function RelativeTime({ date, className }: { date: string | Date; className?: string }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <time
      dateTime={typeof date === "string" ? date : date.toISOString()}
      title={formatAbsolute(date)}
      className={className}
    >
      {formatRelative(date)}
    </time>
  );
}
