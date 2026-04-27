import { cn } from "@/lib/utils";

type DeviceStatus = "online" | "warning" | "offline";

const STYLES: Record<DeviceStatus, { dot: string; ring: string; label: string }> = {
  online: {
    dot: "bg-success",
    ring: "ring-success/30",
    label: "text-success",
  },
  warning: {
    dot: "bg-warning",
    ring: "ring-warning/30",
    label: "text-warning",
  },
  offline: {
    dot: "bg-muted-foreground/60",
    ring: "ring-muted-foreground/15",
    label: "text-muted-foreground",
  },
};

export function StatusDot({
  status,
  showLabel = true,
  className,
}: {
  status: DeviceStatus;
  showLabel?: boolean;
  className?: string;
}) {
  const style = STYLES[status];
  return (
    <span className={cn("inline-flex items-center gap-2 text-sm font-medium", className)}>
      <span className="relative inline-flex h-2.5 w-2.5">
        <span
          className={cn(
            "absolute inset-0 rounded-full ring-4",
            style.dot,
            style.ring,
            status === "online" && "animate-pulse-soft",
          )}
        />
      </span>
      {showLabel ? <span className={cn("capitalize", style.label)}>{status}</span> : null}
    </span>
  );
}
