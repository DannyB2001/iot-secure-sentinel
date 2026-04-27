import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { errorResponse } from "@/lib/error-envelope";
import { Device } from "@/models/Device";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return errorResponse("unauthorized", "Sign in required.", 401);
  }

  await connectDb();
  const devices = await Device.find()
    .select("name type status location lastSeen firmwareVersion batteryVoltage")
    .sort({ name: 1 })
    .lean();

  return NextResponse.json({
    items: devices.map((d) => ({
      id: String(d._id),
      name: d.name,
      type: d.type,
      status: d.status,
      location: d.location ?? null,
      lastSeen: d.lastSeen ?? null,
      firmwareVersion: d.firmwareVersion ?? null,
      batteryVoltage: d.batteryVoltage ?? null,
    })),
  });
}
