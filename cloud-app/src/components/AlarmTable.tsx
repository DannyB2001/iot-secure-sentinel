"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { RelativeTime } from "@/components/RelativeTime";
import { SeverityBadge } from "@/components/SeverityBadge";
import { extractUuAppErrorMessage } from "@/lib/uu-error";

type AlarmRow = {
  id: string;
  deviceName: string;
  deviceLocation: string | null;
  severity: "info" | "warning" | "critical";
  category: string;
  message: string;
  state: "open" | "acknowledged" | "resolved";
  createdAt: string;
};

async function fetchAlarms(): Promise<AlarmRow[]> {
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

  const query = useQuery({
    queryKey: ["alarms", "open"],
    queryFn: fetchAlarms,
    refetchInterval: 5000,
  });

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

  const items = query.data ?? [];
  if (items.length === 0) {
    return (
      <EmptyState
        icon={ShieldCheck}
        tone="success"
        title="All clear."
        description="No open alarms. Polling continues every 5 seconds."
      />
    );
  }

  return (
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
          {items.map((alarm) => (
            <tr
              key={alarm.id}
              className="border-t border-border transition-colors first:border-t-0 hover:bg-secondary/40"
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
              <td className="px-6 py-4">{alarm.message}</td>
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
                    {ack.isPending ? "Working..." : "Acknowledge"}
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">view only</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AlarmsSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="px-6 py-3">
        <div className="grid grid-cols-6 gap-4 border-b border-border pb-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-3 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
      <div className="space-y-3 p-6">
        {Array.from({ length: 4 }).map((_, row) => (
          <div key={row} className="grid grid-cols-6 items-center gap-4">
            <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
            <div className="space-y-1.5">
              <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              <div className="h-2 w-12 animate-pulse rounded bg-muted" />
            </div>
            {Array.from({ length: 3 }).map((_, col) => (
              <div key={col} className="h-3 animate-pulse rounded bg-muted" />
            ))}
            <div className="ml-auto h-8 w-28 animate-pulse rounded-md bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
