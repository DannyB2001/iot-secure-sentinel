import { describe, expect, it } from "vitest";
import {
  alarmCategoryEnum,
  alarmSeverityEnum,
  alarmStateEnum,
} from "@/lib/validation/alarm";
import { Alarm } from "./Alarm";

/**
 * The Mongoose `enum` arrays in this schema are hand-written copies of the Zod
 * enums in `src/lib/validation/alarm.ts`. These tests guard against drift:
 * adding a literal to one side without the other would silently break the API
 * boundary at runtime. Update both files together when adding a new variant.
 */
describe("Alarm Mongoose schema mirrors Zod enums", () => {
  it("severity enum stays in sync with alarmSeverityEnum.options", () => {
    const schemaEnum = (Alarm.schema.path("severity") as { enumValues?: string[] }).enumValues;
    expect(schemaEnum).toEqual([...alarmSeverityEnum.options]);
  });

  it("category enum stays in sync with alarmCategoryEnum.options", () => {
    const schemaEnum = (Alarm.schema.path("category") as { enumValues?: string[] }).enumValues;
    expect(schemaEnum).toEqual([...alarmCategoryEnum.options]);
  });

  it("state enum stays in sync with alarmStateEnum.options", () => {
    const schemaEnum = (Alarm.schema.path("state") as { enumValues?: string[] }).enumValues;
    expect(schemaEnum).toEqual([...alarmStateEnum.options]);
  });
});
