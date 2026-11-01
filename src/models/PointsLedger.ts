import { Schema, model, models, type InferSchemaType, type Model, Types } from "mongoose";

/**
 * Immutable points ledger. `points` is signed: positive for credits/refunds, negative for debits.
 * The unique (source, refId, type) index guarantees a payment/order can never be credited,
 * debited or refunded twice — the database itself rejects duplicates.
 */
const pointsLedgerSchema = new Schema(
  {
    customer: { type: Schema.Types.ObjectId, ref: "User", required: true },
    membership: { type: Schema.Types.ObjectId, ref: "Membership", required: true },
    type: { type: String, enum: ["CREDIT", "DEBIT", "REFUND", "ADJUSTMENT"], required: true },
    source: { type: String, enum: ["RECHARGE", "ORDER", "ORDER_REFUND", "ADMIN"], required: true },
    points: { type: Number, required: true },
    balanceAfter: { type: Number, required: true, min: 0 },
    refModel: { type: String, enum: ["Payment", "Order", "AuditLog", null] },
    refId: { type: Schema.Types.ObjectId },
    reference: { type: String, required: true },
    description: String,
    cafe: { type: Schema.Types.ObjectId, ref: "Cafe" },
    performedBy: { type: Schema.Types.ObjectId, ref: "User" },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true }
);
pointsLedgerSchema.index({ customer: 1, createdAt: -1 });
pointsLedgerSchema.index({ type: 1, createdAt: -1 });
pointsLedgerSchema.index(
  { source: 1, refId: 1, type: 1 },
  { unique: true, partialFilterExpression: { refId: { $type: "objectId" }, source: { $in: ["RECHARGE", "ORDER", "ORDER_REFUND"] } } }
);

export type PointsLedgerDoc = InferSchemaType<typeof pointsLedgerSchema> & { _id: Types.ObjectId };
export const PointsLedger: Model<PointsLedgerDoc> =
  (models.PointsLedger as Model<PointsLedgerDoc>) || model<PointsLedgerDoc>("PointsLedger", pointsLedgerSchema);

