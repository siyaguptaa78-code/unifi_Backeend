import { Types } from "mongoose";
import { Order, type OrderStatus } from "@/models/Order";
import { OrderItem } from "@/models/OrderItem";
import { Cafe } from "@/models/Cafe";
import { Staff } from "@/models/Staff";
import { Membership } from "@/models/Membership";
import { Errors } from "@/lib/errors";
import { withTransaction } from "@/lib/db";
import { makeReference } from "@/lib/ids";
import { getCafeMenu } from "@/services/menu.service";
import { creditPoints, debitPoints, maybeNotifyLowPoints } from "@/services/wallet.service";
import { assertCafeAccess } from "@/services/scope.service";
import { getSetting } from "@/services/settings.service";
import { notify, type NotificationType } from "@/services/notification.service";
import { logAudit } from "@/services/audit.service";
import type { AuthUser } from "@/lib/auth/session";
import type { z } from "zod";
import type { placeOrderSchema } from "@/lib/validators";

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["ACCEPTED", "CANCELLED"],
  ACCEPTED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["COMPLETED", "CANCELLED"],
  COMPLETED: ["REFUNDED"],
  CANCELLED: [],
  REFUNDED: [],
};

const STATUS_NOTIFY: Partial<Record<OrderStatus, { type: NotificationType; title: string; msg: (n: string, cafe: string) => string }>> = {
  ACCEPTED: { type: "ORDER_ACCEPTED", title: "Order accepted", msg: (n, c) => `${c} accepted your order ${n}.` },
  PREPARING: { type: "ORDER_PREPARING", title: "Order being prepared", msg: (n) => `Your order ${n} is being prepared.` },
  READY: { type: "ORDER_READY", title: "Order ready for pickup", msg: (n, c) => `Your order ${n} is ready at ${c}.` },
  COMPLETED: { type: "ORDER_COMPLETED", title: "Order completed", msg: (n) => `Order ${n} completed. Enjoy!` },
};

/**
 * Places an order paid with points. Prices are resolved server-side from the cafe menu (client
 * prices are never trusted). Duplicate submissions with the same idempotency key return the
 * original order instead of debiting twice.
 */
export async function placeOrder(user: AuthUser, input: z.infer<typeof placeOrderSchema>) {
  const existing = await Order.findOne({ customer: user.id, idempotencyKey: input.idempotencyKey }).lean();
  if (existing) return { order: existing, duplicate: true };

  const cafe = await Cafe.findById(input.cafeId).lean();
  if (!cafe || cafe.status !== "ACTIVE") throw Errors.business("CAFE_UNAVAILABLE", "This cafe is not accepting orders right now");

  const normalizedOrderType = input.orderType === "IN_CAFE" ? "DINE_IN" : input.orderType;
  if (normalizedOrderType === "PRE_ORDER" && cafe.acceptsPreOrders === false) {
    throw Errors.business("PRE_ORDERS_DISABLED", "This cafe is not accepting online pre-orders at this time. Please order in-cafe upon arrival.");
  }

  const menu = await getCafeMenu(input.cafeId);
  const menuMap = new Map(menu.map((m) => [m._id, m]));
  const merged = new Map<string, number>();
  for (const it of input.items) merged.set(it.menuItemId, (merged.get(it.menuItemId) ?? 0) + it.quantity);

  const lines = [...merged.entries()].map(([id, qty]) => {
    const m = menuMap.get(id);
    if (!m) throw Errors.business("ITEM_UNAVAILABLE", "One or more items are no longer available at this cafe", { menuItemId: id });
    return { menuItem: new Types.ObjectId(id), name: m.name, unitPoints: m.pointsPrice, quantity: qty, lineTotal: m.pointsPrice * qty };
  });
  const total = lines.reduce((s, l) => s + l.lineTotal, 0);
  const itemCount = lines.reduce((s, l) => s + l.quantity, 0);

  const membership = await Membership.findOne({ customer: user.id }).lean();
  if (!membership || membership.status !== "ACTIVE") {
    throw Errors.business("MEMBERSHIP_INACTIVE", "An active membership is required to place orders.");
  }
  if (membership.pointsBalance < total) {
    throw Errors.business("INSUFFICIENT_POINTS", `Insufficient points. Available: ${membership.pointsBalance}, required: ${total}`, {
      available: membership.pointsBalance,
      required: total,
    });
  }

  let order;
  try {
    order = await withTransaction(async (session) => {
      const o = session ? { session } : {};
      const orderNumber = makeReference("ORD");
      const arrivalDate = input.expectedArrivalTime ? new Date(input.expectedArrivalTime) : undefined;
      const [created] = await Order.create(
        [
          {
            orderNumber,
            customer: user.id,
            cafe: cafe._id,
            orderType: normalizedOrderType,
            status: "PENDING",
            totalPoints: total,
            itemCount,
            notes: input.notes,
            expectedArrivalTime: arrivalDate,
            pickupSlot: input.pickupSlot,
            estimatedPrepMinutes: cafe.estimatedPrepMinutes ?? 15,
            idempotencyKey: input.idempotencyKey,
            statusHistory: [
              {
                status: "PENDING",
                by: user.id,
                at: new Date(),
                note: normalizedOrderType === "PRE_ORDER"
                  ? `Online Pre-Order for cafe collection (Slot: ${input.pickupSlot || "ASAP"})`
                  : "Dine-In order placed at cafe",
              },
            ],
          },
        ],
        o
      );
      await OrderItem.insertMany(lines.map((l) => ({ ...l, order: created._id })), o);
      try {
        await debitPoints({
          customerId: user.id,
          points: total,
          source: "ORDER",
          refModel: "Order",
          refId: created._id,
          reference: orderNumber,
          description: `Order ${orderNumber} at ${cafe.name}`,
          cafe: cafe._id,
          performedBy: user.id,
          session,
        });
      } catch (e) {
        if (!session) {
          // No transaction support: compensate by removing the order we just created.
          await OrderItem.deleteMany({ order: created._id });
          await Order.deleteOne({ _id: created._id });
        }
        throw e;
      }
      return created;
    });
  } catch (e) {
    if ((e as { code?: number }).code === 11000) {
      const dup = await Order.findOne({ customer: user.id, idempotencyKey: input.idempotencyKey }).lean();
      if (dup) return { order: dup, duplicate: true };
    }
    throw e;
  }

  await maybeNotifyLowPoints(user.id, membership.pointsBalance, membership.pointsBalance - total);
  await notify(user.id, "ORDER_PLACED", "Order placed", `Order ${order.orderNumber} placed at ${cafe.name} for ${total} points.`, {
    link: `/customer/orders?id=${order._id}`,
  });
  return { order: order.toObject(), duplicate: false };
}

/** Refunds the full order points (per current policy) with a ledger entry linked to the order. */
async function refundOrderPoints(order: { _id: Types.ObjectId; customer: Types.ObjectId; totalPoints: number; orderNumber: string; cafe: Types.ObjectId }, actorId: string, session?: import("mongoose").ClientSession) {
  await creditPoints({
    customerId: order.customer,
    points: order.totalPoints,
    source: "ORDER_REFUND",
    refModel: "Order",
    refId: order._id,
    reference: `RFD-${order.orderNumber}`,
    description: `Refund for order ${order.orderNumber}`,
    cafe: order.cafe,
    performedBy: actorId,
    session,
  });
}

async function assertStaffCanCancel(user: AuthUser) {
  if (user.role !== "STAFF") return;
  const s = await Staff.findOne({ user: user.id }).lean();
  if (s && s.permissions?.canCancelOrders === false) throw Errors.forbidden("You are not permitted to cancel orders");
}

export async function updateOrderStatus(actor: AuthUser, orderId: string, next: OrderStatus, reason?: string, ip?: string) {
  const order = await Order.findById(orderId);
  if (!order) throw Errors.notFound("Order");
  await assertCafeAccess(actor, order.cafe);
  const allowed = ORDER_TRANSITIONS[order.status as OrderStatus] ?? [];
  if (!allowed.includes(next) || next === "REFUNDED") {
    throw Errors.business("INVALID_TRANSITION", `Cannot move order from ${order.status} to ${next}`);
  }
  if (next === "CANCELLED") {
    if (!reason || reason.trim().length < 3) throw Errors.validation({ reason: ["A cancellation reason is required"] });
    await assertStaffCanCancel(actor);
    return cancelOrder(actor, order._id, reason, ip);
  }
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: order.status },
    {
      $set: { status: next, ...(next === "COMPLETED" ? { completedAt: new Date() } : {}) },
      $push: { statusHistory: { status: next, by: actor.id, at: new Date(), note: reason } },
    },
    { new: true }
  );
  if (!updated) throw Errors.conflict("Order was updated by someone else. Please refresh.");
  const cafe = await Cafe.findById(order.cafe).select("name").lean();
  const n = STATUS_NOTIFY[next];
  if (n) await notify(order.customer, n.type, n.title, n.msg(order.orderNumber, cafe?.name ?? "The cafe"), { link: `/customer/orders?id=${order._id}` });
  await logAudit(actor, "ORDER_STATUS_UPDATED", "Order", order._id, { from: order.status, to: next }, { cafe: order.cafe, ip });
  return updated.toObject();
}

/** Cancels an order and refunds points atomically (policy: full refund before completion). */
export async function cancelOrder(actor: AuthUser, orderId: Types.ObjectId | string, reason: string, ip?: string) {
  const result = await withTransaction(async (session) => {
    const o = session ? { session } : {};
    const order = await Order.findOneAndUpdate(
      { _id: orderId, status: { $in: ["PENDING", "ACCEPTED", "PREPARING", "READY"] } },
      {
        $set: { status: "CANCELLED", cancelReason: reason, cancelledBy: actor.id, refundStatus: "REFUNDED", refundedAt: new Date() },
        $push: { statusHistory: { status: "CANCELLED", by: actor.id, at: new Date(), note: reason } },
      },
      { new: true, ...o }
    );
    if (!order) throw Errors.business("INVALID_TRANSITION", "Order can no longer be cancelled");
    await refundOrderPoints(order, actor.id, session);
    order.refundedPoints = order.totalPoints;
    await order.save(o);
    return order;
  });
  await notify(result.customer, "ORDER_CANCELLED", "Order cancelled", `Order ${result.orderNumber} was cancelled: ${reason}`, {
    link: `/customer/orders?id=${result._id}`,
  });
  await notify(result.customer, "REFUND_PROCESSED", "Points refunded", `${result.totalPoints} points refunded for order ${result.orderNumber}.`, {
    link: "/customer/wallet",
  });
  await logAudit(actor, "ORDER_CANCELLED", "Order", result._id, { reason, refundedPoints: result.totalPoints }, { cafe: result.cafe, ip });
  return result.toObject();
}

export async function customerCancelOrder(user: AuthUser, orderId: string, reason: string) {
  const order = await Order.findOne({ _id: orderId, customer: user.id }).lean();
  if (!order) throw Errors.notFound("Order");
  const allowedStatuses = (await getSetting("orders.customerCancelStatuses")) as string[];
  if (!allowedStatuses.includes(order.status)) {
    throw Errors.business("CANNOT_CANCEL", "This order is already being processed and can no longer be cancelled. Please speak to cafe staff.");
  }
  return cancelOrder(user, order._id, reason || "Cancelled by customer");
}

/** Super Admin refund of a COMPLETED order. */
export async function refundCompletedOrder(admin: AuthUser, orderId: string, reason: string, ip?: string) {
  const result = await withTransaction(async (session) => {
    const o = session ? { session } : {};
    const order = await Order.findOneAndUpdate(
      { _id: orderId, status: "COMPLETED", refundStatus: "NONE" },
      {
        $set: { status: "REFUNDED", refundStatus: "REFUNDED", refundedAt: new Date(), cancelReason: reason },
        $push: { statusHistory: { status: "REFUNDED", by: admin.id, at: new Date(), note: reason } },
      },
      { new: true, ...o }
    );
    if (!order) throw Errors.business("INVALID_TRANSITION", "Only completed, un-refunded orders can be refunded");
    await refundOrderPoints(order, admin.id, session);
    order.refundedPoints = order.totalPoints;
    await order.save(o);
    return order;
  });
  await notify(result.customer, "REFUND_PROCESSED", "Points refunded", `${result.totalPoints} points refunded for order ${result.orderNumber}.`, {
    link: "/customer/wallet",
  });
  await logAudit(admin, "ORDER_REFUNDED", "Order", result._id, { reason }, { cafe: result.cafe, ip });
  return result.toObject();
}

export async function getOrderDetail(orderId: string) {
  const order = await Order.findById(orderId)
    .populate("cafe", "name code address")
    .populate("customer", "name email mobile")
    .populate("statusHistory.by", "name role")
    .lean();
  if (!order) throw Errors.notFound("Order");
  const items = await OrderItem.find({ order: order._id }).lean();
  return { ...order, items };
}

