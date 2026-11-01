import type { ClientSession, Types } from "mongoose";
import { Membership } from "../models/Membership";
import { PointsLedger } from "../models/PointsLedger";
import { Errors } from "../lib/errors";
import { getSetting } from "./settings.service";
import { notify } from "./notification.service";

type Id = string | Types.ObjectId;

type LedgerBase = {
  customerId: Id;
  points: number;
  reference: string;
  description: string;
  refModel?: "Payment" | "Order" | "AuditLog";
  refId?: Id;
  cafe?: Id | null;
  performedBy?: Id;
  session?: ClientSession;
  isDemo?: boolean;
};

const opt = (session?: ClientSession) => (session ? { session } : {});

/**
 * Atomically debits points. The conditional update (`pointsBalance >= points`) guarantees the
 * balance can never go negative even under concurrent requests. A ledger entry is always written;
 * if it cannot be written the debit is rolled back (by the transaction, or by compensation when
 * transactions are unavailable).
 */
export async function debitPoints(input: LedgerBase & { source: "ORDER" | "ADMIN" }) {
  if (!Number.isInteger(input.points) || input.points <= 0) throw Errors.badRequest("Invalid points amount");
  const updated = await Membership.findOneAndUpdate(
    { customer: input.customerId, status: "ACTIVE", pointsBalance: { $gte: input.points } },
    { $inc: { pointsBalance: -input.points, totalPointsSpent: input.source === "ORDER" ? input.points : 0 } },
    { new: true, ...opt(input.session) }
  );
  if (!updated) {
    const m = await Membership.findOne({ customer: input.customerId }, null, opt(input.session)).lean();
    if (!m) throw Errors.notFound("Membership");
    if (m.status !== "ACTIVE") throw Errors.business("MEMBERSHIP_INACTIVE", "An active membership is required. Please purchase or recharge your membership.");
    throw Errors.business("INSUFFICIENT_POINTS", `Insufficient points. Available: ${m.pointsBalance}, required: ${input.points}`, {
      available: m.pointsBalance,
      required: input.points,
    });
  }
  try {
    const [entry] = await PointsLedger.create(
      [
        {
          customer: input.customerId,
          membership: updated._id,
          type: input.source === "ADMIN" ? "ADJUSTMENT" : "DEBIT",
          source: input.source,
          points: -input.points,
          balanceAfter: updated.pointsBalance,
          refModel: input.refModel,
          refId: input.refId,
          reference: input.reference,
          description: input.description,
          cafe: input.cafe ?? undefined,
          performedBy: input.performedBy,
          isDemo: input.isDemo ?? false,
        },
      ],
      opt(input.session)
    );
    if (!input.session) await maybeNotifyLowPoints(String(input.customerId), updated.pointsBalance + input.points, updated.pointsBalance);
    return { membership: updated, entry };
  } catch (e) {
    if (!input.session) {
      await Membership.updateOne(
        { _id: updated._id },
        { $inc: { pointsBalance: input.points, totalPointsSpent: input.source === "ORDER" ? -input.points : 0 } }
      );
    }
    if ((e as { code?: number }).code === 11000) throw Errors.conflict("These points have already been debited for this reference");
    throw e;
  }
}

/** Credits points (recharge, refund, admin adjustment) with a mandatory ledger entry. */
export async function creditPoints(input: LedgerBase & { source: "RECHARGE" | "ORDER_REFUND" | "ADMIN"; allowInactive?: boolean }) {
  if (!Number.isInteger(input.points) || input.points <= 0) throw Errors.badRequest("Invalid points amount");
  const inc: Record<string, number> = { pointsBalance: input.points };
  if (input.source === "RECHARGE") inc.totalPointsCredited = input.points;
  if (input.source === "ORDER_REFUND") {
    inc.totalPointsRefunded = input.points;
  }
  const updated = await Membership.findOneAndUpdate({ customer: input.customerId }, { $inc: inc }, { new: true, ...opt(input.session) });
  if (!updated) throw Errors.notFound("Membership");
  const type = input.source === "RECHARGE" ? "CREDIT" : input.source === "ORDER_REFUND" ? "REFUND" : "ADJUSTMENT";
  try {
    const [entry] = await PointsLedger.create(
      [
        {
          customer: input.customerId,
          membership: updated._id,
          type,
          source: input.source,
          points: input.points,
          balanceAfter: updated.pointsBalance,
          refModel: input.refModel,
          refId: input.refId,
          reference: input.reference,
          description: input.description,
          cafe: input.cafe ?? undefined,
          performedBy: input.performedBy,
          isDemo: input.isDemo ?? false,
        },
      ],
      opt(input.session)
    );
    return { membership: updated, entry };
  } catch (e) {
    if (!input.session) await Membership.updateOne({ _id: updated._id }, { $inc: Object.fromEntries(Object.entries(inc).map(([k, v]) => [k, -v])) });
    if ((e as { code?: number }).code === 11000) throw Errors.conflict("These points have already been credited for this reference");
    throw e;
  }
}

export async function maybeNotifyLowPoints(customerId: string, before: number, after: number) {
  const threshold = Number(await getSetting("alerts.lowPointsThreshold"));
  if (before >= threshold && after < threshold) {
    await notify(customerId, "LOW_POINTS", "Low points balance", `Your points balance is ${after}. Recharge to keep ordering.`, {
      link: "/customer/membership",
    });
  }
}

export async function getWalletSummary(customerId: Id) {
  const m = await Membership.findOne({ customer: customerId }).lean();
  if (!m) throw Errors.notFound("Membership");
  return {
    pointsBalance: m.pointsBalance,
    totalPointsCredited: m.totalPointsCredited,
    totalPointsSpent: m.totalPointsSpent,
    totalPointsRefunded: m.totalPointsRefunded,
  };
}

