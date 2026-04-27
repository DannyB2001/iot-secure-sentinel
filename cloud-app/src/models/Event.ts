import { Schema, Types, model, models, type Model, type InferSchemaType } from "mongoose";

const eventSchema = new Schema(
  {
    deviceId: { type: Schema.Types.ObjectId, ref: "Device", required: true, index: true },
    sensorKey: { type: String, required: true, maxlength: 64 },
    type: {
      type: String,
      enum: ["temperature", "tamper", "heartbeat", "battery"],
      required: true,
    },
    value: { type: Number },
    message: { type: String, maxlength: 500 },
    timestamp: { type: Date, required: true, index: true },
    idempotencyKey: { type: String, required: true, unique: true },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "events" },
);

eventSchema.index({ deviceId: 1, timestamp: -1 });

export type EventDoc = InferSchemaType<typeof eventSchema> & { _id: Types.ObjectId };

export const Event: Model<EventDoc> =
  (models.Event as Model<EventDoc>) || model<EventDoc>("Event", eventSchema);
