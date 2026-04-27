import { describe, expect, it } from "vitest";
import { extractUuAppErrorMessage } from "./uu-error";

describe("extractUuAppErrorMessage", () => {
  it("returns undefined for null body", () => {
    expect(extractUuAppErrorMessage(null)).toBeUndefined();
  });

  it("returns undefined for non-object body", () => {
    expect(extractUuAppErrorMessage("plain text")).toBeUndefined();
    expect(extractUuAppErrorMessage(42)).toBeUndefined();
  });

  it("returns undefined when uuAppErrorMap is missing", () => {
    expect(extractUuAppErrorMessage({})).toBeUndefined();
  });

  it("returns undefined for empty uuAppErrorMap", () => {
    expect(extractUuAppErrorMessage({ uuAppErrorMap: {} })).toBeUndefined();
  });

  it("returns the first entry's message when present", () => {
    const body = {
      uuAppErrorMap: {
        invalidAlarmState: { type: "error", message: "Alarm is not open." },
      },
    };
    expect(extractUuAppErrorMessage(body)).toBe("Alarm is not open.");
  });

  it("returns undefined when the entry has no message", () => {
    const body = {
      uuAppErrorMap: {
        weird: { type: "error" },
      },
    };
    expect(extractUuAppErrorMessage(body)).toBeUndefined();
  });

  it("skips entries with empty message and finds the next valid one", () => {
    const body = {
      uuAppErrorMap: {
        empty: { type: "error", message: "" },
        invalid: { type: "error", message: "Real error." },
      },
    };
    expect(extractUuAppErrorMessage(body)).toBe("Real error.");
  });

  it("ignores non-object entries inside the map", () => {
    const body = {
      uuAppErrorMap: {
        bogus: "string instead of object",
        good: { message: "Recovered." },
      },
    };
    expect(extractUuAppErrorMessage(body)).toBe("Recovered.");
  });
});
