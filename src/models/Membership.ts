import { Schema, model, models, type InferSchemaType, type Model, Types } from "mongoose";

/**
 * One membership per customer. Points and remaining minutes are the authoritative balances;
 * every points change MUST be accompanied by a PointsLedger entry (see wallet.service).
 * Hours are stored as integer minutes to avoid floating point drift (150 h = 9000 min).
 */
const membershipSchema = new Schema(
  {
    customer: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["INACTIVE", "ACTIVE", "SUSPENDED"], default: "INACTIVE" },
    pointsBalance: { type: Number, default: 0, min: 0 },
    remainingMinutes: { type: Number, default: 0, min: 0 },
    totalPointsCredited: { type: Number, default: 0 },
    totalPointsSpent: { type: Number, default: 0 },
    totalPointsRefunded: { type: Number, default: 0 },
    totalMinutesUsed: { type: Number, default: 0 },
    rechargeCount: { type: Number, default: 0 },
    activatedAt: Date,
    lastRechargeAt: Date,
    lowPointsNotifiedAt: Date,
    lowHoursNotifiedAt: Date,
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true }
);
membershipSchema.index({ customer: 1 }, { unique: true });
membershipSchema.index({ status: 1 });

export type MembershipDoc = InferSchemaType<typeof membershipSchema> & { _id: Types.ObjectId };
export const Membership: Model<MembershipDoc> =
  (models.Membership as Model<MembershipDoc>) || model<MembershipDoc>("Membership", membershipSchema);

