"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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

const SEVERITY_TONE: Record<AlarmRow["severity"], "info" | "warning" | "critical"> = {
  info: "info",
  warning: "warning",
  critical: "critical",
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
    const body = await res.text();
    throw new Error(body || "Failed to acknowledge alarm");
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alarms"] }),
  });

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading alarms...</p>;
  if (query.isError) return <p className="text-sm text-destructive">Failed to load alarms.</p>;

  const items = query.data ?? [];
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No open alarms.</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-secondary text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-2">Severity</th>
            <th className="px-4 py-2">Device</th>
            <th className="px-4 py-2">Category</th>
            <th className="px-4 py-2">Message</th>
            <th className="px-4 py-2">Created</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {items.map((alarm) => (
            <tr key={alarm.id} className="border-t border-border">
              <td className="px-4 py-2">
                <Badge tone={SEVERITY_TONE[alarm.severity]}>{alarm.severity}</Badge>
              </td>
              <td className="px-4 py-2">
                <div className="font-medium">{alarm.deviceName}</div>
                {alarm.deviceLocation ? (
                  <div className="text-xs text-muted-foreground">{alarm.deviceLocation}</div>
                ) : null}
              </td>
              <td className="px-4 py-2 capitalize">{alarm.category}</td>
              <td className="px-4 py-2">{alarm.message}</td>
              <td className="px-4 py-2 text-xs text-muted-foreground">
                {new Date(alarm.createdAt).toLocaleString()}
              </td>
              <td className="px-4 py-2 text-right">
                {canAcknowledge ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => ack.mutate(alarm.id)}
                    disabled={ack.isPending}
                  >
                    {ack.isPending ? "..." : "Acknowledge"}
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
