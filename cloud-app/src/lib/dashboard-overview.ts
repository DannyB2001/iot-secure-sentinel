import { Alarm } from "@/models/Alarm";
import { Device } from "@/models/Device";
import { Event } from "@/models/Event";
import { connectDb } from "./db";
import { effectiveDeviceStatus, ensureOfflineTamperAlarms } from "./device-status";
import type { AlarmCategory, AlarmSeverity, AlarmState } from "./validation/alarm";

export type RecentAlarmSummary = {
  id: string;
  severity: AlarmSeverity;
  category: AlarmCategory;
  state: AlarmState;
  message: string;
  deviceName: string;
  createdAt: string;
};

export type DashboardOverviewCounts = {
  devicesTotal: number;
  devicesOnline: number;
  alarmsOpen: number;
  alarmsCritical: number;
  eventsLast24h: number;
  latestTemperature: {
    value: number;
    timestamp: string;
    deviceName: string;
  } | null;
  recentAlarms: RecentAlarmSummary[];
};

const RECENT_ALARMS_LIMIT = 6;

export async function loadDashboardOverview(): Promise<DashboardOverviewCounts> {
  await connectDb();
  await ensureOfflineTamperAlarms();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [devices, alarmsOpen, alarmsCritical, eventsLast24h, latestTemperature, recentAlarms] =
    await Promise.all([
      Device.find().select("status lastSeen lastSeenAt").lean(),
      Alarm.countDocuments({ state: "open" }),
      Alarm.countDocuments({ state: "open", severity: "critical" }),
      Event.countDocuments({ timestamp: { $gte: since24h } }),
      Event.findOne({ type: "temperature", value: { $exists: true } })
        .select("deviceId value timestamp")
        .sort({ timestamp: -1 })
        .lean(),
      Alarm.find()
        .select("severity category state message deviceId createdAt")
        .sort({ createdAt: -1 })
        .limit(RECENT_ALARMS_LIMIT)
        .lean(),
    ]);

  const devicesTotal = devices.length;
  const devicesOnline = devices.filter(
    (device) => effectiveDeviceStatus(device) === "online",
  ).length;

  const referencedDeviceIds = new Set<string>(
    recentAlarms.map((alarm) => String(alarm.deviceId)),
  );
  if (latestTemperature) referencedDeviceIds.add(String(latestTemperature.deviceId));
  const referencedDevices = referencedDeviceIds.size
    ? await Device.find({ _id: { $in: Array.from(referencedDeviceIds) } })
        .select("name")
        .lean()
    : [];
  const deviceNameById = new Map(
    referencedDevices.map((device) => [String(device._id), device.name]),
  );

  return {
    devicesTotal,
    devicesOnline,
    alarmsOpen,
    alarmsCritical,
    eventsLast24h,
    latestTemperature:
      latestTemperature == null || latestTemperature.value == null
        ? null
        : {
            value: latestTemperature.value,
            timestamp: latestTemperature.timestamp.toISOString(),
            deviceName:
              deviceNameById.get(String(latestTemperature.deviceId)) ?? "Unknown device",
          },
    recentAlarms: recentAlarms.map((alarm) => ({
      id: String(alarm._id),
      severity: alarm.severity,
      category: alarm.category,
      state: alarm.state,
      message: alarm.message,
      deviceName: deviceNameById.get(String(alarm.deviceId)) ?? "Unknown device",
      createdAt: alarm.createdAt.toISOString(),
    })),
  };
}
