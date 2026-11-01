import { Schema, model, models, type InferSchemaType, type Model, Types } from "mongoose";

const franchiseSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, uppercase: true, trim: true },
    owner: { type: Schema.Types.ObjectId, ref: "User" },
    supervisor: { type: Schema.Types.ObjectId, ref: "User" },
    package: { type: Schema.Types.ObjectId, ref: "FranchisePackage", required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    status: {
      type: String,
      enum: ["PENDING_APPROVAL", "APPROVED", "ACTIVE", "SUSPENDED", "REJECTED", "TERMINATED"],
      default: "PENDING_APPROVAL",
    },
    paymentStatus: { type: String, enum: ["PENDING", "PARTIAL", "PAID"], default: "PENDING" },
    agreedAmount: { type: Number, required: true, min: 0 },
    amountPaid: { type: Number, default: 0, min: 0 },
    agreementDate: Date,
    applicantName: String,
    applicantEmail: String,
    applicantPhone: String,
    notes: String,
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedAt: Date,
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true }
);
franchiseSchema.index({ code: 1 }, { unique: true });
franchiseSchema.index({ owner: 1 });
franchiseSchema.index({ status: 1 });

export type FranchiseDoc = InferSchemaType<typeof franchiseSchema> & { _id: Types.ObjectId };
export const Franchise: Model<FranchiseDoc> =
  (models.Franchise as Model<FranchiseDoc>) || model<FranchiseDoc>("Franchise", franchiseSchema);

