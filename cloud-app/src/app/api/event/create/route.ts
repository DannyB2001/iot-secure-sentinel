import { NextResponse, type NextRequest } from "next/server";
import { connectDb } from "@/lib/db";
import { authenticateDevice } from "@/lib/device-auth";
import { errorResponse, fromZod } from "@/lib/error-envelope";
import { eventIdempotencyKey } from "@/lib/idempotency";
import { eventCreateSchema } from "@/lib/validation/event";
import { Device } from "@/models/Device";
import { Event } from "@/models/Event";
import { Alarm } from "@/models/Alarm";
import { classify } from "@/services/alarm-classifier";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  await connectDb();

  const gateway = await authenticateDevice(req);
  if (!gateway) {
    return errorResponse("unauthorized", "Bearer token missing or invalid.", 401);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorResponse("invalidDtoIn", "Request body must be valid JSON.", 400);
  }

  const parsed = eventCreateSchema.safeParse(raw);
  if (!parsed.success) return fromZod(parsed.error);
  const input = parsed.data;

  const device = await Device.findOne({ name: input.deviceName });
  if (!device) {
    return errorResponse("deviceNotFound", `Device '${input.deviceName}' is not registered.`, 404);
  }

  const idempotencyKey = eventIdempotencyKey({
    deviceId: String(device._id),
    sensorKey: input.sensorKey,
    timestamp: input.timestamp,
    value: input.value,
    message: input.message,
  });

  const existing = await Event.findOne({ idempotencyKey }).lean();
  if (existing) {
    return NextResponse.json({ eventId: String(existing._id), duplicate: true }, { status: 200 });
  }

  const event = await Event.create({
    deviceId: device._id,
    sensorKey: input.sensorKey,
    type: input.type,
    value: input.value,
    message: input.message,
    timestamp: new Date(input.timestamp),
    idempotencyKey,
  });

  device.lastSeen = new Date();
  device.status = "online";
  await device.save();

  const draft = classify(input);
  let alarmId: string | undefined;
  if (draft) {
    const alarm = await Alarm.create({
      deviceId: device._id,
      eventId: event._id,
      severity: draft.severity,
      category: draft.category,
      message: draft.message,
      state: "open",
    });
    alarmId = String(alarm._id);
  }

  return NextResponse.json(
    { eventId: String(event._id), alarmId: alarmId ?? null, duplicate: false },
    { status: 201 },
  );
}
