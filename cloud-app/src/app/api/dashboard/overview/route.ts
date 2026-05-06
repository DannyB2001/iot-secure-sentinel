import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { errorResponse } from "@/lib/error-envelope";
import { loadDashboardOverview } from "@/lib/dashboard-overview";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return errorResponse("unauthorized", "Sign in required.", 401);
  }

  const counts = await loadDashboardOverview();
  return NextResponse.json(counts);
}
