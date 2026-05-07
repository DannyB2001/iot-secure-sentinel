import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { effectiveDeviceStatus, ensureOfflineTamperAlarms } from "@/lib/device-status";
import { errorResponse } from "@/lib/error-envelope";
import { Device } from "@/models/Device";
import { Event } from "@/models/Event";

export const runtime = "nodejs";

type LatestReading = {
  _id: unknown;
  value: number;
  timestamp: Date;
};

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return errorResponse("unauthorized", "Sign in required.", 401);
  }

  await connectDb();
  await ensureOfflineTamperAlarms();
  const devices = await Device.find()
    .select(
      "name type status location lastSeen lastSeenAt lastHeartbeatAt lastOfflineAt firmwareVersion batteryVoltage",
    )
    .sort({ name: 1 })
    .lean();
  const deviceIds = devices.map((d) => d._id);
  const latestTemperatures = await Event.aggregate<LatestReading>([
    {
      $match: {
        deviceId: { $in: deviceIds },
        type: "temperature",
        value: { $type: "number" },
      },
    },
    { $sort: { timestamp: -1 } },
    {
      $group: {
        _id: "$deviceId",
        value: { $first: "$value" },
        timestamp: { $first: "$timestamp" },
      },
    },
  ]);
  const temperatureMap = new Map(latestTemperatures.map((t) => [String(t._id), t]));

  return NextResponse.json({
    items: devices.map((d) => {
      const latestTemperature = temperatureMap.get(String(d._id));
      return {
        id: String(d._id),
        name: d.name,
        type: d.type,
        status: effectiveDeviceStatus(d),
        location: d.location ?? null,
        lastSeen: d.lastSeenAt ?? d.lastSeen ?? null,
        lastSeenAt: d.lastSeenAt ?? null,
        lastHeartbeatAt: d.lastHeartbeatAt ?? null,
        lastOfflineAt: d.lastOfflineAt ?? null,
        firmwareVersion: d.firmwareVersion ?? null,
        batteryVoltage: d.batteryVoltage ?? null,
        temperatureC: latestTemperature?.value ?? null,
        temperatureAt: latestTemperature?.timestamp ?? null,
      };
    }),
  });
}
