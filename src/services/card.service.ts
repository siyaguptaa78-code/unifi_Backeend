import { Types } from "mongoose";
import { MembershipCard } from "../models/MembershipCard";
import { Membership } from "../models/Membership";
import { Staff } from "../models/Staff";
import { User } from "../models/User";
import { Errors } from "../lib/errors";
import { withTransaction } from "../lib/db";
import { generateCardNumber } from "./membership.service";
import { assertCafeAccess } from "./scope.service";
import { logAudit } from "./audit.service";
import type { AuthUser } from "../lib/auth/session";

/** Staff may assign cards only if granted `canAssignCards`; managers and admins always can. */
export async function assertCanAssignCards(user: AuthUser) {
  if (user.role === "SUPER_ADMIN" || user.role === "MANAGER") return;
  if (user.role === "STAFF") {
    const s = await Staff.findOne({ user: user.id, status: "ACTIVE" }).lean();
    if (s?.permissions?.canAssignCards) return;
  }
  throw Errors.forbidden("You are not permitted to assign or manage membership cards");
}

export function normalizeUid(uid: string) {
  return uid.replace(/[:\s-]/g, "").toUpperCase();
}

/**
 * Assigns a physical NFC/RFID card to a customer. Any existing ACTIVE card (digital or physical)
 * is marked REPLACED and linked to the new card, keeping full history.
 */
export async function assignCard(
  actor: AuthUser,
  input: { customerId: string; uid: string; cardType: "NFC" | "RFID"; cafeId?: string },
  ip?: string
) {
  await assertCanAssignCards(actor);
  if (input.cafeId) await assertCafeAccess(actor, input.cafeId);
  else if (actor.role !== "SUPER_ADMIN") throw Errors.badRequest("Cafe is required");
  const uid = normalizeUid(input.uid);
  const customer = await User.findOne({ _id: input.customerId, role: "CUSTOMER" }).lean();
  if (!customer) throw Errors.notFound("Customer");
  if (!(await Membership.exists({ customer: customer._id }))) throw Errors.business("NO_MEMBERSHIP", "Customer has no membership record");
  if (await MembershipCard.exists({ uid })) throw Errors.conflict("This card UID is already registered to a customer");

  const card = await withTransaction(async (session) => {
    const o = session ? { session } : {};
    const existing = await MembershipCard.findOne({ customer: customer._id, status: "ACTIVE" }, null, o);
    if (existing) {
      existing.status = "REPLACED";
      existing.history.push({ action: "REPLACED", by: new Types.ObjectId(actor.id), note: `Replaced by physical card ${uid}`, at: new Date() });
      await existing.save(o);
    }
    const [created] = await MembershipCard.create(
      [
        {
          cardNumber: await generateCardNumber(session),
          customer: customer._id,
          uid,
          cardType: input.cardType,
          status: "ACTIVE",
          assignedCafe: input.cafeId,
          issuedAt: new Date(),
          history: [{ action: "ASSIGNED", by: actor.id, note: existing ? `Replaces ${existing.cardNumber}` : "New card assigned" }],
        },
      ],
      o
    );
    if (existing) {
      existing.replacedBy = created._id;
      await existing.save(o);
    }
    return created;
  });
  await logAudit(actor, "CARD_ASSIGNED", "MembershipCard", card._id, { uid, customer: customer.email }, { cafe: input.cafeId, ip });
  return card;
}

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  ACTIVE: ["BLOCKED", "LOST", "INACTIVE"],
  BLOCKED: ["ACTIVE", "LOST", "INACTIVE"],
  INACTIVE: ["ACTIVE"],
  LOST: [],
  REPLACED: [],
};

export async function setCardStatus(actor: AuthUser, cardId: string, status: "ACTIVE" | "BLOCKED" | "LOST" | "INACTIVE", note?: string, ip?: string) {
  await assertCanAssignCards(actor);
  const card = await MembershipCard.findById(cardId);
  if (!card) throw Errors.notFound("Card");
  if (actor.role !== "SUPER_ADMIN") {
    if (!card.assignedCafe) throw Errors.forbidden("Only Super Admin can manage digital cards");
    await assertCafeAccess(actor, card.assignedCafe);
  }
  if (!ALLOWED_TRANSITIONS[card.status]?.includes(status)) {
    throw Errors.business("INVALID_CARD_TRANSITION", `Cannot change card from ${card.status} to ${status}`);
  }
  if (status === "ACTIVE" && (await MembershipCard.exists({ customer: card.customer, status: "ACTIVE", _id: { $ne: card._id } }))) {
    throw Errors.conflict("Customer already has another active card");
  }
  const prev = card.status;
  card.status = status;
  card.history.push({ action: status === "ACTIVE" ? "UNBLOCKED" : status, by: new Types.ObjectId(actor.id), note, at: new Date() });
  await card.save();
  await logAudit(actor, "CARD_STATUS_CHANGED", "MembershipCard", card._id, { from: prev, to: status, note }, { cafe: card.assignedCafe, ip });
  return card;
}

export async function findCustomerForCard(query: string) {
  const q = query.trim();
  const or: Record<string, unknown>[] = [{ email: q.toLowerCase() }, { mobile: q }];
  if (Types.ObjectId.isValid(q)) or.push({ _id: new Types.ObjectId(q) });
  return User.find({ role: "CUSTOMER", $or: or }).select("name email mobile").limit(5).lean();
}

