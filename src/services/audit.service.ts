import type { ClientSession, Types } from "mongoose";
import { AuditLog } from "@/models/AuditLog";
import type { AuthUser } from "@/lib/auth/session";

export async function logAudit(
  actor: AuthUser | null,
  action: string,
  entity: string,
  entityId?: string | Types.ObjectId | null,
  details?: Record<string, unknown>,
  opts: { cafe?: string | Types.ObjectId | null; ip?: string; session?: ClientSession } = {}
) {
  try {
    await AuditLog.create(
      [
        {
          actor: actor?.id,
          actorRole: actor?.role ?? "SYSTEM",
          actorName: actor?.name ?? "System",
          action,
          entity,
          entityId: entityId ? String(entityId) : undefined,
          cafe: opts.cafe ?? undefined,
          details,
          ip: opts.ip,
        },
      ],
      opts.session ? { session: opts.session } : {}
    );
  } catch (e) {
    // Audit failures must never break the business operation, but must be visible.
    console.error("[audit] failed to write audit log", action, e);
  }
}

