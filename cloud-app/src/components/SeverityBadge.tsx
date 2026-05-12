import { AlertTriangle, Info, OctagonAlert, type LucideIcon } from "lucide-react";
import type { AlarmSeverity } from "@/lib/validation/alarm";
import { cn } from "@/lib/utils";

const STYLES: Record<AlarmSeverity, { wrap: string; icon: LucideIcon; label: string }> = {
  info: {
    wrap: "bg-info-soft text-info ring-info/20",
    icon: Info,
    label: "Info",
  },
  warning: {
    wrap: "bg-warning-soft text-warning ring-warning/30",
    icon: AlertTriangle,
    label: "Warning",
  },
  critical: {
    wrap: "bg-destructive-soft text-destructive ring-destructive/30",
    icon: OctagonAlert,
    label: "Critical",
  },
};

export function SeverityBadge({
  severity,
  className,
}: {
  severity: AlarmSeverity;
  className?: string;
}) {
  const style = STYLES[severity];
  const Icon = style.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        style.wrap,
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {style.label}
    </span>
  );
}
