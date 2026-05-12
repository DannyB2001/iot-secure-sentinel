import Link from "next/link";
import {
  ArrowRight,
  BatteryLow,
  Bell,
  Check,
  Eye,
  ShieldAlert,
  Thermometer,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import { RelativeTime } from "@/components/RelativeTime";
import { IconMedallion } from "@/components/ui/IconMedallion";
import type { RecentAlarmSummary } from "@/lib/dashboard-overview";
import type { AlarmCategory, AlarmSeverity, AlarmState } from "@/lib/validation/alarm";
import type { Tone } from "@/lib/tone";
import { cn } from "@/lib/utils";

const CATEGORY_ICON: Record<AlarmCategory, LucideIcon> = {
  temperature: Thermometer,
  tamper: ShieldAlert,
  battery: BatteryLow,
  offline: WifiOff,
};

const SEVERITY_TONE: Record<AlarmSeverity, Tone> = {
  critical: "destructive",
  warning: "warning",
  info: "info",
};

const STATE_LABEL: Record<AlarmState, { label: string; icon: LucideIcon | null }> = {
  open: { label: "Open", icon: null },
  acknowledged: { label: "Acknowledged", icon: Eye },
  resolved: { label: "Resolved", icon: Check },
};

export function RecentActivity({ items }: { items: RecentAlarmSummary[] }) {
  return (
    <section
      aria-label="Recent alarm activity"
      className="flex flex-col rounded-xl border border-border bg-card shadow-sm"
    >
      <header className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold tracking-tight">Recent alarms</h2>
        </div>
        <Link
          href="/alarms"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary outline-none hover:underline focus-visible:underline"
        >
          Open alarms <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </header>
      {items.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground">
          No alarms recorded yet. Once the gateway forwards an event, it lands here.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((alarm) => {
            const stateMeta = STATE_LABEL[alarm.state];
            const StateIcon = stateMeta.icon;
            return (
              <li key={alarm.id} className="flex items-start gap-3 px-5 py-3">
                <IconMedallion
                  icon={CATEGORY_ICON[alarm.category]}
                  tone={SEVERITY_TONE[alarm.severity]}
                  size="sm"
                  className="mt-0.5 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="truncate text-sm font-medium" title={alarm.message}>
                      {alarm.message}
                    </p>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                        alarm.state === "open"
                          ? "bg-warning-soft text-warning"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {StateIcon ? <StateIcon className="h-3 w-3" aria-hidden="true" /> : null}
                      {stateMeta.label}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {alarm.deviceName} <span aria-hidden="true">{"·"}</span>{" "}
                    <RelativeTime date={alarm.createdAt} />
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
