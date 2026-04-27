import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import { isSameOrigin } from "./origin-guard";

function fakeRequest(origin: string | null, host = "localhost:3000", protocol = "http:") {
  return {
    headers: {
      get: (name: string) => (name.toLowerCase() === "origin" ? origin : null),
    },
    nextUrl: { protocol, host },
  } as unknown as NextRequest;
}

describe("isSameOrigin", () => {
  const originalAuthUrl = process.env.NEXTAUTH_URL;

  beforeEach(() => {
    delete process.env.NEXTAUTH_URL;
  });

  afterEach(() => {
    if (originalAuthUrl === undefined) {
      delete process.env.NEXTAUTH_URL;
    } else {
      process.env.NEXTAUTH_URL = originalAuthUrl;
    }
  });

  it("rejects when Origin header is missing", () => {
    expect(isSameOrigin(fakeRequest(null))).toBe(false);
  });

  it("accepts matching origin in dev (no NEXTAUTH_URL set)", () => {
    expect(isSameOrigin(fakeRequest("http://localhost:3000"))).toBe(true);
  });

  it("rejects mismatched host in dev", () => {
    expect(isSameOrigin(fakeRequest("http://evil.com"))).toBe(false);
  });

  it("rejects mismatched protocol in dev", () => {
    expect(isSameOrigin(fakeRequest("https://localhost:3000"))).toBe(false);
  });

  it("accepts matching NEXTAUTH_URL in production", () => {
    process.env.NEXTAUTH_URL = "https://iris.example.com";
    expect(
      isSameOrigin(fakeRequest("https://iris.example.com", "iris.example.com", "https:")),
    ).toBe(true);
  });

  it("rejects when Origin matches request host but NEXTAUTH_URL points elsewhere", () => {
    process.env.NEXTAUTH_URL = "https://iris.example.com";
    expect(isSameOrigin(fakeRequest("http://localhost:3000"))).toBe(false);
  });

  it("rejects unparseable Origin header (e.g. 'null')", () => {
    expect(isSameOrigin(fakeRequest("null"))).toBe(false);
  });

  it("rejects file:// origins", () => {
    expect(isSameOrigin(fakeRequest("file://"))).toBe(false);
  });
});
