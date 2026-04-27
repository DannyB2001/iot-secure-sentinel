import { describe, expect, it } from "vitest";
import { classify, THRESHOLDS } from "./alarm-classifier";
import type { EventCreateInput } from "@/lib/validation/event";

function event(overrides: Partial<EventCreateInput>): EventCreateInput {
  return {
    deviceName: "node-01",
    sensorKey: "core-thermometer",
    type: "temperature",
    timestamp: new Date().toISOString(),
    ...overrides,
  } as EventCreateInput;
}

describe("alarm classifier", () => {
  it("returns null for heartbeat", () => {
    expect(classify(event({ type: "heartbeat", sensorKey: "core-heartbeat" }))).toBeNull();
  });

  it("always returns critical tamper alarm", () => {
    const alarm = classify(event({ type: "tamper", sensorKey: "core-acc" }));
    expect(alarm).toMatchObject({ severity: "critical", category: "tamper" });
  });

  it("uses provided message for tamper, falls back to default", () => {
    expect(classify(event({ type: "tamper", message: "Custom" }))?.message).toBe("Custom");
    expect(classify(event({ type: "tamper" }))?.message).toBe("Tamper detected on device.");
  });

  describe("temperature", () => {
    it("returns null when value is missing", () => {
      expect(classify(event({ type: "temperature", value: undefined }))).toBeNull();
    });

    it("ignores normal values", () => {
      expect(classify(event({ type: "temperature", value: 22 }))).toBeNull();
    });

    it("warns at exactly tempWarnHigh", () => {
      expect(classify(event({ type: "temperature", value: THRESHOLDS.tempWarnHigh }))).toMatchObject({
        severity: "warning",
        category: "temperature",
      });
    });

    it("does not warn just below tempWarnHigh", () => {
      expect(classify(event({ type: "temperature", value: THRESHOLDS.tempWarnHigh - 0.1 }))).toBeNull();
    });

    it("escalates to critical at tempCritHigh", () => {
      expect(classify(event({ type: "temperature", value: THRESHOLDS.tempCritHigh }))).toMatchObject({
        severity: "critical",
      });
    });

    it("warns at low end (tempWarnLow)", () => {
      expect(classify(event({ type: "temperature", value: THRESHOLDS.tempWarnLow }))).toMatchObject({
        severity: "warning",
      });
    });
  });

  describe("battery", () => {
    it("returns null when value is missing", () => {
      expect(classify(event({ type: "battery", value: undefined }))).toBeNull();
    });

    it("warns at exactly batteryWarn", () => {
      expect(classify(event({ type: "battery", value: THRESHOLDS.batteryWarn }))).toMatchObject({
        severity: "warning",
        category: "battery",
      });
    });

    it("does not warn just above batteryWarn", () => {
      expect(classify(event({ type: "battery", value: THRESHOLDS.batteryWarn + 0.01 }))).toBeNull();
    });

    it("escalates to critical at batteryCrit", () => {
      expect(classify(event({ type: "battery", value: THRESHOLDS.batteryCrit }))).toMatchObject({
        severity: "critical",
      });
    });
  });
});
