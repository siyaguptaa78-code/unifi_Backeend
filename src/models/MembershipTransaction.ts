import { Schema, model, models, type InferSchemaType, type Model, Types } from "mongoose";

const membershipTransactionSchema = new Schema(
  {
    membership: { type: Schema.Types.ObjectId, ref: "Membership", required: true },
    customer: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["PURCHASE", "RECHARGE", "HOURS_USAGE", "HOURS_ADJUSTMENT", "STATUS_CHANGE"], required: true },
    amount: { type: Number, default: 0 },
    pointsCredited: { type: Number, default: 0 },
    minutesBefore: Number,
    minutesAfter: Number,
    pointsBefore: Number,
    pointsAfter: Number,
    payment: { type: Schema.Types.ObjectId, ref: "Payment" },
    visit: { type: Schema.Types.ObjectId, ref: "VisitSession" },
    reference: { type: String, required: true },
    note: String,
    performedBy: { type: Schema.Types.ObjectId, ref: "User" },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true }
);
membershipTransactionSchema.index({ customer: 1, createdAt: -1 });
membershipTransactionSchema.index({ type: 1, createdAt: -1 });
// A payment can only ever produce one purchase/recharge transaction.
membershipTransactionSchema.index({ payment: 1 }, { unique: true, partialFilterExpression: { payment: { $type: "objectId" } } });

export type MembershipTransactionDoc = InferSchemaType<typeof membershipTransactionSchema> & { _id: Types.ObjectId };
export const MembershipTransaction: Model<MembershipTransactionDoc> =
  (models.MembershipTransaction as Model<MembershipTransactionDoc>) ||
  model<MembershipTransactionDoc>("MembershipTransaction", membershipTransactionSchema);

