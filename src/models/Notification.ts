import { Schema, model, models, type InferSchemaType, type Model, Types } from "mongoose";

export const NOTIFICATION_TYPES = [
  "PAYMENT_CONFIRMATION",
  "PAYMENT_FAILED",
  "MEMBERSHIP_RECHARGE",
  "LOW_POINTS",
  "LOW_HOURS",
  "HOURS_EXHAUSTED",
  "ORDER_PLACED",
  "ORDER_ACCEPTED",
  "ORDER_PREPARING",
  "ORDER_READY",
  "ORDER_COMPLETED",
  "ORDER_CANCELLED",
  "REFUND_PROCESSED",
  "VISIT_ENTRY",
  "VISIT_EXIT",
  "PROMOTION",
  "SYSTEM",
] as const;

const notificationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    link: String,
    read: { type: Boolean, default: false },
    readAt: Date,
    channels: { type: [String], default: ["IN_APP"] },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true }
);
notificationSchema.index({ user: 1, read: 1, createdAt: -1 });

export type NotificationDoc = InferSchemaType<typeof notificationSchema> & { _id: Types.ObjectId };
export const Notification: Model<NotificationDoc> =
  (models.Notification as Model<NotificationDoc>) || model<NotificationDoc>("Notification", notificationSchema);

