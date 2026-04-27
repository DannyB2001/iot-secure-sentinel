import { describe, expect, it } from "vitest";
import { z } from "zod";
import { errorResponse, fromZod } from "./error-envelope";

async function readBody(res: Response): Promise<unknown> {
  return res.json();
}

describe("errorResponse", () => {
  it("wraps the code in uuAppErrorMap with the given status", async () => {
    const res = errorResponse("deviceNotFound", "Device not found.", 404);
    expect(res.status).toBe(404);
    const body = (await readBody(res)) as {
      uuAppErrorMap: Record<string, { type: string; message: string }>;
    };
    expect(body.uuAppErrorMap.deviceNotFound).toEqual({
      type: "error",
      message: "Device not found.",
    });
  });

  it("includes params when provided", async () => {
    const res = errorResponse("invalidDtoIn", "Bad payload.", 400, { reason: "x" });
    const body = (await readBody(res)) as {
      uuAppErrorMap: Record<string, { params?: Record<string, unknown> }>;
    };
    expect(body.uuAppErrorMap.invalidDtoIn.params).toEqual({ reason: "x" });
  });
});

describe("fromZod", () => {
  it("returns invalidDtoIn by default", async () => {
    const schema = z.object({ name: z.string() });
    const result = schema.safeParse({});
    expect(result.success).toBe(false);
    if (result.success) return;

    const res = fromZod(result.error);
    expect(res.status).toBe(400);
    const body = (await readBody(res)) as {
      uuAppErrorMap: Record<string, unknown>;
    };
    expect(body.uuAppErrorMap.invalidDtoIn).toBeDefined();
  });

  it("promotes a tagged errorCode from a custom Zod issue", async () => {
    const schema = z
      .object({ ts: z.string() })
      .superRefine((_data, ctx) => {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ts"],
          message: "in the future",
          params: { errorCode: "timestampInFuture" },
        });
      });

    const result = schema.safeParse({ ts: "2099-01-01T00:00:00.000Z" });
    expect(result.success).toBe(false);
    if (result.success) return;

    const res = fromZod(result.error);
    expect(res.status).toBe(400);
    const body = (await readBody(res)) as {
      uuAppErrorMap: Record<string, unknown>;
    };
    expect(body.uuAppErrorMap.timestampInFuture).toBeDefined();
    expect(body.uuAppErrorMap.invalidDtoIn).toBeUndefined();
  });
});
