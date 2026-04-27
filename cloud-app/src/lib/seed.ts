import { User } from "@/models/User";
import { Device } from "@/models/Device";
import { hashPassword, hashDeviceToken } from "./password";

const DEFAULT_ADMIN_EMAIL = "admin@iris.local";
const DEFAULT_ADMIN_PASSWORD = "admin123";
const DEFAULT_DEVICE_NAME = "mock-gateway-01";
const DEFAULT_DEVICE_TOKEN = "mock-token-please-rotate";

export async function runSeed() {
  const isProd = process.env.NODE_ENV === "production";
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL).toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? DEFAULT_ADMIN_PASSWORD;
  const deviceName = process.env.SEED_DEVICE_NAME ?? DEFAULT_DEVICE_NAME;
  const deviceToken = process.env.SEED_DEVICE_TOKEN ?? DEFAULT_DEVICE_TOKEN;

  if (isProd) {
    if (!process.env.SEED_ADMIN_PASSWORD || !process.env.SEED_DEVICE_TOKEN) {
      throw new Error(
        "Refusing to seed in production without SEED_ADMIN_PASSWORD and SEED_DEVICE_TOKEN.",
      );
    }
    if (adminPassword === DEFAULT_ADMIN_PASSWORD || deviceToken === DEFAULT_DEVICE_TOKEN) {
      throw new Error("Refusing to seed default admin or device credentials in production.");
    }
  }

  const adminExists = await User.exists({ email: adminEmail });
  if (!adminExists) {
    await User.create({
      email: adminEmail,
      name: "Admin",
      passwordHash: await hashPassword(adminPassword),
      role: "ADMIN",
    });
    console.info(`[seed] created admin user: ${adminEmail}`);
  }

  const deviceExists = await Device.exists({ name: deviceName });
  if (!deviceExists) {
    await Device.create({
      name: deviceName,
      type: "gateway",
      status: "offline",
      location: "Lab bench",
      apiTokenHash: hashDeviceToken(deviceToken),
      firmwareVersion: "0.1.0-mock",
    });
    console.info(`[seed] created mock gateway: ${deviceName}`);
  }
}
