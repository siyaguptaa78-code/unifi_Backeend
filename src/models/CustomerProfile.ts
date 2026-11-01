import { Schema, model, models, type InferSchemaType, type Model, Types } from "mongoose";

const customerProfileSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    customerCode: { type: String, required: true },
    dateOfBirth: Date,
    gender: { type: String, enum: ["MALE", "FEMALE", "OTHER", "UNSPECIFIED"], default: "UNSPECIFIED" },
    address: { line1: String, city: String, state: String, pincode: String },
    preferredCafe: { type: Schema.Types.ObjectId, ref: "Cafe" },
    marketingOptIn: { type: Boolean, default: true },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true }
);
customerProfileSchema.index({ user: 1 }, { unique: true });
customerProfileSchema.index({ customerCode: 1 }, { unique: true });

export type CustomerProfileDoc = InferSchemaType<typeof customerProfileSchema> & { _id: Types.ObjectId };
export const CustomerProfile: Model<CustomerProfileDoc> =
  (models.CustomerProfile as Model<CustomerProfileDoc>) || model<CustomerProfileDoc>("CustomerProfile", customerProfileSchema);

