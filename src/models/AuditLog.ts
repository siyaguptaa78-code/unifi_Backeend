import { Schema, model, models, type InferSchemaType, type Model, Types } from "mongoose";

const auditLogSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: "User" },
    actorRole: String,
    actorName: String,
    action: { type: String, required: true },
    entity: { type: String, required: true },
    entityId: String,
    cafe: { type: Schema.Types.ObjectId, ref: "Cafe" },
    details: Schema.Types.Mixed,
    ip: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ entity: 1, entityId: 1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ action: 1 });

export type AuditLogDoc = InferSchemaType<typeof auditLogSchema> & { _id: Types.ObjectId };
export const AuditLog: Model<AuditLogDoc> = (models.AuditLog as Model<AuditLogDoc>) || model<AuditLogDoc>("AuditLog", auditLogSchema);

