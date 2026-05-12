"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, Bell, Cpu, OctagonAlert, Thermometer } from "lucide-react";
import { PollIndicator } from "@/components/PollIndicator";
import { RecentActivity } from "@/components/RecentActivity";
import { StatCard } from "@/components/StatCard";
import type { DashboardOverviewCounts } from "@/lib/dashboard-overview";
import { THRESHOLDS } from "@/services/alarm-classifier";

async function fetchOverview(): Promise<DashboardOverviewCounts> {
  const res = await fetch("/api/dashboard/overview", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load dashboard overview");
  return res.json();
}

const POLL_INTERVAL_SECONDS = 5;

export function DashboardOverview({ initialCounts }: { initialCounts: DashboardOverviewCounts }) {
  const query = useQuery({
    queryKey: ["dashboard", "overview"],
    queryFn: fetchOverview,
    initialData: initialCounts,
    refetchInterval: POLL_INTERVAL_SECONDS * 1000,
  });

  const counts = query.data;
  const subtitle = buildSubtitle(counts);
  const temperatureWarning =
    counts.latestTemperature !== null &&
    (counts.latestTemperature.value >= THRESHOLDS.tempWarnHigh ||
      counts.latestTemperature.value <= THRESHOLDS.tempWarnLow);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <PollIndicator
            intervalSeconds={POLL_INTERVAL_SECONDS}
            lastUpdated={query.dataUpdatedAt}
            isFetching={query.isFetching}
          />
        </div>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </header>

      <section aria-label="System health summary" className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Open alarms"
          icon={Bell}
          value={counts.alarmsOpen}
          subtitle={counts.alarmsOpen === 0 ? "Nothing to acknowledge" : "Awaiting acknowledgement"}
          tone={counts.alarmsOpen > 0 ? "warning" : "success"}
          href="/alarms"
          featured
        />
        <StatCard
          title="Critical"
          icon={OctagonAlert}
          value={counts.alarmsCritical}
          subtitle={counts.alarmsCritical === 0 ? "All clear" : "Needs an operator"}
          tone={counts.alarmsCritical > 0 ? "destructive" : "success"}
          href="/alarms"
        />
        <StatCard
          title="Devices"
          icon={Cpu}
          value={counts.devicesTotal}
          subtitle={`${counts.devicesOnline} online`}
          tone="primary"
          href="/devices"
        />
        <StatCard
          title="Temperature"
          icon={Thermometer}
          value={counts.latestTemperature ? `${counts.latestTemperature.value.toFixed(1)} C` : "-"}
          subtitle={counts.latestTemperature?.deviceName ?? "No reading yet"}
          tone={temperatureWarning ? "warning" : "neutral"}
          href="/devices"
        />
      </section>

      <section aria-label="Activity" className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Events (24h)"
          icon={Activity}
          value={counts.eventsLast24h}
          subtitle="Ingested across all devices"
          tone="neutral"
        />
        <div className="md:col-span-2">
          <RecentActivity items={counts.recentAlarms} />
        </div>
      </section>
    </div>
  );
}

function buildSubtitle(counts: DashboardOverviewCounts): string {
  if (counts.alarmsCritical > 0) {
    const noun = counts.alarmsCritical === 1 ? "alarm needs" : "alarms need";
    return `${counts.alarmsCritical} critical ${noun} an operator now.`;
  }
  if (counts.alarmsOpen > 0) {
    const noun = counts.alarmsOpen === 1 ? "alarm is" : "alarms are";
    return `${counts.alarmsOpen} open ${noun} waiting on acknowledgement.`;
  }
  return "No open alarms.";
}
