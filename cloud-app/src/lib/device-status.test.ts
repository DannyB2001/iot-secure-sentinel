import { afterEach, describe, expect, it } from "vitest";
import { effectiveDeviceStatus, isOfflineStatusEvent, isOnlineHeartbeatEvent } from "./device-status";

afterEach(() => {
  delete process.env.OFFLINE_TIMEOUT_MS;
});

describe("device status helpers", () => {
  it("detects online heartbeat events", () => {
    expect(
      isOnlineHeartbeatEvent({
        deviceName: "mock-gateway-01",
        sensorKey: "core-heartbeat",
        type: "heartbeat",
        value: 1,
        timestamp: new Date().toISOString(),
      }),
    ).toBe(true);
  });

  it("detects offline status events from status sensor or message", () => {
    const timestamp = new Date().toISOString();

    expect(
      isOfflineStatusEvent({
        deviceName: "mock-gateway-01",
        sensorKey: "push-button:0-status",
        type: "tamper",
        value: 0,
        timestamp,
      }),
    ).toBe(true);
    expect(
      isOfflineStatusEvent({
        deviceName: "mock-gateway-01",
        sensorKey: "push-button:0-status",
        type: "tamper",
        value: 1,
        message: "HARDWARIO node offline: push-button:0",
        timestamp,
      }),
    ).toBe(true);
  });

  it("treats an online device as offline after OFFLINE_TIMEOUT_MS", () => {
    process.env.OFFLINE_TIMEOUT_MS = "120000";
    const now = new Date("2026-05-06T18:12:01.000Z");

    expect(
      effectiveDeviceStatus(
        {
          status: "online",
          lastSeenAt: new Date("2026-05-06T18:10:00.000Z"),
        },
        now,
      ),
    ).toBe("offline");
  });
});
