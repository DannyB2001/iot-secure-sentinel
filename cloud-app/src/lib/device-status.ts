import type { EventCreateInput } from "@/lib/validation/event";
import { eventIdempotencyKey } from "@/lib/idempotency";
import { Alarm } from "@/models/Alarm";
import { Device } from "@/models/Device";
import { Event } from "@/models/Event";

export type DeviceStatus = "online" | "warning" | "offline";

const DEFAULT_OFFLINE_TIMEOUT_MS = 120_000;

type DeviceStatusFields = {
  _id?: unknown;
  name?: string | null;
  status?: DeviceStatus | null;
  lastSeen?: Date | string | null;
  lastSeenAt?: Date | string | null;
  lastOfflineAt?: Date | string | null;
};

export function offlineTimeoutMs() {
  const raw = Number(process.env.OFFLINE_TIMEOUT_MS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_OFFLINE_TIMEOUT_MS;
  return raw;
}

function toDate(value: Date | string | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isOnlineHeartbeatEvent(input: EventCreateInput) {
  return input.type === "heartbeat" && input.value === 1;
}

export function isOfflineStatusEvent(input: EventCreateInput) {
  return (
    (input.sensorKey.endsWith("-status") && input.value === 0) ||
    /\boffline\b/i.test(input.message ?? "")
  );
}

export function effectiveDeviceStatus(device: DeviceStatusFields, now = new Date()): DeviceStatus {
  const status = device.status ?? "offline";
  if (status !== "online") return status;

  const lastSeen = toDate(device.lastSeenAt) ?? toDate(device.lastSeen);
  if (!lastSeen) return status;

  return now.getTime() - lastSeen.getTime() > offlineTimeoutMs() ? "offline" : status;
}

export async function ensureOfflineTamperAlarms(now = new Date()) {
  const cutoff = new Date(now.getTime() - offlineTimeoutMs());
  const staleOrOfflineDevices = await Device.find({
    $or: [
      { status: "offline", lastSeenAt: { $exists: true } },
      { status: "offline", lastSeen: { $exists: true } },
      { lastSeenAt: { $lt: cutoff } },
      { lastSeenAt: { $exists: false }, lastSeen: { $lt: cutoff } },
      { lastSeenAt: null, lastSeen: { $lt: cutoff } },
    ],
  });

  let devicesMarkedOffline = 0;
  let eventsCreated = 0;
  let alarmsCreated = 0;

  for (const device of staleOrOfflineDevices) {
    const lastSeen = device.lastSeenAt ?? device.lastSeen;
    const secondsSinceLastSeen = lastSeen
      ? Math.max(0, Math.round((now.getTime() - lastSeen.getTime()) / 1000))
      : null;
    const message =
      secondsSinceLastSeen === null
        ? `Heartbeat missing for ${device.name}.`
        : `Heartbeat missing for ${device.name} for ${secondsSinceLastSeen} seconds.`;

    const existingAlarm = await Alarm.exists({
      deviceId: device._id,
      category: "tamper",
      state: "open",
      message: /\boffline\b|^Heartbeat missing/i,
    });

    let event = null;
    if (!existingAlarm) {
      event = await Event.create({
        deviceId: device._id,
        sensorKey: "core-heartbeat",
        type: "tamper",
        value: secondsSinceLastSeen ?? undefined,
        message,
        timestamp: now,
        idempotencyKey: eventIdempotencyKey({
          deviceId: String(device._id),
          sensorKey: "core-heartbeat",
          timestamp: now.toISOString(),
          value: secondsSinceLastSeen ?? undefined,
          message,
        }),
      });
      eventsCreated += 1;

      await Alarm.create({
        deviceId: device._id,
        eventId: event._id,
        severity: "critical",
        category: "tamper",
        message,
        state: "open",
      });
      alarmsCreated += 1;
    }

    if (device.status !== "offline") {
      devicesMarkedOffline += 1;
    }
    device.status = "offline";
    device.lastOfflineAt = now;
    await device.save();
  }

  return {
    devicesMarkedOffline,
    eventsCreated,
    alarmsCreated,
  };
}
