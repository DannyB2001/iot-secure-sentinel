import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "default" | "info" | "warning" | "critical" | "success" | "muted";

const TONE_STYLES: Record<Tone, string> = {
  default: "bg-secondary text-secondary-foreground",
  info: "bg-blue-100 text-blue-900",
  warning: "bg-warning/20 text-warning-foreground",
  critical: "bg-destructive/15 text-destructive",
  success: "bg-success/15 text-success",
  muted: "bg-muted text-muted-foreground",
};

export function Badge({
  tone = "default",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        TONE_STYLES[tone],
        className,
      )}
      {...props}
    />
  );
}
