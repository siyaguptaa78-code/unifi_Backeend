import { Schema, model, models, type InferSchemaType, type Model, Types } from "mongoose";

const menuCategorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true },
    description: String,
    sortOrder: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);
menuCategorySchema.index({ slug: 1 }, { unique: true });

export type MenuCategoryDoc = InferSchemaType<typeof menuCategorySchema> & { _id: Types.ObjectId };
export const MenuCategory: Model<MenuCategoryDoc> =
  (models.MenuCategory as Model<MenuCategoryDoc>) || model<MenuCategoryDoc>("MenuCategory", menuCategorySchema);

