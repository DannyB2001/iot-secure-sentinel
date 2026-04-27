import { describe, expect, it } from "vitest";
import { hashDeviceToken, hashPassword, verifyPassword } from "./password";

describe("hashDeviceToken", () => {
  it("is deterministic", () => {
    expect(hashDeviceToken("abc")).toBe(hashDeviceToken("abc"));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashDeviceToken("abc")).not.toBe(hashDeviceToken("abd"));
  });

  it("matches the known SHA-256 vector for 'abc'", () => {
    expect(hashDeviceToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("hashPassword + verifyPassword", () => {
  it("verifies a correct password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword(hash, "correct horse battery staple")).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword(hash, "wrong")).toBe(false);
  });

  it("returns false (does not throw) on garbage input", async () => {
    expect(await verifyPassword("not-a-real-hash", "anything")).toBe(false);
  });
});
