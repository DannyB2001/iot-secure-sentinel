import { z } from "zod";

const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

export const eventCreateSchema = z
  .object({
    deviceName: z.string().min(1).max(120),
    sensorKey: z.string().min(1).max(64),
    type: z.enum(["temperature", "tamper", "heartbeat", "battery"]),
    value: z.number().finite().optional(),
    message: z.string().max(500).optional(),
    timestamp: z.string().datetime(),
  })
  .superRefine((data, ctx) => {
    const ts = Date.parse(data.timestamp);
    if (Number.isNaN(ts)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["timestamp"],
        message: "timestamp must be a valid ISO datetime",
      });
      return;
    }
    if (ts - Date.now() > MAX_FUTURE_SKEW_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["timestamp"],
        message: "timestamp is too far in the future",
        params: { errorCode: "timestampInFuture" },
      });
    }
  });

export type EventCreateInput = z.infer<typeof eventCreateSchema>;
