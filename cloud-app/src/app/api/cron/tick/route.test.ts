import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { GET } from "./route";
import { Alarm } from "@/models/Alarm";
import { Device } from "@/models/Device";
import { Event } from "@/models/Event";
import { hashDeviceToken } from "@/lib/password";

let mongo: MongoMemoryServer;

function buildRequest(token?: string): Request {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request("http://localhost:3000/api/cron/tick", { headers });
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create({ instance: { dbName: "iris-cron-test" } });
  await mongoose.connect(mongo.getUri(), { dbName: "iris-cron-test" });
  globalThis.__irisDb = {
    promise: Promise.resolve(mongoose),
    server: null,
    seeded: true,
    uri: mongo.getUri(),
  };
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  delete process.env.CRON_SECRET;
  delete process.env.HEARTBEAT_TIMEOUT_SECONDS;
  delete process.env.OFFLINE_TIMEOUT_MS;
  await Promise.all([
    Device.deleteMany({}),
    Event.deleteMany({}),
    Alarm.deleteMany({}),
  ]);
});

describe("GET /api/cron/tick", () => {
  it("leaves a recently seen online device untouched", async () => {
    await Device.create({
      name: "fresh-gateway",
      type: "gateway",
      status: "online",
      lastSeen: new Date(),
      apiTokenHash: hashDeviceToken("token"),
    });

    const res = await GET(buildRequest() as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { devicesMarkedOffline: number };
    expect(body.devicesMarkedOffline).toBe(0);
    expect(await Event.countDocuments()).toBe(0);
    expect(await Alarm.countDocuments()).toBe(0);
  });

  it("marks a stale online device offline and creates a critical tamper alarm", async () => {
    await Device.create({
      name: "stale-gateway",
      type: "gateway",
      status: "online",
      lastSeen: new Date(Date.now() - 5 * 60 * 1000),
      apiTokenHash: hashDeviceToken("token"),
    });

    const res = await GET(buildRequest() as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      devicesMarkedOffline: number;
      eventsCreated: number;
      alarmsCreated: number;
    };
    expect(body.devicesMarkedOffline).toBe(1);
    expect(body.eventsCreated).toBe(1);
    expect(body.alarmsCreated).toBe(1);

    const device = await Device.findOne({ name: "stale-gateway" });
    expect(device?.status).toBe("offline");

    const event = await Event.findOne();
    expect(event?.sensorKey).toBe("core-heartbeat");
    expect(event?.type).toBe("tamper");

    const alarm = await Alarm.findOne();
    expect(alarm?.severity).toBe("critical");
    expect(alarm?.category).toBe("tamper");
    expect(alarm?.state).toBe("open");
    expect(alarm?.message).toContain("Heartbeat missing");
  });

  it("creates a missing tamper alarm for a device already marked offline", async () => {
    await Device.create({
      name: "offline-gateway",
      type: "gateway",
      status: "offline",
      lastSeen: new Date(Date.now() - 10 * 60 * 1000),
      apiTokenHash: hashDeviceToken("token"),
    });

    const res = await GET(buildRequest() as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      devicesMarkedOffline: number;
      eventsCreated: number;
      alarmsCreated: number;
    };
    expect(body.devicesMarkedOffline).toBe(0);
    expect(body.eventsCreated).toBe(1);
    expect(body.alarmsCreated).toBe(1);
    expect(await Event.countDocuments()).toBe(1);
    expect(await Alarm.countDocuments()).toBe(1);
  });

  it("does not create repeated alarms for a device already marked offline with an open offline alarm", async () => {
    const device = await Device.create({
      name: "offline-gateway",
      type: "gateway",
      status: "offline",
      lastSeen: new Date(Date.now() - 10 * 60 * 1000),
      apiTokenHash: hashDeviceToken("token"),
    });
    const event = await Event.create({
      deviceId: device._id,
      sensorKey: "core-heartbeat",
      type: "tamper",
      message: "Heartbeat missing for offline-gateway.",
      timestamp: new Date(),
      idempotencyKey: "existing-offline-event",
    });
    await Alarm.create({
      deviceId: device._id,
      eventId: event._id,
      severity: "critical",
      category: "tamper",
      message: "Heartbeat missing for offline-gateway.",
      state: "open",
    });

    const res = await GET(buildRequest() as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { alarmsCreated: number };
    expect(body.alarmsCreated).toBe(0);
    expect(await Event.countDocuments()).toBe(1);
    expect(await Alarm.countDocuments()).toBe(1);
  });

  it("requires the cron bearer token when CRON_SECRET is configured", async () => {
    process.env.CRON_SECRET = "cron-secret";

    const denied = await GET(buildRequest("wrong-secret") as never);
    expect(denied.status).toBe(401);

    const allowed = await GET(buildRequest("cron-secret") as never);
    expect(allowed.status).toBe(200);
  });
});
