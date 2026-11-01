import { Schema, model, models, type InferSchemaType, type Model, Types } from "mongoose";

/**
 * CENTRAL items are created by Super Admin and available to every cafe by default.
 * LOCAL items are requested by a cafe (manager / franchise owner) and are only orderable
 * at that cafe once approvalStatus = APPROVED.
 */
const menuItemSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: "", maxlength: 500 },
    category: { type: Schema.Types.ObjectId, ref: "MenuCategory", required: true },
    image: String,
    pointsPrice: { type: Number, required: true, min: 1, max: 100000 },
    isVeg: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
    scope: { type: String, enum: ["CENTRAL", "LOCAL"], default: "CENTRAL" },
    cafe: { type: Schema.Types.ObjectId, ref: "Cafe" },
    approvalStatus: { type: String, enum: ["APPROVED", "PENDING", "REJECTED"], default: "APPROVED" },
    reviewNote: String,
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);
menuItemSchema.index({ category: 1, active: 1 });
menuItemSchema.index({ scope: 1, cafe: 1, approvalStatus: 1 });
menuItemSchema.index({ name: "text", description: "text" });

export type MenuItemDoc = InferSchemaType<typeof menuItemSchema> & { _id: Types.ObjectId };
export const MenuItem: Model<MenuItemDoc> = (models.MenuItem as Model<MenuItemDoc>) || model<MenuItemDoc>("MenuItem", menuItemSchema);

