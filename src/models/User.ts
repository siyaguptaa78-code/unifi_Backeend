import { Schema, model, models, type InferSchemaType, type Model, Types } from "mongoose";
import { ROLES } from "@/lib/rbac";

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 160 },
    mobile: { type: String, required: true, trim: true, match: /^[6-9]\d{9}$/ },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true, index: true },
    status: { type: String, enum: ["ACTIVE", "SUSPENDED"], default: "ACTIVE" },
    tokenVersion: { type: Number, default: 0 },
    lastLoginAt: Date,
    resetTokenHash: { type: String, select: false },
    resetTokenExpiresAt: { type: Date, select: false },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true }
);
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ mobile: 1 }, { unique: true });
userSchema.index({ name: "text", email: "text" });

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: Types.ObjectId };
export const User: Model<UserDoc> = (models.User as Model<UserDoc>) || model<UserDoc>("User", userSchema);

