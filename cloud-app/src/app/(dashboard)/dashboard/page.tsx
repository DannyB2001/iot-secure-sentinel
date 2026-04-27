import { connectDb } from "@/lib/db";
import { Alarm } from "@/models/Alarm";
import { Device } from "@/models/Device";
import { Event } from "@/models/Event";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

async function loadCounts() {
  await connectDb();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [devicesTotal, devicesOnline, alarmsOpen, alarmsCritical, eventsLast24h] = await Promise.all([
    Device.countDocuments(),
    Device.countDocuments({ status: "online" }),
    Alarm.countDocuments({ state: "open" }),
    Alarm.countDocuments({ state: "open", severity: "critical" }),
    Event.countDocuments({ timestamp: { $gte: since24h } }),
  ]);
  return { devicesTotal, devicesOnline, alarmsOpen, alarmsCritical, eventsLast24h };
}

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const counts = await loadCounts();

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard title="Devices" value={counts.devicesTotal} subtitle={`${counts.devicesOnline} online`} />
      <StatCard title="Open alarms" value={counts.alarmsOpen} subtitle="Awaiting acknowledgement" />
      <StatCard
        title="Critical alarms"
        value={counts.alarmsCritical}
        subtitle="Open + critical"
        highlight
      />
      <StatCard title="Events (24h)" value={counts.eventsLast24h} subtitle="Ingested in last 24 hours" />
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  highlight,
}: {
  title: string;
  value: number | string;
  subtitle: string;
  highlight?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={highlight ? "text-3xl font-bold text-destructive" : "text-3xl font-bold"}>
          {value}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      </CardContent>
    </Card>
  );
}
