import { Schema, Types, model, models, type Model, type InferSchemaType } from "mongoose";

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, maxlength: 120 },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ["ADMIN", "OPERATOR", "USER"],
      default: "USER",
      required: true,
    },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "users" },
);

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: Types.ObjectId };

export const User: Model<UserDoc> =
  (models.User as Model<UserDoc>) || model<UserDoc>("User", userSchema);
