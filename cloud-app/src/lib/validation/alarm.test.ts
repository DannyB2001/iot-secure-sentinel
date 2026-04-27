import { describe, expect, it } from "vitest";
import { alarmAcknowledgeSchema, alarmListQuerySchema } from "./alarm";

describe("alarmAcknowledgeSchema", () => {
  it("accepts a valid 24-hex alarmId", () => {
    expect(alarmAcknowledgeSchema.safeParse({ alarmId: "a".repeat(24) }).success).toBe(true);
  });

  it("rejects a non-hex alarmId", () => {
    expect(alarmAcknowledgeSchema.safeParse({ alarmId: "z".repeat(24) }).success).toBe(false);
  });

  it("rejects a too-short alarmId", () => {
    expect(alarmAcknowledgeSchema.safeParse({ alarmId: "abc" }).success).toBe(false);
  });

  it("accepts an optional note", () => {
    const result = alarmAcknowledgeSchema.safeParse({
      alarmId: "a".repeat(24),
      note: "False alarm, lab tech moved the sensor.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an over-long note", () => {
    const result = alarmAcknowledgeSchema.safeParse({
      alarmId: "a".repeat(24),
      note: "x".repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

describe("alarmListQuerySchema", () => {
  it("defaults state to open and limit to 100", () => {
    const result = alarmListQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.state).toBe("open");
    expect(result.data.limit).toBe(100);
  });

  it("coerces limit string to number", () => {
    const result = alarmListQuerySchema.safeParse({ limit: "50" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.limit).toBe(50);
  });

  it("rejects non-numeric limit", () => {
    const result = alarmListQuerySchema.safeParse({ limit: "abc" });
    expect(result.success).toBe(false);
  });

  it("rejects limit > 500", () => {
    const result = alarmListQuerySchema.safeParse({ limit: "501" });
    expect(result.success).toBe(false);
  });

  it("rejects unknown state", () => {
    const result = alarmListQuerySchema.safeParse({ state: "ohno" });
    expect(result.success).toBe(false);
  });
});
