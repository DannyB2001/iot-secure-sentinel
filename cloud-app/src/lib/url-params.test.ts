import { describe, expect, it } from "vitest";
import { parseSeverityFilter } from "./url-params";

describe("parseSeverityFilter", () => {
  it("returns 'all' for null", () => {
    expect(parseSeverityFilter(null)).toBe("all");
  });

  it("returns 'all' for undefined", () => {
    expect(parseSeverityFilter(undefined)).toBe("all");
  });

  it("returns 'all' for an empty string", () => {
    expect(parseSeverityFilter("")).toBe("all");
  });

  it("returns 'all' for an unknown value", () => {
    expect(parseSeverityFilter("blocker")).toBe("all");
  });

  it("returns 'critical' for 'critical'", () => {
    expect(parseSeverityFilter("critical")).toBe("critical");
  });

  it("returns 'warning' for 'warning'", () => {
    expect(parseSeverityFilter("warning")).toBe("warning");
  });

  it("returns 'info' for 'info'", () => {
    expect(parseSeverityFilter("info")).toBe("info");
  });

  it("rejects mixed case (URL params are case-sensitive)", () => {
    expect(parseSeverityFilter("Critical")).toBe("all");
  });
});
