import { Schema, model, models, type InferSchemaType, type Model, Types } from "mongoose";

export const ORDER_STATUSES = ["PENDING", "ACCEPTED", "PREPARING", "READY", "COMPLETED", "CANCELLED", "REFUNDED"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_TYPES = ["DINE_IN", "PRE_ORDER", "IN_CAFE"] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

const orderSchema = new Schema(
  {
    orderNumber: { type: String, required: true },
    customer: { type: Schema.Types.ObjectId, ref: "User", required: true },
    cafe: { type: Schema.Types.ObjectId, ref: "Cafe", required: true },
    orderType: { type: String, enum: ORDER_TYPES, default: "DINE_IN" },
    status: { type: String, enum: ORDER_STATUSES, default: "PENDING" },
    totalPoints: { type: Number, required: true, min: 1 },
    itemCount: { type: Number, required: true, min: 1 },
    notes: { type: String, maxlength: 300 },
    expectedArrivalTime: { type: Date },
    pickupSlot: { type: String, maxlength: 50 },
    estimatedPrepMinutes: { type: Number, default: 15 },
    idempotencyKey: { type: String, required: true },
    statusHistory: {
      type: [
        {
          status: { type: String, enum: ORDER_STATUSES },
          at: { type: Date, default: Date.now },
          by: { type: Schema.Types.ObjectId, ref: "User" },
          note: String,
          _id: false,
        },
      ],
      default: [],
    },
    cancelReason: String,
    cancelledBy: { type: Schema.Types.ObjectId, ref: "User" },
    refundStatus: { type: String, enum: ["NONE", "REFUNDED"], default: "NONE" },
    refundedPoints: { type: Number, default: 0 },
    refundedAt: Date,
    completedAt: Date,
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true }
);
orderSchema.index({ orderNumber: 1 }, { unique: true });
orderSchema.index({ customer: 1, idempotencyKey: 1 }, { unique: true });
orderSchema.index({ cafe: 1, status: 1, createdAt: -1 });
orderSchema.index({ customer: 1, createdAt: -1 });
orderSchema.index({ createdAt: -1 });

export type OrderDoc = InferSchemaType<typeof orderSchema> & { _id: Types.ObjectId };
export const Order: Model<OrderDoc> = (models.Order as Model<OrderDoc>) || model<OrderDoc>("Order", orderSchema);

