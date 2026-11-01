import { Schema, model, models, type InferSchemaType, type Model, Types } from "mongoose";

export const PAYMENT_STATUSES = ["CREATED", "PENDING", "SUCCESS", "FAILED", "REFUNDED"] as const;

/**
 * provider = RAZORPAY for real gateway payments (test or live keys);
 * provider = DEMO for simulated payments — never represented as Razorpay transactions.
 */
const paymentSchema = new Schema(
  {
    customer: { type: Schema.Types.ObjectId, ref: "User", required: true },
    purpose: { type: String, enum: ["MEMBERSHIP_PURCHASE", "MEMBERSHIP_RECHARGE"], required: true },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, default: "INR" },
    provider: { type: String, enum: ["RAZORPAY", "DEMO"], required: true },
    providerOrderId: { type: String, required: true },
    providerPaymentId: String,
    signature: { type: String, select: false },
    receipt: { type: String, required: true },
    status: { type: String, enum: PAYMENT_STATUSES, default: "CREATED" },
    failureReason: String,
    processedAt: Date,
    refundedAt: Date,
    refundReason: String,
    events: {
      type: [{ event: String, at: { type: Date, default: Date.now }, source: String, _id: false }],
      default: [],
    },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true }
);
paymentSchema.index({ providerOrderId: 1 }, { unique: true });
paymentSchema.index({ receipt: 1 }, { unique: true });
paymentSchema.index({ providerPaymentId: 1 }, { unique: true, partialFilterExpression: { providerPaymentId: { $type: "string" } } });
paymentSchema.index({ customer: 1, createdAt: -1 });
paymentSchema.index({ status: 1, createdAt: -1 });

export type PaymentDoc = InferSchemaType<typeof paymentSchema> & { _id: Types.ObjectId };
export const Payment: Model<PaymentDoc> = (models.Payment as Model<PaymentDoc>) || model<PaymentDoc>("Payment", paymentSchema);

