import type { NextRequest } from "next/server";
import { Device, type DeviceDoc } from "@/models/Device";
import { hashDeviceToken } from "./password";

export type AuthenticatedDevice = DeviceDoc;

export async function authenticateDevice(req: NextRequest): Promise<AuthenticatedDevice | null> {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();
  if (!token) return null;

  const tokenHash = hashDeviceToken(token);
  const device = await Device.findOne({ apiTokenHash: tokenHash }).lean<AuthenticatedDevice>();
  return device ?? null;
}
