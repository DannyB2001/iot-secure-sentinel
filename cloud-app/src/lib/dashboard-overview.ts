import { Alarm } from "@/models/Alarm";
import { Device } from "@/models/Device";
import { Event } from "@/models/Event";
import { connectDb } from "./db";

export type DashboardOverviewCounts = {
  devicesTotal: number;
  devicesOnline: number;
  alarmsOpen: number;
  alarmsCritical: number;
  eventsLast24h: number;
};

export async function loadDashboardOverview(): Promise<DashboardOverviewCounts> {
  await connectDb();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [devicesTotal, devicesOnline, alarmsOpen, alarmsCritical, eventsLast24h] =
    await Promise.all([
      Device.countDocuments(),
      Device.countDocuments({ status: "online" }),
      Alarm.countDocuments({ state: "open" }),
      Alarm.countDocuments({ state: "open", severity: "critical" }),
      Event.countDocuments({ timestamp: { $gte: since24h } }),
    ]);

  return { devicesTotal, devicesOnline, alarmsOpen, alarmsCritical, eventsLast24h };
}
