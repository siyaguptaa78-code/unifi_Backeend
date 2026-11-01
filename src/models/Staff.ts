import { Schema, model, models, type InferSchemaType, type Model, Types } from "mongoose";

/** Cafe assignment for internal (non-admin) users: managers and staff. */
const staffSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    cafes: { type: [{ type: Schema.Types.ObjectId, ref: "Cafe" }], default: [] },
    position: { type: String, enum: ["MANAGER", "STAFF"], required: true },
    designation: { type: String, default: "Barista" },
    employeeCode: { type: String, required: true },
    permissions: {
      canAssignCards: { type: Boolean, default: false },
      canCancelOrders: { type: Boolean, default: true },
    },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
    joinedAt: { type: Date, default: Date.now },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true }
);
staffSchema.index({ user: 1 }, { unique: true });
staffSchema.index({ employeeCode: 1 }, { unique: true });
staffSchema.index({ cafes: 1 });

export type StaffDoc = InferSchemaType<typeof staffSchema> & { _id: Types.ObjectId };
export const Staff: Model<StaffDoc> = (models.Staff as Model<StaffDoc>) || model<StaffDoc>("Staff", staffSchema);

