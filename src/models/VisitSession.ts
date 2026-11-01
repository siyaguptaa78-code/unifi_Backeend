import { Schema, model, models, type InferSchemaType, type Model, Types } from "mongoose";

const visitSessionSchema = new Schema(
  {
    customer: { type: Schema.Types.ObjectId, ref: "User", required: true },
    membership: { type: Schema.Types.ObjectId, ref: "Membership", required: true },
    card: { type: Schema.Types.ObjectId, ref: "MembershipCard" },
    cafe: { type: Schema.Types.ObjectId, ref: "Cafe", required: true },
    exitCafe: { type: Schema.Types.ObjectId, ref: "Cafe" },
    status: { type: String, enum: ["ACTIVE", "COMPLETED", "CORRECTED"], default: "ACTIVE" },
    entryAt: { type: Date, required: true },
    exitAt: Date,
    minutesConsumed: { type: Number, default: 0, min: 0 },
    minutesBefore: Number,
    minutesAfter: Number,
    entryBy: { type: Schema.Types.ObjectId, ref: "User" },
    exitBy: { type: Schema.Types.ObjectId, ref: "User" },
    entryDevice: String,
    exitDevice: String,
    correction: {
      by: { type: Schema.Types.ObjectId, ref: "User" },
      at: Date,
      reason: String,
      originalExitAt: Date,
    },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true }
);
// Database-level guarantee: one active session per customer.
visitSessionSchema.index({ customer: 1 }, { unique: true, partialFilterExpression: { status: "ACTIVE" }, name: "one_active_visit_per_customer" });
visitSessionSchema.index({ cafe: 1, entryAt: -1 });
visitSessionSchema.index({ customer: 1, entryAt: -1 });
visitSessionSchema.index({ status: 1 });

export type VisitSessionDoc = InferSchemaType<typeof visitSessionSchema> & { _id: Types.ObjectId };
export const VisitSession: Model<VisitSessionDoc> =
  (models.VisitSession as Model<VisitSessionDoc>) || model<VisitSessionDoc>("VisitSession", visitSessionSchema);

