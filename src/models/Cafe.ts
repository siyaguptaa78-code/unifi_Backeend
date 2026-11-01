import { Schema, model, models, type InferSchemaType, type Model, Types } from "mongoose";

const cafeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, uppercase: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    address: {
      line1: { type: String, required: true },
      area: String,
      city: { type: String, required: true },
      state: { type: String, required: true },
      pincode: { type: String, required: true, match: /^\d{6}$/ },
    },
    phone: String,
    email: String,
    openingHours: { type: String, default: "08:00 - 23:00" },
    acceptsPreOrders: { type: Boolean, default: true },
    estimatedPrepMinutes: { type: Number, default: 15 },
    seatingCapacity: { type: Number, default: 40, min: 0 },
    ownershipType: { type: String, enum: ["COMPANY", "FRANCHISE"], default: "COMPANY" },
    franchise: { type: Schema.Types.ObjectId, ref: "Franchise" },
    supervisor: { type: Schema.Types.ObjectId, ref: "User" },
    manager: { type: Schema.Types.ObjectId, ref: "User" },
    status: { type: String, enum: ["ACTIVE", "INACTIVE", "COMING_SOON"], default: "ACTIVE" },
    image: String,
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true }
);
cafeSchema.index({ code: 1 }, { unique: true });
cafeSchema.index({ slug: 1 }, { unique: true });
cafeSchema.index({ supervisor: 1 });
cafeSchema.index({ franchise: 1 });
cafeSchema.index({ "address.city": 1, status: 1 });

export type CafeDoc = InferSchemaType<typeof cafeSchema> & { _id: Types.ObjectId };
export const Cafe: Model<CafeDoc> = (models.Cafe as Model<CafeDoc>) || model<CafeDoc>("Cafe", cafeSchema);

