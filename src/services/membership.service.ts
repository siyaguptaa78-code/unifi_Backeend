import type { ClientSession, Types } from "mongoose";
import { Membership } from "@/models/Membership";
import { MembershipTransaction } from "@/models/MembershipTransaction";
import { MembershipCard } from "@/models/MembershipCard";
import { Payment } from "@/models/Payment";
import { PointsLedger } from "@/models/PointsLedger";
import { VisitSession } from "@/models/VisitSession";
import { Order } from "@/models/Order";
import { Errors } from "@/lib/errors";
import { randomDigits, randomHex } from "@/lib/ids";
import { creditPoints } from "@/services/wallet.service";
import { getMembershipConfig, getSetting } from "@/services/settings.service";
import { notify } from "@/services/notification.service";

type Id = string | Types.ObjectId;
const opt = (session?: ClientSession) => (session ? { session } : {});

export async function generateCardNumber(session?: ClientSession) {
  for (let i = 0; i < 10; i++) {
    const n = `UCM-${randomDigits(4)}-${randomDigits(4)}`;
    if (!(await MembershipCard.exists({ cardNumber: n }).session(session ?? null))) return n;
  }
  throw new Error("Could not generate card number");
}

/** Ensures the customer has an ACTIVE card; issues a VIRTUAL (digital) card if none exists. */
export async function ensureDigitalCard(customerId: Id, session?: ClientSession) {
  const existing = await MembershipCard.findOne({ customer: customerId, status: "ACTIVE" }, null, opt(session));
  if (existing) return existing;
  const [card] = await MembershipCard.create(
    [
      {
        cardNumber: await generateCardNumber(session),
        customer: customerId,
        uid: `V${randomHex(6)}`.slice(0, 13),
        cardType: "VIRTUAL",
        status: "ACTIVE",
        history: [{ action: "ISSUED_DIGITAL", note: "Digital membership card issued on activation" }],
      },
    ],
    opt(session)
  );
  return card;
}

/**
 * Applies a verified, successful membership payment. This is the ONLY place where recharge
 * benefits are granted:
 *   points  += configured points (carry forward)
 *   minutes  = configured hours * 60 (reset, not added)
 * Idempotent: the MembershipTransaction.payment and PointsLedger(source,refId,type) unique
 * indexes make a second application impossible.
 */
export async function applyMembershipRecharge(paymentId: Id, session?: ClientSession) {
  const payment = await Payment.findById(paymentId, null, opt(session));
  if (!payment) throw Errors.notFound("Payment");
  if (payment.status !== "SUCCESS") throw Errors.business("PAYMENT_NOT_SUCCESSFUL", "Membership can only be credited for a successful payment");

  const already = await MembershipTransaction.findOne({ payment: payment._id }, null, opt(session)).lean();
  if (already) return { alreadyApplied: true as const };

  const cfg = await getMembershipConfig();
  const before = await Membership.findOne({ customer: payment.customer }, null, opt(session));
  if (!before) throw Errors.notFound("Membership");
  const isFirst = (before.rechargeCount ?? 0) === 0;

  // Credit points through the ledger-backed wallet service.
  await creditPoints({
    customerId: payment.customer,
    points: cfg.points,
    source: "RECHARGE",
    refModel: "Payment",
    refId: payment._id,
    reference: payment.receipt,
    description: `${isFirst ? "Membership purchase" : "Membership recharge"} — ${cfg.points} points`,
    session,
    isDemo: payment.isDemo,
    allowInactive: true,
  });

  const now = new Date();
  const updated = await Membership.findOneAndUpdate(
    { _id: before._id },
    {
      $set: {
        status: "ACTIVE",
        remainingMinutes: cfg.minutes,
        lastRechargeAt: now,
        ...(before.activatedAt ? {} : { activatedAt: now }),
        lowPointsNotifiedAt: null,
        lowHoursNotifiedAt: null,
      },
      $inc: { rechargeCount: 1 },
    },
    { new: true, ...opt(session) }
  );

  await MembershipTransaction.create(
    [
      {
        membership: before._id,
        customer: payment.customer,
        type: isFirst ? "PURCHASE" : "RECHARGE",
        amount: payment.amount,
        pointsCredited: cfg.points,
        pointsBefore: before.pointsBalance,
        pointsAfter: updated!.pointsBalance,
        minutesBefore: before.remainingMinutes,
        minutesAfter: cfg.minutes,
        payment: payment._id,
        reference: payment.receipt,
        note: payment.isDemo ? "DEMO payment — simulated, not a real transaction" : undefined,
        isDemo: payment.isDemo,
      },
    ],
    opt(session)
  );

  await ensureDigitalCard(payment.customer, session);

  await notify(
    payment.customer,
    "PAYMENT_CONFIRMATION",
    "Payment successful",
    `We received ₹${payment.amount.toLocaleString("en-IN")} (ref ${payment.receipt}).${payment.isDemo ? " [DEMO]" : ""}`,
    { link: "/customer/transactions", session, isDemo: payment.isDemo }
  );
  await notify(
    payment.customer,
    "MEMBERSHIP_RECHARGE",
    isFirst ? "Membership activated" : "Membership recharged",
    `${cfg.points.toLocaleString("en-IN")} points added. Balance: ${updated!.pointsBalance.toLocaleString("en-IN")} points. Hours reset to ${cfg.hours}.`,
    { link: "/customer/membership", session, isDemo: payment.isDemo }
  );

  return { alreadyApplied: false as const, membership: updated };
}

/**
 * Deducts consumed visit minutes, clamping at zero. Returns before/after values.
 * Uses an atomic pipeline update so concurrent exits cannot corrupt the balance.
 */
export async function consumeMinutes(membershipId: Id, minutes: number, session?: ClientSession) {
  const m = Math.max(0, Math.round(minutes));
  const before = await Membership.findOneAndUpdate(
    { _id: membershipId },
    [
      {
        $set: {
          remainingMinutes: { $max: [0, { $subtract: ["$remainingMinutes", m] }] },
          totalMinutesUsed: { $add: [{ $ifNull: ["$totalMinutesUsed", 0] }, m] },
        },
      },
    ],
    { new: false, ...opt(session) }
  );
  if (!before) throw Errors.notFound("Membership");
  const after = Math.max(0, before.remainingMinutes - m);
  const charged = before.remainingMinutes - after;
  return { before: before.remainingMinutes, after, charged, customer: before.customer };
}

export async function notifyHoursThresholds(customerId: Id, before: number, after: number) {
  const thresholdMin = Number(await getSetting("alerts.lowHoursThreshold")) * 60;
  if (after === 0 && before > 0) {
    await notify(customerId, "HOURS_EXHAUSTED", "Membership hours exhausted", "You have used all your membership hours. Recharge to enter a cafe again.", {
      link: "/customer/membership",
    });
  } else if (before >= thresholdMin && after < thresholdMin) {
    await notify(customerId, "LOW_HOURS", "Low membership hours", `Only ${Math.floor(after / 60)}h ${after % 60}m remaining.`, {
      link: "/customer/membership",
    });
  }
}

export async function getMembershipOverview(customerId: Id) {
  const [membership, card, recentLedger, recentOrders, recentVisits, activeVisit, cfg] = await Promise.all([
    Membership.findOne({ customer: customerId }).lean(),
    MembershipCard.findOne({ customer: customerId, status: "ACTIVE" }).populate("assignedCafe", "name code").lean(),
    PointsLedger.find({ customer: customerId }).sort({ createdAt: -1 }).limit(5).lean(),
    Order.find({ customer: customerId }).sort({ createdAt: -1 }).limit(5).populate("cafe", "name code").lean(),
    VisitSession.find({ customer: customerId }).sort({ entryAt: -1 }).limit(5).populate("cafe", "name code").lean(),
    VisitSession.findOne({ customer: customerId, status: "ACTIVE" }).populate("cafe", "name code").lean(),
    getMembershipConfig(),
  ]);
  if (!membership) throw Errors.notFound("Membership");
  const lowPoints = Number(await getSetting("alerts.lowPointsThreshold"));
  const lowHours = Number(await getSetting("alerts.lowHoursThreshold"));
  return {
    membership,
    card,
    recentLedger,
    recentOrders,
    recentVisits,
    activeVisit,
    config: cfg,
    flags: {
      lowPoints: membership.status === "ACTIVE" && membership.pointsBalance < lowPoints,
      lowHours: membership.status === "ACTIVE" && membership.remainingMinutes > 0 && membership.remainingMinutes < lowHours * 60,
      hoursExhausted: membership.status === "ACTIVE" && membership.remainingMinutes <= 0,
      inactive: membership.status !== "ACTIVE",
    },
  };
}

