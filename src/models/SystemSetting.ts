import { Schema, model, models, type InferSchemaType, type Model, Types } from "mongoose";

const systemSettingSchema = new Schema(
  {
    key: { type: String, required: true },
    value: { type: Schema.Types.Mixed, required: true },
    description: String,
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);
systemSettingSchema.index({ key: 1 }, { unique: true });

export type SystemSettingDoc = InferSchemaType<typeof systemSettingSchema> & { _id: Types.ObjectId };
export const SystemSetting: Model<SystemSettingDoc> =
  (models.SystemSetting as Model<SystemSettingDoc>) || model<SystemSettingDoc>("SystemSetting", systemSettingSchema);

