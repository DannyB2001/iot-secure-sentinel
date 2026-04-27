import { z } from "zod";

export const alarmAcknowledgeSchema = z.object({
  alarmId: z.string().regex(/^[0-9a-fA-F]{24}$/, "alarmId must be a Mongo ObjectId"),
  note: z.string().min(1).max(500).optional(),
});

export type AlarmAcknowledgeInput = z.infer<typeof alarmAcknowledgeSchema>;

export const alarmListQuerySchema = z.object({
  state: z.enum(["open", "acknowledged", "resolved"]).default("open"),
  limit: z.coerce.number().int().positive().max(500).default(100),
});

export type AlarmListQuery = z.infer<typeof alarmListQuerySchema>;
