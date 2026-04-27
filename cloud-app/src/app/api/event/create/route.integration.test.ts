import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { POST } from "./route";
import { Device } from "@/models/Device";
import { Event } from "@/models/Event";
import { Alarm } from "@/models/Alarm";
import { hashDeviceToken } from "@/lib/password";

const DEVICE_NAME = "integration-gateway";
const DEVICE_TOKEN = "integration-token-1234567890abcdef";

let mongo: MongoMemoryServer;

function buildRequest(body: unknown, token: string | null): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request("http://localhost:3000/api/event/create", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create({ instance: { dbName: "iris-test" } });
  // Bypass connectDb()'s auto-seed by connecting Mongoose directly. The route
  // handler calls connectDb() which is a no-op once mongoose.connection.readyState >= 1.
  await mongoose.connect(mongo.getUri(), { dbName: "iris-test" });
  // Pre-seed connectDb's global cache so it doesn't try to spin up a second
  // in-memory server and run the production seed.
  globalThis.__irisDb = {
    promise: Promise.resolve(mongoose),
    server: null,
    seeded: true,
  };
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await Promise.all([
    Device.deleteMany({}),
    Event.deleteMany({}),
    Alarm.deleteMany({}),
  ]);
  await Device.create({
    name: DEVICE_NAME,
    type: "gateway",
    status: "offline",
    apiTokenHash: hashDeviceToken(DEVICE_TOKEN),
  });
});

describe("POST /api/event/create (integration)", () => {
  it("rejects missing bearer token with 401", async () => {
    const res = await POST(
      buildRequest(
        {
          deviceName: DEVICE_NAME,
          sensorKey: "core-thermometer",
          type: "temperature",
          value: 22,
          timestamp: new Date().toISOString(),
        },
        null,
      ) as never,
    );
    expect(res.status).toBe(401);
  });

  it("rejects bearer token that does not match any device", async () => {
    const res = await POST(
      buildRequest(
        {
          deviceName: DEVICE_NAME,
          sensorKey: "core-thermometer",
          type: "temperature",
          value: 22,
          timestamp: new Date().toISOString(),
        },
        "wrong-token",
      ) as never,
    );
    expect(res.status).toBe(401);
  });

  it("rejects an unknown device name with deviceNotFound (404)", async () => {
    const res = await POST(
      buildRequest(
        {
          deviceName: "unknown-device",
          sensorKey: "core-thermometer",
          type: "temperature",
          value: 22,
          timestamp: new Date().toISOString(),
        },
        DEVICE_TOKEN,
      ) as never,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { uuAppErrorMap: Record<string, unknown> };
    expect(body.uuAppErrorMap.deviceNotFound).toBeDefined();
  });

  it("creates an event without an alarm for normal temperature", async () => {
    const res = await POST(
      buildRequest(
        {
          deviceName: DEVICE_NAME,
          sensorKey: "core-thermometer",
          type: "temperature",
          value: 22,
          timestamp: new Date().toISOString(),
        },
        DEVICE_TOKEN,
      ) as never,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { eventId: string; alarmId: string | null; duplicate: boolean };
    expect(body.duplicate).toBe(false);
    expect(body.eventId).toBeTruthy();
    expect(body.alarmId).toBeNull();
    expect(await Event.countDocuments()).toBe(1);
    expect(await Alarm.countDocuments()).toBe(0);
  });

  it("creates an event AND a critical alarm for tamper", async () => {
    const res = await POST(
      buildRequest(
        {
          deviceName: DEVICE_NAME,
          sensorKey: "core-accelerometer",
          type: "tamper",
          message: "shake detected",
          timestamp: new Date().toISOString(),
        },
        DEVICE_TOKEN,
      ) as never,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { alarmId: string | null };
    expect(body.alarmId).toBeTruthy();

    const alarm = await Alarm.findOne();
    expect(alarm?.severity).toBe("critical");
    expect(alarm?.category).toBe("tamper");
    expect(alarm?.state).toBe("open");
  });

  it("returns 200 + duplicate=true on idempotent replay (and does not double-insert)", async () => {
    const payload = {
      deviceName: DEVICE_NAME,
      sensorKey: "core-thermometer",
      type: "temperature" as const,
      value: 55,
      timestamp: new Date().toISOString(),
    };

    const first = await POST(buildRequest(payload, DEVICE_TOKEN) as never);
    expect(first.status).toBe(201);

    const second = await POST(buildRequest(payload, DEVICE_TOKEN) as never);
    expect(second.status).toBe(200);
    const body = (await second.json()) as { duplicate: boolean };
    expect(body.duplicate).toBe(true);

    expect(await Event.countDocuments()).toBe(1);
    // Critical-temperature alarm created on the first insert; replay must not
    // create another.
    expect(await Alarm.countDocuments()).toBe(1);
  });

  it("rejects timestamp more than 5 minutes in the future with timestampInFuture", async () => {
    const farFuture = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const res = await POST(
      buildRequest(
        {
          deviceName: DEVICE_NAME,
          sensorKey: "core-thermometer",
          type: "temperature",
          value: 22,
          timestamp: farFuture,
        },
        DEVICE_TOKEN,
      ) as never,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { uuAppErrorMap: Record<string, unknown> };
    expect(body.uuAppErrorMap.timestampInFuture).toBeDefined();
    expect(await Event.countDocuments()).toBe(0);
  });

  it("updates Device.lastSeen and status on successful event", async () => {
    const before = await Device.findOne({ name: DEVICE_NAME });
    expect(before?.status).toBe("offline");

    await POST(
      buildRequest(
        {
          deviceName: DEVICE_NAME,
          sensorKey: "core-heartbeat",
          type: "heartbeat",
          timestamp: new Date().toISOString(),
        },
        DEVICE_TOKEN,
      ) as never,
    );

    const after = await Device.findOne({ name: DEVICE_NAME });
    expect(after?.status).toBe("online");
    expect(after?.lastSeen).toBeInstanceOf(Date);
  });
});
