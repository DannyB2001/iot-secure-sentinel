import { NextResponse, type NextRequest } from "next/server";
import { Types } from "mongoose";
import { auth } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { errorResponse, fromZod } from "@/lib/error-envelope";
import { isSameOrigin } from "@/lib/origin-guard";
import { alarmAcknowledgeSchema } from "@/lib/validation/alarm";
import { Alarm } from "@/models/Alarm";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return errorResponse("forbidden", "Cross-origin request rejected.", 403);
  }

  const session = await auth();
  if (!session?.user) {
    return errorResponse("unauthorized", "Sign in required.", 401);
  }
  if (session.user.role === "USER") {
    return errorResponse(
      "forbidden",
      "Only OPERATOR or ADMIN may acknowledge alarms.",
      403,
    );
  }

  let actorId: Types.ObjectId;
  try {
    actorId = Types.ObjectId.createFromHexString(session.user.id);
  } catch {
    return errorResponse("unauthorized", "Session identity is malformed.", 401);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorResponse("invalidDtoIn", "Request body must be valid JSON.", 400);
  }

  const parsed = alarmAcknowledgeSchema.safeParse(raw);
  if (!parsed.success) return fromZod(parsed.error);

  await connectDb();
  const alarm = await Alarm.findById(parsed.data.alarmId);
  if (!alarm) {
    return errorResponse("alarmNotFound", "Alarm does not exist.", 404);
  }
  if (alarm.state !== "open") {
    return errorResponse(
      "invalidAlarmState",
      `Alarm is in state '${alarm.state}', only 'open' alarms can be acknowledged.`,
      400,
    );
  }

  alarm.state = "acknowledged";
  alarm.acknowledgedAt = new Date();
  alarm.acknowledgedBy = actorId;
  if (parsed.data.note) {
    alarm.acknowledgeNote = parsed.data.note;
  }
  await alarm.save();

  return NextResponse.json({
    id: String(alarm._id),
    state: alarm.state,
    acknowledgedAt: alarm.acknowledgedAt.toISOString(),
    acknowledgedBy: String(alarm.acknowledgedBy),
  });
}
