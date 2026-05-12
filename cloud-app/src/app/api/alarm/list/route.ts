import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { errorResponse, fromZod } from "@/lib/error-envelope";
import { alarmListQuerySchema } from "@/lib/validation/alarm";
import { Alarm } from "@/models/Alarm";
import { Device } from "@/models/Device";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return errorResponse("unauthorized", "Sign in required.", 401);
  }

  const { searchParams } = new URL(req.url);
  const parsed = alarmListQuerySchema.safeParse({
    state: searchParams.get("state") ?? undefined,
    severity: searchParams.get("severity") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) return fromZod(parsed.error);

  await connectDb();
  const filter: Record<string, unknown> = { state: parsed.data.state };
  if (parsed.data.severity) filter.severity = parsed.data.severity;
  const alarms = await Alarm.find(filter)
    .sort({ createdAt: -1 })
    .limit(parsed.data.limit)
    .lean();

  const deviceIds = [...new Set(alarms.map((a) => String(a.deviceId)))];
  const devices = await Device.find({ _id: { $in: deviceIds } })
    .select("name location")
    .lean();
  const deviceMap = new Map(devices.map((d) => [String(d._id), d]));

  return NextResponse.json({
    items: alarms.map((a) => {
      const device = deviceMap.get(String(a.deviceId));
      return {
        id: String(a._id),
        deviceId: String(a.deviceId),
        deviceName: device?.name ?? "(unknown)",
        deviceLocation: device?.location ?? null,
        severity: a.severity,
        category: a.category,
        message: a.message,
        state: a.state,
        createdAt: a.createdAt,
        acknowledgedAt: a.acknowledgedAt ?? null,
      };
    }),
  });
}
