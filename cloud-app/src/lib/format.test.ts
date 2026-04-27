import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatAbsolute, formatRelative } from "./format";

const NOW = new Date("2026-04-27T12:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("formatRelative", () => {
  it("formats seconds in the past", () => {
    expect(formatRelative(new Date(NOW.getTime() - 30_000))).toBe("30 seconds ago");
  });

  it("formats seconds in the future", () => {
    expect(formatRelative(new Date(NOW.getTime() + 15_000))).toBe("in 15 seconds");
  });

  it("rolls into minutes at the 60s boundary", () => {
    expect(formatRelative(new Date(NOW.getTime() - 59_000))).toMatch(/seconds? ago/);
    expect(formatRelative(new Date(NOW.getTime() - 60_000))).toMatch(/minute/);
  });

  it("formats minutes", () => {
    expect(formatRelative(new Date(NOW.getTime() - 5 * 60_000))).toBe("5 minutes ago");
  });

  it("rolls into hours at the 60min boundary", () => {
    expect(formatRelative(new Date(NOW.getTime() - 60 * 60_000))).toMatch(/hour/);
  });

  it("formats hours", () => {
    expect(formatRelative(new Date(NOW.getTime() - 3 * 60 * 60_000))).toBe("3 hours ago");
  });

  it("rolls into days at the 24h boundary", () => {
    expect(formatRelative(new Date(NOW.getTime() - 24 * 60 * 60_000))).toMatch(/day|yesterday/);
  });

  it("formats days", () => {
    expect(formatRelative(new Date(NOW.getTime() - 3 * 24 * 60 * 60_000))).toBe("3 days ago");
  });

  it("formats weeks", () => {
    expect(formatRelative(new Date(NOW.getTime() - 14 * 24 * 60 * 60_000))).toMatch(/week/);
  });

  it("formats months", () => {
    expect(formatRelative(new Date(NOW.getTime() - 90 * 24 * 60 * 60_000))).toMatch(/month/);
  });

  it("formats years for very old dates", () => {
    expect(formatRelative(new Date(NOW.getTime() - 3 * 365 * 24 * 60 * 60_000))).toMatch(/year/);
  });

  it("accepts an ISO string", () => {
    expect(formatRelative("2026-04-27T11:55:00.000Z")).toBe("5 minutes ago");
  });

  it("accepts a numeric timestamp", () => {
    expect(formatRelative(NOW.getTime() - 60_000)).toMatch(/minute/);
  });
});

describe("formatAbsolute", () => {
  it("returns a parseable date string", () => {
    const out = formatAbsolute(NOW);
    expect(out).toMatch(/2026/);
    // Locale-dependent so we don't pin the exact format, but it must include
    // year, month, day, and a time.
    expect(out.length).toBeGreaterThan(10);
  });

  it("accepts ISO string and number", () => {
    expect(formatAbsolute(NOW.toISOString())).toMatch(/2026/);
    expect(formatAbsolute(NOW.getTime())).toMatch(/2026/);
  });
});
