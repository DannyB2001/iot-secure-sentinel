"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";

type DeviceRow = {
  id: string;
  name: string;
  type: "iotNode" | "gateway";
  status: "online" | "warning" | "offline";
  location: string | null;
  lastSeen: string | null;
  firmwareVersion: string | null;
  batteryVoltage: number | null;
};

const STATUS_TONE: Record<DeviceRow["status"], "success" | "warning" | "muted"> = {
  online: "success",
  warning: "warning",
  offline: "muted",
};

async function fetchDevices(): Promise<DeviceRow[]> {
  const res = await fetch("/api/device/list", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load devices");
  const data = (await res.json()) as { items: DeviceRow[] };
  return data.items;
}

export function DeviceTable() {
  const query = useQuery({
    queryKey: ["devices"],
    queryFn: fetchDevices,
    refetchInterval: 10000,
  });

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading devices...</p>;
  if (query.isError) return <p className="text-sm text-destructive">Failed to load devices.</p>;

  const items = query.data ?? [];
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No devices registered.</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-secondary text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Type</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2">Location</th>
            <th className="px-4 py-2">Battery</th>
            <th className="px-4 py-2">Last seen</th>
          </tr>
        </thead>
        <tbody>
          {items.map((device) => (
            <tr key={device.id} className="border-t border-border">
              <td className="px-4 py-2 font-medium">{device.name}</td>
              <td className="px-4 py-2">{device.type}</td>
              <td className="px-4 py-2">
                <Badge tone={STATUS_TONE[device.status]}>{device.status}</Badge>
              </td>
              <td className="px-4 py-2">{device.location ?? "-"}</td>
              <td className="px-4 py-2">
                {device.batteryVoltage !== null ? `${device.batteryVoltage.toFixed(2)} V` : "-"}
              </td>
              <td className="px-4 py-2 text-xs text-muted-foreground">
                {device.lastSeen ? new Date(device.lastSeen).toLocaleString() : "never"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
