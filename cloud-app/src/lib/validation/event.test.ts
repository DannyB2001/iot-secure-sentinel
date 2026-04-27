import { describe, expect, it } from "vitest";
import { eventCreateSchema } from "./event";

const valid = {
  deviceName: "node-01",
  sensorKey: "core-thermometer",
  type: "temperature" as const,
  value: 22.5,
  timestamp: new Date().toISOString(),
};

describe("eventCreateSchema", () => {
  it("accepts a valid temperature event", () => {
    expect(eventCreateSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a heartbeat without value or message", () => {
    const result = eventCreateSchema.safeParse({
      deviceName: "node-01",
      sensorKey: "core-heartbeat",
      type: "heartbeat",
      timestamp: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty deviceName", () => {
    expect(eventCreateSchema.safeParse({ ...valid, deviceName: "" }).success).toBe(false);
  });

  it("rejects NaN / Infinity value", () => {
    expect(eventCreateSchema.safeParse({ ...valid, value: Number.POSITIVE_INFINITY }).success).toBe(
      false,
    );
    expect(eventCreateSchema.safeParse({ ...valid, value: Number.NaN }).success).toBe(false);
  });

  it("rejects unknown type enum", () => {
    expect(eventCreateSchema.safeParse({ ...valid, type: "explosion" }).success).toBe(false);
  });

  it("rejects timestamp more than 5 minutes in the future", () => {
    const farFuture = new Date(Date.now() + 6 * 60 * 1000).toISOString();
    const result = eventCreateSchema.safeParse({ ...valid, timestamp: farFuture });
    expect(result.success).toBe(false);
    if (result.success) return;
    const futureIssue = result.error.issues.find(
      (i): i is typeof i & { params: { errorCode: string } } =>
        (i as { params?: { errorCode?: string } }).params?.errorCode === "timestampInFuture",
    );
    expect(futureIssue).toBeDefined();
  });

  it("accepts timestamp within the 5-minute skew window", () => {
    const slightlyFuture = new Date(Date.now() + 60 * 1000).toISOString();
    expect(eventCreateSchema.safeParse({ ...valid, timestamp: slightlyFuture }).success).toBe(true);
  });

  it("rejects malformed timestamp", () => {
    expect(eventCreateSchema.safeParse({ ...valid, timestamp: "yesterday" }).success).toBe(false);
  });
});
