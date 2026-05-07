"use client";

import { useQuery } from "@tanstack/react-query";
import { BatteryLow, Cpu, Router, ServerCrash, Thermometer } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { RelativeTime } from "@/components/RelativeTime";
import { StatusDot } from "@/components/StatusDot";
import { cn } from "@/lib/utils";
import { THRESHOLDS } from "@/services/alarm-classifier";

type DeviceRow = {
  id: string;
  name: string;
  type: "iotNode" | "gateway";
  status: "online" | "warning" | "offline";
  location: string | null;
  lastSeen: string | null;
  firmwareVersion: string | null;
  batteryVoltage: number | null;
  temperatureC: number | null;
  temperatureAt: string | null;
};

const NO_VALUE = "-";

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

  if (query.isLoading) return <DevicesSkeleton />;
  if (query.isError) {
    return (
      <EmptyState
        icon={ServerCrash}
        tone="destructive"
        title="Cannot reach the device list"
        description="Check the gateway and cloud connectivity, then refresh."
      />
    );
  }

  const items = query.data ?? [];
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Cpu}
        title="No devices registered yet."
        description="Once a gateway or sensor node registers, it will appear here."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
      <table className="w-full min-w-[920px] text-sm">
        <thead className="border-b border-border bg-secondary/40 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-6 py-3">Device</th>
            <th className="px-6 py-3">Status</th>
            <th className="px-6 py-3">Location</th>
            <th className="px-6 py-3">Temperature</th>
            <th className="px-6 py-3">Battery</th>
            <th className="px-6 py-3">Firmware</th>
            <th className="px-6 py-3">Last seen</th>
          </tr>
        </thead>
        <tbody>
          {items.map((device) => {
            const Icon = device.type === "gateway" ? Router : Cpu;
            const lowBattery =
              device.batteryVoltage !== null && device.batteryVoltage <= THRESHOLDS.batteryWarn;
            const temperatureWarning =
              device.temperatureC !== null &&
              (device.temperatureC >= THRESHOLDS.tempWarnHigh ||
                device.temperatureC <= THRESHOLDS.tempWarnLow);
            return (
              <tr
                key={device.id}
                className="border-t border-border transition-colors first:border-t-0 hover:bg-secondary/40"
              >
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div>
                      <div className="font-medium">{device.name}</div>
                      <div className="text-xs capitalize text-muted-foreground">
                        {device.type === "iotNode" ? "IoT node" : "Gateway"}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <StatusDot status={device.status} />
                </td>
                <td className="px-6 py-4 text-muted-foreground">{device.location ?? NO_VALUE}</td>
                <td className="px-6 py-4 tabular-nums">
                  {device.temperatureC !== null ? (
                    <div className="flex flex-col gap-0.5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1",
                          temperatureWarning ? "text-warning" : "text-foreground",
                        )}
                      >
                        <Thermometer className="h-4 w-4" aria-hidden="true" />
                        {device.temperatureC.toFixed(1)} C
                      </span>
                      {device.temperatureAt ? (
                        <span className="text-xs text-muted-foreground">
                          <RelativeTime date={device.temperatureAt} />
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">{NO_VALUE}</span>
                  )}
                </td>
                <td className="px-6 py-4 tabular-nums">
                  {device.batteryVoltage !== null ? (
                    <span
                      className={
                        lowBattery
                          ? "inline-flex items-center gap-1 text-warning"
                          : "text-foreground"
                      }
                    >
                      {lowBattery ? <BatteryLow className="h-4 w-4" aria-hidden="true" /> : null}
                      {device.batteryVoltage.toFixed(2)} V
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{NO_VALUE}</span>
                  )}
                </td>
                <td className="px-6 py-4 font-mono text-xs text-muted-foreground">
                  {device.firmwareVersion ?? NO_VALUE}
                </td>
                <td className="px-6 py-4 text-xs text-muted-foreground">
                  {device.lastSeen ? <RelativeTime date={device.lastSeen} /> : "never"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DevicesSkeleton() {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
      <div className="px-6 py-3">
        <div className="grid grid-cols-7 gap-4 border-b border-border pb-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-3 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
      <div className="space-y-3 p-6">
        {Array.from({ length: 4 }).map((_, row) => (
          <div key={row} className="grid grid-cols-7 items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 animate-pulse rounded-lg bg-muted" />
              <div className="space-y-1.5">
                <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                <div className="h-2 w-12 animate-pulse rounded bg-muted" />
              </div>
            </div>
            {Array.from({ length: 5 }).map((_, col) => (
              <div key={col} className="h-3 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
