"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, Bell, Cpu, OctagonAlert, Thermometer } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import type { DashboardOverviewCounts } from "@/lib/dashboard-overview";
import { TONE, type Tone } from "@/lib/tone";
import { cn } from "@/lib/utils";
import { THRESHOLDS } from "@/services/alarm-classifier";

async function fetchOverview(): Promise<DashboardOverviewCounts> {
  const res = await fetch("/api/dashboard/overview", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load dashboard overview");
  return res.json();
}

export function DashboardOverview({ initialCounts }: { initialCounts: DashboardOverviewCounts }) {
  const query = useQuery({
    queryKey: ["dashboard", "overview"],
    queryFn: fetchOverview,
    initialData: initialCounts,
    refetchInterval: 5000,
  });

  const counts = query.data;
  const allClear = counts.alarmsOpen === 0 && counts.alarmsCritical === 0;
  const overviewTone: Tone =
    counts.alarmsCritical > 0 ? "destructive" : allClear ? "success" : "warning";
  const temperatureWarning =
    counts.latestTemperature !== null &&
    (counts.latestTemperature.value >= THRESHOLDS.tempWarnHigh ||
      counts.latestTemperature.value <= THRESHOLDS.tempWarnLow);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <span className="text-xs text-muted-foreground">
            {query.isFetching ? "Updating..." : "Auto-refresh 5s"}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {allClear
            ? "All gateways are quiet. No open alarms."
            : counts.alarmsCritical > 0
              ? `${counts.alarmsCritical} critical ${counts.alarmsCritical === 1 ? "alarm needs" : "alarms need"} attention.`
              : `${counts.alarmsOpen} open ${counts.alarmsOpen === 1 ? "alarm" : "alarms"} waiting for acknowledgement.`}
        </p>
      </header>

      <section
        aria-label="System health summary"
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-5"
      >
        <StatCard
          title="Devices"
          icon={Cpu}
          value={counts.devicesTotal}
          subtitle={`${counts.devicesOnline} online`}
          tone="primary"
          href="/devices"
        />
        <StatCard
          title="Open alarms"
          icon={Bell}
          value={counts.alarmsOpen}
          subtitle={counts.alarmsOpen === 0 ? "Nothing to acknowledge" : "Awaiting acknowledgement"}
          tone={counts.alarmsOpen > 0 ? "warning" : "success"}
          href="/alarms"
        />
        <StatCard
          title="Critical alarms"
          icon={OctagonAlert}
          value={counts.alarmsCritical}
          subtitle={counts.alarmsCritical === 0 ? "All clear" : "Operator attention required"}
          tone={counts.alarmsCritical > 0 ? "destructive" : "success"}
          href="/alarms"
        />
        <StatCard
          title="Temperature"
          icon={Thermometer}
          value={
            counts.latestTemperature ? `${counts.latestTemperature.value.toFixed(1)} C` : "-"
          }
          subtitle={counts.latestTemperature?.deviceName ?? "No reading yet"}
          tone={temperatureWarning ? "warning" : "neutral"}
          href="/devices"
        />
        <StatCard
          title="Events (24h)"
          icon={Activity}
          value={counts.eventsLast24h}
          subtitle="Ingested in the last 24 hours"
          tone="neutral"
        />
      </section>

      <section
        aria-label="Iteration scope"
        className={cn(
          "rounded-xl border p-6 ring-1 ring-inset",
          overviewTone === "destructive" && "border-destructive/30",
          overviewTone === "warning" && "border-warning/30",
          overviewTone === "success" && "border-success/30",
          TONE[overviewTone].panel,
        )}
      >
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Iteration 1, MVP
          </p>
          <p className="text-base font-medium">
            Tamper detection and temperature monitoring across HARDWARIO Core Modules and the
            Raspberry Pi gateway.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Suricata IDS and firewall remediation arrive in iteration 2.
          </p>
        </div>
      </section>
    </div>
  );
}
