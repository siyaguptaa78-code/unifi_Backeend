import { Types } from "mongoose";
import { MembershipCard } from "../models/MembershipCard";
import { Membership } from "../models/Membership";
import { MembershipTransaction } from "../models/MembershipTransaction";
import { VisitSession } from "../models/VisitSession";
import { CustomerProfile } from "../models/CustomerProfile";
import { Cafe } from "../models/Cafe";
import { User } from "../models/User";
import { Errors } from "../lib/errors";
import { withTransaction } from "../lib/db";
import { makeReference } from "../lib/ids";
import { consumeMinutes, notifyHoursThresholds } from "./membership.service";
import { assertCafeAccess } from "./scope.service";
import { getSetting } from "./settings.service";
import { notify } from "./notification.service";
import { logAudit } from "./audit.service";
import { normalizeUid } from "./card.service";
import type { AuthUser } from "../lib/auth/session";

export type ScanInput = { uid: string; cafeId: string; mode: "AUTO" | "ENTRY" | "EXIT"; deviceId: string };

/** Elapsed minutes, rounded up to the next whole minute (billing rule — PENDING CLIENT CONFIRMATION). */
export function elapsedMinutes(from: Date, to: Date) {
  return Math.max(0, Math.ceil((to.getTime() - from.getTime()) / 60000));
}

async function customerSummary(customerId: Types.ObjectId | string) {
  const [user, profile, membership] = await Promise.all([
    User.findById(customerId).select("name email mobile").lean(),
    CustomerProfile.findOne({ user: customerId }).select("customerCode").lean(),
    Membership.findOne({ customer: customerId }).lean(),
  ]);
  return {
    id: String(customerId),
    name: user?.name,
    mobile: user?.mobile,
    customerCode: profile?.customerCode,
    pointsBalance: membership?.pointsBalance ?? 0,
    remainingMinutes: membership?.remainingMinutes ?? 0,
    membershipStatus: membership?.status ?? "INACTIVE",
  };
}

/**
 * Processes a card tap (physical reader or simulator — identical logic). Uses server time only.
 *  - Entry: card ACTIVE, membership ACTIVE, remaining minutes > 0, no active session.
 *  - Exit:  always allowed for an active session, even if hours are (or become) zero.
 */
export async function processScan(actor: AuthUser, input: ScanInput, ip?: string) {
  const uid = normalizeUid(input.uid);
  await assertCafeAccess(actor, input.cafeId);
  const cafe = await Cafe.findById(input.cafeId).lean();
  if (!cafe) throw Errors.notFound("Cafe");
  if (cafe.status !== "ACTIVE") throw Errors.business("CAFE_INACTIVE", "This cafe is not currently active");

  const card = await MembershipCard.findOne({ uid });
  if (!card) throw Errors.business("CARD_NOT_FOUND", "Card not recognised. Please register the card first.");
  if (card.status !== "ACTIVE") throw Errors.business("CARD_NOT_ACTIVE", `Card is ${card.status.toLowerCase()}. Entry/exit denied.`, { status: card.status });

  const now = new Date();
  const windowSec = Number(await getSetting("visits.duplicateTapSeconds"));
  if (card.lastTapAt && now.getTime() - card.lastTapAt.getTime() < windowSec * 1000) {
    throw Errors.conflict(`Duplicate tap ignored. Please wait ${windowSec} seconds between taps.`, { code: "DUPLICATE_TAP" });
  }

  const active = await VisitSession.findOne({ customer: card.customer, status: "ACTIVE" });
  const action: "ENTRY" | "EXIT" = input.mode === "AUTO" ? (active ? "EXIT" : "ENTRY") : input.mode;

  if (action === "EXIT") {
    if (!active) throw Errors.business("NO_ACTIVE_SESSION", "Customer has no active visit to check out from.");
    const result = await withTransaction(async (session) => {
      const o = session ? { session } : {};
      const minutes = elapsedMinutes(active.entryAt, now);
      const closed = await VisitSession.findOneAndUpdate(
        { _id: active._id, status: "ACTIVE" },
        { $set: { status: "COMPLETED", exitAt: now, exitCafe: cafe._id, exitBy: actor.id, exitDevice: input.deviceId } },
        { new: true, ...o }
      );
      if (!closed) throw Errors.conflict("This visit was already closed", { code: "DUPLICATE_TAP" });
      const usage = await consumeMinutes(active.membership, minutes, session);
      closed.minutesConsumed = usage.charged;
      closed.minutesBefore = usage.before;
      closed.minutesAfter = usage.after;
      await closed.save(o);
      await MembershipTransaction.create(
        [
          {
            membership: active.membership,
            customer: active.customer,
            type: "HOURS_USAGE",
            minutesBefore: usage.before,
            minutesAfter: usage.after,
            visit: closed._id,
            reference: makeReference("VIS"),
            note: `Visit at ${cafe.name}: ${minutes} min elapsed, ${usage.charged} min charged`,
            performedBy: actor.id,
          },
        ],
        o
      );
      await MembershipCard.updateOne({ _id: card._id }, { lastTapAt: now, lastUsedAt: now }, o);
      return { closed, usage, minutes };
    });
    await notify(card.customer, "VISIT_EXIT", "Checked out", `You checked out of ${cafe.name}. ${result.usage.charged} minutes used.`, {
      link: "/customer/visits",
    });
    await notifyHoursThresholds(card.customer, result.usage.before, result.usage.after);
    return {
      action: "EXIT" as const,
      message: `Checked out — ${result.usage.charged} min deducted`,
      session: result.closed.toObject(),
      elapsedMinutes: result.minutes,
      customer: await customerSummary(card.customer),
      card: { cardNumber: card.cardNumber, uid: card.uid, cardType: card.cardType },
      cafe: { id: String(cafe._id), name: cafe.name },
    };
  }

  // ENTRY
  if (active) {
    throw Errors.business("ALREADY_CHECKED_IN", "Customer already has an active visit session.", { sessionId: String(active._id) });
  }
  const membership = await Membership.findOne({ customer: card.customer });
  if (!membership || membership.status !== "ACTIVE") {
    throw Errors.business("MEMBERSHIP_INACTIVE", "Membership is not active. Please purchase or recharge membership.");
  }
  if (membership.remainingMinutes <= 0) {
    throw Errors.business("HOURS_EXHAUSTED", "Membership hours exhausted. Entry denied until recharge.");
  }
  let created;
  try {
    created = await withTransaction(async (session) => {
      const o = session ? { session } : {};
      const [visit] = await VisitSession.create(
        [
          {
            customer: card.customer,
            membership: membership._id,
            card: card._id,
            cafe: cafe._id,
            status: "ACTIVE",
            entryAt: now,
            entryBy: actor.id,
            entryDevice: input.deviceId,
            minutesBefore: membership.remainingMinutes,
          },
        ],
        o
      );
      await MembershipCard.updateOne({ _id: card._id }, { lastTapAt: now, lastUsedAt: now }, o);
      return visit;
    });
  } catch (e) {
    if ((e as { code?: number }).code === 11000) throw Errors.business("ALREADY_CHECKED_IN", "Customer already has an active visit session.");
    throw e;
  }
  await notify(card.customer, "VISIT_ENTRY", "Checked in", `Welcome to ${cafe.name}! Your visit timer has started.`, { link: "/customer/visits" });
  await logAudit(actor, "VISIT_ENTRY", "VisitSession", created._id, { uid, device: input.deviceId }, { cafe: cafe._id, ip });
  return {
    action: "ENTRY" as const,
    message: "Check-in successful",
    session: created.toObject(),
    customer: await customerSummary(card.customer),
    card: { cardNumber: card.cardNumber, uid: card.uid, cardType: card.cardType },
    cafe: { id: String(cafe._id), name: cafe.name },
  };
}

/**
 * Audited admin/manager correction. For an ACTIVE (interrupted) session it closes the visit at
 * the supplied exit time; for a COMPLETED session it re-computes usage and adjusts the balance
 * by the difference (positive = refund minutes, negative = additional deduction).
 */
export async function correctVisit(actor: AuthUser, visitId: string, input: { exitAt: string; reason: string }, ip?: string) {
  const visit = await VisitSession.findById(visitId);
  if (!visit) throw Errors.notFound("Visit");
  await assertCafeAccess(actor, visit.cafe);
  const exitAt = new Date(input.exitAt);
  if (isNaN(exitAt.getTime())) throw Errors.badRequest("Invalid exit time");
  if (exitAt < visit.entryAt) throw Errors.badRequest("Exit time cannot be before entry time");
  if (exitAt > new Date()) throw Errors.badRequest("Exit time cannot be in the future");
  const newMinutes = elapsedMinutes(visit.entryAt, exitAt);

  const out = await withTransaction(async (session) => {
    const o = session ? { session } : {};
    const membership = await Membership.findById(visit.membership, null, o);
    if (!membership) throw Errors.notFound("Membership");
    const before = membership.remainingMinutes;
    let after: number;
    if (visit.status === "ACTIVE") {
      after = Math.max(0, before - newMinutes);
      visit.minutesConsumed = before - after;
    } else {
      const delta = (visit.minutesConsumed ?? 0) - newMinutes; // + => give back
      after = Math.max(0, before + delta);
      visit.minutesConsumed = Math.max(0, (visit.minutesConsumed ?? 0) - (after - before));
    }
    membership.remainingMinutes = after;
    membership.totalMinutesUsed = Math.max(0, (membership.totalMinutesUsed ?? 0) + (before - after));
    await membership.save(o);
    visit.correction = { by: new Types.ObjectId(actor.id), at: new Date(), reason: input.reason, originalExitAt: visit.exitAt ?? undefined };
    visit.exitAt = exitAt;
    visit.exitBy = visit.exitBy ?? new Types.ObjectId(actor.id);
    visit.minutesAfter = after;
    visit.status = "CORRECTED";
    await visit.save(o);
    await MembershipTransaction.create(
      [
        {
          membership: membership._id,
          customer: visit.customer,
          type: "HOURS_ADJUSTMENT",
          minutesBefore: before,
          minutesAfter: after,
          visit: visit._id,
          reference: makeReference("ADJ"),
          note: `Visit correction: ${input.reason}`,
          performedBy: actor.id,
        },
      ],
      o
    );
    return { before, after };
  });
  await logAudit(actor, "VISIT_CORRECTED", "VisitSession", visit._id, { ...input, ...out }, { cafe: visit.cafe, ip });
  return visit.toObject();
}

