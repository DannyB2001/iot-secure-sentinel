import { z } from "zod";

/**
 * Single source of truth for alarm literal unions. Mongoose enum arrays in
 * src/models/Alarm.ts must mirror these. Components and API handlers should
 * import these types instead of redeclaring the unions inline.
 */
export const alarmSeverityEnum = z.enum(["info", "warning", "critical"]);
export type AlarmSeverity = z.infer<typeof alarmSeverityEnum>;

export const alarmCategoryEnum = z.enum(["temperature", "tamper", "battery", "offline"]);
export type AlarmCategory = z.infer<typeof alarmCategoryEnum>;

export const alarmStateEnum = z.enum(["open", "acknowledged", "resolved"]);
export type AlarmState = z.infer<typeof alarmStateEnum>;

export const alarmAcknowledgeSchema = z.object({
  alarmId: z.string().regex(/^[0-9a-fA-F]{24}$/, "alarmId must be a Mongo ObjectId"),
  note: z.string().min(1).max(500).optional(),
});

export type AlarmAcknowledgeInput = z.infer<typeof alarmAcknowledgeSchema>;

export const alarmListQuerySchema = z.object({
  state: alarmStateEnum.default("open"),
  severity: alarmSeverityEnum.optional(),
  limit: z.coerce.number().int().positive().max(500).default(100),
});

export type AlarmListQuery = z.infer<typeof alarmListQuerySchema>;
