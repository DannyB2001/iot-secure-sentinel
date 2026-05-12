"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AlarmsSkeleton } from "@/components/AlarmsSkeleton";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { PollIndicator } from "@/components/PollIndicator";
import { RelativeTime } from "@/components/RelativeTime";
import { SeverityBadge } from "@/components/SeverityBadge";
import { cn } from "@/lib/utils";
import { extractUuAppErrorMessage } from "@/lib/uu-error";
import { parseSeverityFilter, type SeverityFilter } from "@/lib/url-params";
import type {
  AlarmCategory,
  AlarmSeverity,
  AlarmState,
} from "@/lib/validation/alarm";

const POLL_INTERVAL_SECONDS = 5;
const FLASH_DURATION_MS = 1500;

const FILTERS: ReadonlyArray<{ id: SeverityFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "critical", label: "Critical" },
  { id: "warning", label: "Warning" },
  { id: "info", label: "Info" },
];

type AlarmRow = {
  id: string;
  deviceName: string;
  deviceLocation: string | null;
  severity: AlarmSeverity;
  category: AlarmCategory;
  message: string;
  state: AlarmState;
  createdAt: string;
};

async function fetchAlarms(): Promise<AlarmRow[]> {
  // We fetch all open alarms (no severity in the URL) so the filter pill
  // counts reflect the full open set. The client filters in memory.
  const res = await fetch("/api/alarm/list?state=open", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load alarms");
  const data = (await res.json()) as { items: AlarmRow[] };
  return data.items;
}

async function acknowledgeAlarm(alarmId: string): Promise<void> {
  const res = await fetch("/api/alarm/acknowledge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ alarmId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = extractUuAppErrorMessage(body) ?? "Failed to acknowledge alarm.";
    throw new Error(message);
  }
}

export function AlarmTable({ canAcknowledge }: { canAcknowledge: boolean }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeFilter = parseSeverityFilter(searchParams.get("severity"));

  const query = useQuery({
    queryKey: ["alarms", "open"],
    queryFn: fetchAlarms,
    refetchInterval: POLL_INTERVAL_SECONDS * 1000,
  });

  const items = useMemo(() => query.data ?? [], [query.data]);

  // New-alarm detection. Runs only on committed renders after a data update.
  // `previousIdsRef` is read and written inside this effect, never during render.
  const previousIdsRef = useRef<Set<string> | null>(null);
  const [newIds, setNewIds] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (!query.isSuccess) return;

    const currentIds = new Set(items.map((a) => a.id));

    if (previousIdsRef.current == null) {
      previousIdsRef.current = currentIds;
      return;
    }

    const trulyNew: AlarmRow[] = [];
    for (const alarm of items) {
      if (!previousIdsRef.current.has(alarm.id)) trulyNew.push(alarm);
    }
    previousIdsRef.current = currentIds;

    // Always replace newIds. An empty set clears any stale flash from prior
    // refetches before the FLASH_DURATION_MS timer would have fired.
    setNewIds(new Set(trulyNew.map((a) => a.id)));

    if (trulyNew.length === 0) return;

    const criticals = trulyNew.filter((a) => a.severity === "critical");
    if (criticals.length === 1) {
      toast.error(`Critical alarm: ${criticals[0].deviceName}`, {
        description: criticals[0].message,
      });
    } else if (criticals.length > 1) {
      const others = criticals.length - 1;
      toast.error(`${criticals.length} new critical alarms`, {
        description: `${criticals[0].deviceName} and ${others} other${others === 1 ? "" : "s"}`,
      });
    }

    const id = setTimeout(() => setNewIds(new Set()), FLASH_DURATION_MS);
    return () => clearTimeout(id);
  }, [items, query.isSuccess, query.dataUpdatedAt]);

  const ack = useMutation({
    mutationFn: acknowledgeAlarm,
    onSuccess: () => {
      toast.success("Alarm acknowledged.");
      queryClient.invalidateQueries({ queryKey: ["alarms"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  function selectFilter(next: SeverityFilter) {
    const sp = new URLSearchParams(searchParams.toString());
    if (next === "all") sp.delete("severity");
    else sp.set("severity", next);
    router.replace(`?${sp.toString()}`, { scroll: false });
  }

  const counts: Record<SeverityFilter, number> = {
    all: items.length,
    critical: items.filter((a) => a.severity === "critical").length,
    warning: items.filter((a) => a.severity === "warning").length,
    info: items.filter((a) => a.severity === "info").length,
  };

  const filtered =
    activeFilter === "all" ? items : items.filter((a) => a.severity === activeFilter);

  if (query.isLoading) return <AlarmsSkeleton />;
  if (query.isError) {
    return (
      <EmptyState
        icon={ShieldCheck}
        tone="destructive"
        title="Cannot reach the alarm feed"
        description="Refresh in a moment, or check the gateway and cloud connectivity."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filter alarms by severity" className="flex flex-wrap gap-1">
          {FILTERS.map((filter) => {
            const isActive = activeFilter === filter.id;
            const count = counts[filter.id];
            return (
              <button
                key={filter.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => selectFilter(filter.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/70",
                )}
              >
                {filter.label}
                <span
                  className={cn(
                    "tabular-nums rounded-full px-1.5 py-px text-[10px]",
                    isActive ? "bg-primary-foreground/15" : "bg-card text-muted-foreground",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <PollIndicator
          intervalSeconds={POLL_INTERVAL_SECONDS}
          lastUpdated={query.dataUpdatedAt}
          isFetching={query.isFetching}
        />
      </div>

      {filtered.length === 0 ? (
        items.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            tone="success"
            title="All clear."
            description={`No open alarms. Polling continues every ${POLL_INTERVAL_SECONDS} seconds.`}
          />
        ) : (
          <EmptyState
            icon={ShieldCheck}
            tone="neutral"
            title={`No ${activeFilter} alarms right now`}
            description="Switch the filter back to All to see other severities."
          />
        )
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-secondary/40 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-6 py-3">Severity</th>
                <th className="px-6 py-3">Device</th>
                <th className="px-6 py-3">Category</th>
                <th className="px-6 py-3">Message</th>
                <th className="px-6 py-3">When</th>
                <th className="px-6 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((alarm) => (
                <tr
                  key={alarm.id}
                  className={cn(
                    "border-t border-border transition-colors first:border-t-0 hover:bg-secondary/40",
                    newIds.has(alarm.id) && "alarm-flash",
                  )}
                >
                  <td className="px-6 py-4">
                    <SeverityBadge severity={alarm.severity} />
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium">{alarm.deviceName}</div>
                    {alarm.deviceLocation ? (
                      <div className="text-xs text-muted-foreground">{alarm.deviceLocation}</div>
                    ) : null}
                  </td>
                  <td className="px-6 py-4 capitalize text-muted-foreground">{alarm.category}</td>
                  <td className="px-6 py-4" title={alarm.message}>
                    {alarm.message}
                  </td>
                  <td className="px-6 py-4 text-xs text-muted-foreground">
                    <RelativeTime date={alarm.createdAt} />
                  </td>
                  <td className="px-6 py-4 text-right">
                    {canAcknowledge ? (
                      <Button
                        size="sm"
                        variant={alarm.severity === "critical" ? "default" : "outline"}
                        onClick={() => ack.mutate(alarm.id)}
                        disabled={ack.isPending}
                      >
                        <Check />
                        {ack.isPending ? "Working" : "Acknowledge"}
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">Read-only role</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
