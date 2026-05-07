import { Alarm } from "@/models/Alarm";
import { Device } from "@/models/Device";
import { Event } from "@/models/Event";
import { connectDb } from "./db";
import { effectiveDeviceStatus, ensureOfflineTamperAlarms } from "./device-status";

export type DashboardOverviewCounts = {
  devicesTotal: number;
  devicesOnline: number;
  alarmsOpen: number;
  alarmsCritical: number;
  eventsLast24h: number;
  latestTemperature: {
    value: number;
    timestamp: Date;
    deviceName: string;
  } | null;
};

export async function loadDashboardOverview(): Promise<DashboardOverviewCounts> {
  await connectDb();
  await ensureOfflineTamperAlarms();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [devices, alarmsOpen, alarmsCritical, eventsLast24h, latestTemperature] =
    await Promise.all([
      Device.find().select("status lastSeen lastSeenAt").lean(),
      Alarm.countDocuments({ state: "open" }),
      Alarm.countDocuments({ state: "open", severity: "critical" }),
      Event.countDocuments({ timestamp: { $gte: since24h } }),
      Event.findOne({ type: "temperature", value: { $type: "number" } })
        .select("deviceId value timestamp")
        .sort({ timestamp: -1 })
        .lean(),
    ]);
  const devicesTotal = devices.length;
  const devicesOnline = devices.filter(
    (device) => effectiveDeviceStatus(device) === "online",
  ).length;
  const latestTemperatureDevice = latestTemperature
    ? await Device.findById(latestTemperature.deviceId).select("name").lean()
    : null;

  return {
    devicesTotal,
    devicesOnline,
    alarmsOpen,
    alarmsCritical,
    eventsLast24h,
    latestTemperature:
      latestTemperature?.value === undefined
        ? null
        : {
            value: latestTemperature.value,
            timestamp: latestTemperature.timestamp,
            deviceName: latestTemperatureDevice?.name ?? "Unknown device",
          },
  };
}
