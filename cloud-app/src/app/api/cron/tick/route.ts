import { NextResponse, type NextRequest } from "next/server";
import { connectDb } from "@/lib/db";
import { ensureOfflineTamperAlarms, offlineTimeoutMs } from "@/lib/device-status";
import { errorResponse } from "@/lib/error-envelope";

export const runtime = "nodejs";

function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret && process.env.NODE_ENV !== "production") return true;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return errorResponse("unauthorized", "Cron bearer token missing or invalid.", 401);
  }

  await connectDb();

  const now = new Date();
  const timeout = offlineTimeoutMs();
  const result = await ensureOfflineTamperAlarms(now);

  return NextResponse.json({
    status: "ok",
    checkedAt: now.toISOString(),
    offlineTimeoutMs: timeout,
    heartbeatTimeoutSeconds: timeout / 1000,
    ...result,
  });
}
