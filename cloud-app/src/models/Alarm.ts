import { Schema, Types, model, models, type Model, type InferSchemaType } from "mongoose";

const alarmSchema = new Schema(
  {
    deviceId: { type: Schema.Types.ObjectId, ref: "Device", required: true, index: true },
    eventId: { type: Schema.Types.ObjectId, ref: "Event", required: true },
    severity: {
      type: String,
      enum: ["info", "warning", "critical"],
      required: true,
    },
    category: {
      type: String,
      enum: ["temperature", "tamper", "battery", "offline"],
      required: true,
    },
    message: { type: String, required: true, maxlength: 500 },
    state: {
      type: String,
      enum: ["open", "acknowledged", "resolved"],
      default: "open",
      index: true,
    },
    acknowledgedAt: Date,
    acknowledgedBy: { type: Schema.Types.ObjectId, ref: "User" },
    acknowledgeNote: { type: String, maxlength: 500 },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { collection: "alarms" },
);

export type AlarmDoc = InferSchemaType<typeof alarmSchema> & { _id: Types.ObjectId };

export const Alarm: Model<AlarmDoc> =
  (models.Alarm as Model<AlarmDoc>) || model<AlarmDoc>("Alarm", alarmSchema);
