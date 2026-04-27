import { describe, expect, it } from "vitest";
import { eventIdempotencyKey } from "./idempotency";

const base = {
  deviceId: "65f000000000000000000001",
  sensorKey: "core-thermometer",
  timestamp: "2026-04-27T10:00:00.000Z",
};

describe("eventIdempotencyKey", () => {
  it("is deterministic for the same input", () => {
    const a = eventIdempotencyKey({ ...base, value: 22.5 });
    const b = eventIdempotencyKey({ ...base, value: 22.5 });
    expect(a).toBe(b);
  });

  it("differs when timestamp differs", () => {
    const a = eventIdempotencyKey({ ...base, value: 22.5 });
    const b = eventIdempotencyKey({ ...base, timestamp: "2026-04-27T10:00:01.000Z", value: 22.5 });
    expect(a).not.toBe(b);
  });

  it("differs when value differs", () => {
    const a = eventIdempotencyKey({ ...base, value: 22.5 });
    const b = eventIdempotencyKey({ ...base, value: 22.6 });
    expect(a).not.toBe(b);
  });

  it("differs when message differs", () => {
    const a = eventIdempotencyKey({ ...base, message: "alpha" });
    const b = eventIdempotencyKey({ ...base, message: "beta" });
    expect(a).not.toBe(b);
  });

  it("does not collide on the position-shift attack (sentinel must be unique)", () => {
    // Without a NUL sentinel, naive joining of optional fields would let
    // (value=undefined, message="42") and (value=42, message=undefined)
    // collide as "...|42|" vs "...||42" - the SEP would absorb the empty.
    // The NUL sentinel keeps the two field positions distinguishable.
    const a = eventIdempotencyKey({ ...base, value: undefined, message: "42" });
    const b = eventIdempotencyKey({ ...base, value: 42, message: undefined });
    expect(a).not.toBe(b);
  });

  it("does not collide when one field is a literal space vs the missing-field sentinel", () => {
    // A user-supplied message of a single SPACE character must not hash the
    // same as a missing message (whose sentinel is NUL). This proves the
    // sentinel is genuinely out-of-band, not just a printable placeholder.
    const messageWithSpace = String.fromCharCode(32);
    const a = eventIdempotencyKey({ ...base, value: 1, message: messageWithSpace });
    const b = eventIdempotencyKey({ ...base, value: 1, message: undefined });
    expect(a).not.toBe(b);
  });
});
