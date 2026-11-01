import { Schema, model, models, type InferSchemaType, type Model, Types } from "mongoose";

export const CARD_STATUSES = ["ACTIVE", "BLOCKED", "LOST", "REPLACED", "INACTIVE"] as const;

const membershipCardSchema = new Schema(
  {
    cardNumber: { type: String, required: true },
    customer: { type: Schema.Types.ObjectId, ref: "User", required: true },
    uid: { type: String, required: true, uppercase: true, trim: true },
    cardType: { type: String, enum: ["NFC", "RFID", "VIRTUAL"], default: "NFC" },
    status: { type: String, enum: CARD_STATUSES, default: "ACTIVE" },
    assignedCafe: { type: Schema.Types.ObjectId, ref: "Cafe" },
    issuedAt: { type: Date, default: Date.now },
    lastUsedAt: Date,
    lastTapAt: Date,
    replacedBy: { type: Schema.Types.ObjectId, ref: "MembershipCard" },
    history: {
      type: [
        {
          action: String,
          at: { type: Date, default: Date.now },
          by: { type: Schema.Types.ObjectId, ref: "User" },
          note: String,
          _id: false,
        },
      ],
      default: [],
    },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true }
);
membershipCardSchema.index({ uid: 1 }, { unique: true });
membershipCardSchema.index({ cardNumber: 1 }, { unique: true });
membershipCardSchema.index({ customer: 1, status: 1 });
// At most one ACTIVE card per customer
membershipCardSchema.index({ customer: 1 }, { unique: true, partialFilterExpression: { status: "ACTIVE" }, name: "one_active_card_per_customer" });

export type MembershipCardDoc = InferSchemaType<typeof membershipCardSchema> & { _id: Types.ObjectId };
export const MembershipCard: Model<MembershipCardDoc> =
  (models.MembershipCard as Model<MembershipCardDoc>) || model<MembershipCardDoc>("MembershipCard", membershipCardSchema);

