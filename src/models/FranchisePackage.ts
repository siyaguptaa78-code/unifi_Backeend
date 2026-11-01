import { Schema, model, models, type InferSchemaType, type Model, Types } from "mongoose";

const franchisePackageSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    cafeSize: { type: String, required: true },
    setupInclusions: { type: [String], default: [] },
    equipmentInclusions: { type: [String], default: [] },
    trainingSupport: { type: String, default: "" },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true }
);
franchisePackageSchema.index({ name: 1 }, { unique: true });

export type FranchisePackageDoc = InferSchemaType<typeof franchisePackageSchema> & { _id: Types.ObjectId };
export const FranchisePackage: Model<FranchisePackageDoc> =
  (models.FranchisePackage as Model<FranchisePackageDoc>) ||
  model<FranchisePackageDoc>("FranchisePackage", franchisePackageSchema);

