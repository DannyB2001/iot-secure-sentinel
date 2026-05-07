import { Schema, Types, model, models, type Model, type InferSchemaType } from "mongoose";

const deviceSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, maxlength: 120 },
    type: { type: String, enum: ["iotNode", "gateway"], required: true },
    status: {
      type: String,
      enum: ["online", "warning", "offline"],
      default: "offline",
    },
    location: { type: String, maxlength: 240 },
    ipAddress: String,
    lastSeen: Date,
    lastSeenAt: Date,
    lastHeartbeatAt: Date,
    lastOfflineAt: Date,
    apiTokenHash: { type: String, required: true },
    firmwareVersion: String,
    batteryVoltage: Number,
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "devices" },
);

deviceSchema.index({ apiTokenHash: 1 });

export type DeviceDoc = InferSchemaType<typeof deviceSchema> & { _id: Types.ObjectId };

export const Device: Model<DeviceDoc> =
  (models.Device as Model<DeviceDoc>) || model<DeviceDoc>("Device", deviceSchema);
