import { Schema, model, models, type InferSchemaType, type Model, Types } from "mongoose";

/**
 * Per-cafe customization of a menu item.
 *  - isAvailable: managed directly by cafe manager / owner (no approval needed)
 *  - price override: requestedPrice submitted by cafe, becomes effective (approvedPrice)
 *    only after Super Admin approval.
 */
const cafeMenuCustomizationSchema = new Schema(
  {
    cafe: { type: Schema.Types.ObjectId, ref: "Cafe", required: true },
    menuItem: { type: Schema.Types.ObjectId, ref: "MenuItem", required: true },
    isAvailable: { type: Boolean, default: true },
    requestedPrice: { type: Number, min: 1 },
    approvedPrice: { type: Number, min: 1 },
    priceStatus: { type: String, enum: ["NONE", "PENDING", "APPROVED", "REJECTED"], default: "NONE" },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewNote: String,
  },
  { timestamps: true }
);
cafeMenuCustomizationSchema.index({ cafe: 1, menuItem: 1 }, { unique: true });
cafeMenuCustomizationSchema.index({ priceStatus: 1 });

export type CafeMenuCustomizationDoc = InferSchemaType<typeof cafeMenuCustomizationSchema> & { _id: Types.ObjectId };
export const CafeMenuCustomization: Model<CafeMenuCustomizationDoc> =
  (models.CafeMenuCustomization as Model<CafeMenuCustomizationDoc>) ||
  model<CafeMenuCustomizationDoc>("CafeMenuCustomization", cafeMenuCustomizationSchema);

