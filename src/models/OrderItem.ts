import { Schema, model, models, type InferSchemaType, type Model, Types } from "mongoose";

/** Line item. Name & price are snapshotted at order time so menu changes never alter history. */
const orderItemSchema = new Schema(
  {
    order: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    menuItem: { type: Schema.Types.ObjectId, ref: "MenuItem", required: true },
    name: { type: String, required: true },
    unitPoints: { type: Number, required: true, min: 1 },
    quantity: { type: Number, required: true, min: 1, max: 50 },
    lineTotal: { type: Number, required: true, min: 1 },
  },
  { timestamps: true }
);
orderItemSchema.index({ order: 1 });
orderItemSchema.index({ menuItem: 1 });

export type OrderItemDoc = InferSchemaType<typeof orderItemSchema> & { _id: Types.ObjectId };
export const OrderItem: Model<OrderItemDoc> =
  (models.OrderItem as Model<OrderItemDoc>) || model<OrderItemDoc>("OrderItem", orderItemSchema);

