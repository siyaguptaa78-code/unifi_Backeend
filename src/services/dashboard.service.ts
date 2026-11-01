import { Types, type PipelineStage } from "mongoose";
import { User } from "../models/User";
import { Membership } from "../models/Membership";
import { Cafe } from "../models/Cafe";
import { Franchise } from "../models/Franchise";
import { Order } from "../models/Order";
import { Payment } from "../models/Payment";
import { PointsLedger } from "../models/PointsLedger";
import { VisitSession } from "../models/VisitSession";
import { MembershipTransaction } from "../models/MembershipTransaction";
import { AuditLog } from "../models/AuditLog";
import { CafeMenuCustomization } from "../models/CafeMenuCustomization";
import { Staff } from "../models/Staff";
import { getCafeScope } from "./scope.service";
import { Errors } from "../lib/errors";
import type { AuthUser } from "../lib/auth/session";

export type DashFilters = { from?: string; to?: string; cafeId?: string; franchiseId?: string; orderStatus?: string; paymentStatus?: string };

const TZ = "Asia/Kolkata";

function range(f: DashFilters, field: string) {
  const r: Record<string, Date> = {};
  if (f.from && !isNaN(Date.parse(f.from))) r.$gte = new Date(f.from);
  if (f.to && !isNaN(Date.parse(f.to))) {
    const d = new Date(f.to);
    if (/^\d{4}-\d{2}-\d{2}$/.test(f.to)) d.setHours(23, 59, 59, 999);
    r.$lte = d;
  }
  return Object.keys(r).length ? { [field]: r } : {};
}

async function resolveCafeIds(f: DashFilters): Promise<Types.ObjectId[] | null> {
  if (f.cafeId && Types.ObjectId.isValid(f.cafeId)) return [new Types.ObjectId(f.cafeId)];
  if (f.franchiseId && Types.ObjectId.isValid(f.franchiseId)) {
    const cafes = await Cafe.find({ franchise: f.franchiseId }).select("_id").lean();
    return cafes.map((c) => c._id);
  }
  return null;
}

function sumOf(agg: { total?: number }[]) {
  return agg[0]?.total ?? 0;
}

export async function platformDashboard(f: DashFilters) {
  const cafeIds = await resolveCafeIds(f);
  const cafeMatch = cafeIds ? { cafe: { $in: cafeIds } } : {};
  const orderMatch = { ...range(f, "createdAt"), ...cafeMatch, ...(f.orderStatus ? { status: f.orderStatus } : {}) };
  const payMatch = { ...range(f, "createdAt"), ...(f.paymentStatus ? { status: f.paymentStatus } : { status: "SUCCESS" }) };
  const ledgerMatch = { ...range(f, "createdAt") };
  const visitMatch = { ...range(f, "entryAt"), ...cafeMatch };

  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11, 1);
  twelveMonthsAgo.setHours(0, 0, 0, 0);
  const thirtyDaysAgo = new Date(Date.now() - 29 * 86400000);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  const monthFmt = { $dateToString: { format: "%Y-%m", date: "$createdAt", timezone: TZ } };
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [
    totalCustomers,
    activeMemberships,
    inactiveMemberships,
    pointsCirculationAgg,
    totalCafes,
    activeFranchises,
    franchiseLocations,
    franchiseOwnersCount,
    supervisorsCount,
    managersCount,
    staffCount,
    totalOrders,
    todayOrdersCount,
    pendingOrdersCount,
    completedOrdersCount,
    cancelledOrdersCount,
    revenueAgg,
    todayRevenueAgg,
    issuedAgg,
    redeemedAgg,
    refundedAgg,
    totalVisits,
    activeSessions,
    monthlyRevenue,
    membershipPurchases,
    orderTrend,
    cafePerformance,
    pointsUsage,
    visitActivity,
    recentOrders,
    recentPayments,
    recentCustomers,
    pendingFranchises,
    recentActivity,
    orderStatusBreakdown,
  ] = await Promise.all([
    User.countDocuments({ role: "CUSTOMER", ...range(f, "createdAt") }),
    Membership.countDocuments({ status: "ACTIVE" }),
    Membership.countDocuments({ status: { $ne: "ACTIVE" } }),
    Membership.aggregate([{ $match: { status: "ACTIVE" } }, { $group: { _id: null, total: { $sum: "$pointsBalance" } } }]),
    Cafe.countDocuments({ status: { $ne: "INACTIVE" } }),
    Franchise.countDocuments({ status: "ACTIVE" }),
    Cafe.countDocuments({ ownershipType: "FRANCHISE", status: { $ne: "INACTIVE" } }),
    User.countDocuments({ role: "FRANCHISE_OWNER", status: "ACTIVE" }),
    User.countDocuments({ role: "SUPERVISOR", status: "ACTIVE" }),
    User.countDocuments({ role: "MANAGER", status: "ACTIVE" }),
    User.countDocuments({ role: "STAFF", status: "ACTIVE" }),
    Order.countDocuments(orderMatch),
    Order.countDocuments({ createdAt: { $gte: startOfToday }, ...cafeMatch }),
    Order.countDocuments({ status: { $in: ["PLACED", "ACCEPTED", "PREPARING"] }, ...cafeMatch }),
    Order.countDocuments({ status: "COMPLETED", ...cafeMatch }),
    Order.countDocuments({ status: { $in: ["CANCELLED", "REJECTED"] }, ...cafeMatch }),
    Payment.aggregate([{ $match: { ...payMatch, status: "SUCCESS" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
    Payment.aggregate([{ $match: { status: "SUCCESS", createdAt: { $gte: startOfToday } } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
    PointsLedger.aggregate([{ $match: { ...ledgerMatch, type: "CREDIT" } }, { $group: { _id: null, total: { $sum: "$points" } } }]),
    PointsLedger.aggregate([{ $match: { ...ledgerMatch, type: "DEBIT", ...cafeMatch } }, { $group: { _id: null, total: { $sum: { $abs: "$points" } } } }]),
    PointsLedger.aggregate([{ $match: { ...ledgerMatch, type: "REFUND", ...cafeMatch } }, { $group: { _id: null, total: { $sum: "$points" } } }]),
    VisitSession.countDocuments(visitMatch),
    VisitSession.countDocuments({ status: "ACTIVE", ...cafeMatch }),
    Payment.aggregate([
      { $match: { status: "SUCCESS", createdAt: { $gte: twelveMonthsAgo } } },
      { $group: { _id: monthFmt, revenue: { $sum: "$amount" }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    MembershipTransaction.aggregate([
      { $match: { type: { $in: ["PURCHASE", "RECHARGE"] }, createdAt: { $gte: twelveMonthsAgo } } },
      { $group: { _id: { m: monthFmt, t: "$type" }, count: { $sum: 1 } } },
      { $sort: { "_id.m": 1 } },
    ]),
    Order.aggregate([
      { $match: { ...cafeMatch, createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TZ } },
          orders: { $sum: 1 },
          points: { $sum: { $cond: [{ $in: ["$status", ["CANCELLED", "REFUNDED"]] }, 0, "$totalPoints"] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Order.aggregate([
      { $match: { ...orderMatch, status: { $nin: ["CANCELLED", "REFUNDED"] } } },
      { $group: { _id: "$cafe", orders: { $sum: 1 }, points: { $sum: "$totalPoints" } } },
      { $sort: { points: -1 } },
      { $limit: 10 },
      { $lookup: { from: "cafes", localField: "_id", foreignField: "_id", as: "cafe" } },
      { $unwind: "$cafe" },
      { $project: { _id: 1, orders: 1, points: 1, name: "$cafe.name", code: "$cafe.code" } },
    ]),
    PointsLedger.aggregate([
      { $match: { createdAt: { $gte: twelveMonthsAgo } } },
      {
        $group: {
          _id: monthFmt,
          credited: { $sum: { $cond: [{ $eq: ["$type", "CREDIT"] }, "$points", 0] } },
          spent: { $sum: { $cond: [{ $eq: ["$type", "DEBIT"] }, { $abs: "$points" }, 0] } },
          refunded: { $sum: { $cond: [{ $eq: ["$type", "REFUND"] }, "$points", 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    VisitSession.aggregate([
      { $match: { ...cafeMatch, entryAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$entryAt", timezone: TZ } },
          visits: { $sum: 1 },
          minutes: { $sum: "$minutesConsumed" },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Order.find(orderMatch).sort({ createdAt: -1 }).limit(8).populate("customer", "name").populate("cafe", "name code").lean(),
    Payment.find(f.paymentStatus ? payMatch : range(f, "createdAt")).sort({ createdAt: -1 }).limit(8).populate("customer", "name email").lean(),
    User.find({ role: "CUSTOMER" }).sort({ createdAt: -1 }).limit(8).select("name email mobile createdAt").lean(),
    Franchise.find({ status: "PENDING_APPROVAL" }).sort({ createdAt: -1 }).limit(8).populate("package", "name amount").lean(),
    AuditLog.find().sort({ createdAt: -1 }).limit(10).lean(),
    Order.aggregate([{ $match: orderMatch }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
  ]);

  return {
    kpis: {
      totalCustomers,
      activeMemberships,
      inactiveMemberships,
      pointsInCirculation: sumOf(pointsCirculationAgg),
      totalCafes,
      activeFranchises,
      franchiseLocations,
      franchiseOwnersCount,
      supervisorsCount,
      managersCount,
      staffCount,
      totalOrders,
      todayOrders: todayOrdersCount,
      pendingOrders: pendingOrdersCount,
      completedOrders: completedOrdersCount,
      cancelledOrders: cancelledOrdersCount,
      totalRevenue: sumOf(revenueAgg),
      todayRevenue: sumOf(todayRevenueAgg),
      pointsIssued: sumOf(issuedAgg),
      pointsRedeemed: sumOf(redeemedAgg) - sumOf(refundedAgg),
      totalVisits,
      activeSessions,
    },
    charts: {
      monthlyRevenue: monthlyRevenue.map((r) => ({ month: r._id, revenue: r.revenue, count: r.count })),
      membershipPurchases: Object.values(
        membershipPurchases.reduce<Record<string, { month: string; purchases: number; recharges: number }>>((acc, r) => {
          const m = r._id.m as string;
          acc[m] ??= { month: m, purchases: 0, recharges: 0 };
          if (r._id.t === "PURCHASE") acc[m].purchases += r.count;
          else acc[m].recharges += r.count;
          return acc;
        }, {})
      ),
      orderTrend: orderTrend.map((r) => ({ date: r._id, orders: r.orders, points: r.points })),
      cafePerformance,
      pointsUsage: pointsUsage.map((r) => ({ month: r._id, credited: r.credited, spent: r.spent, refunded: r.refunded })),
      visitActivity: visitActivity.map((r) => ({ date: r._id, visits: r.visits, hours: Math.round((r.minutes / 60) * 10) / 10 })),
      orderStatusBreakdown: orderStatusBreakdown.map((r) => ({ status: r._id, count: r.count })),
    },
    tables: { recentOrders, recentPayments, recentCustomers, topCafes: cafePerformance.slice(0, 5), pendingFranchises, recentActivity },
  };
}

/** Scoped operations dashboard for supervisors, franchise owners, managers and staff. */
export async function operationsDashboard(user: AuthUser, f: DashFilters) {
  const scope = await getCafeScope(user);
  let cafeIds: Types.ObjectId[] = scope ?? (await Cafe.find().select("_id").lean()).map((c) => c._id);
  if (f.cafeId) {
    if (!cafeIds.some((c) => String(c) === f.cafeId)) throw Errors.forbidden("You do not have access to this cafe");
    cafeIds = [new Types.ObjectId(f.cafeId)];
  }
  const cafeMatch = { cafe: { $in: cafeIds } };
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const fourteenDaysAgo = new Date(startOfToday.getTime() - 13 * 86400000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
  const period = range(f, "createdAt");
  const periodMatch = Object.keys(period).length ? period : { createdAt: { $gte: startOfToday } };
  const visitPeriod = range(f, "entryAt");
  const visitPeriodMatch = Object.keys(visitPeriod).length ? visitPeriod : { entryAt: { $gte: startOfToday } };

  const dayFmt = (field: string) => ({ $dateToString: { format: "%Y-%m-%d", date: field, timezone: TZ } });

  const [cafes, ordersByStatus, salesAgg, visitsCount, activeVisits, trend, visitTrend, cafeOrders, cafeVisits, recentOrders, unavailableItems, staffActivity, staffCount, pendingOld, longSessions, hoursUsed] =
    await Promise.all([
      Cafe.find({ _id: { $in: cafeIds } }).populate("manager", "name").populate("supervisor", "name").populate("franchise", "name code").lean(),
      Order.aggregate([{ $match: { ...cafeMatch, ...periodMatch } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
      Order.aggregate([
        { $match: { ...cafeMatch, ...periodMatch, status: { $nin: ["CANCELLED", "REFUNDED"] } } },
        { $group: { _id: null, total: { $sum: "$totalPoints" }, count: { $sum: 1 } } },
      ]),
      VisitSession.countDocuments({ ...cafeMatch, ...visitPeriodMatch }),
      VisitSession.find({ ...cafeMatch, status: "ACTIVE" }).sort({ entryAt: 1 }).limit(50).populate("customer", "name mobile").populate("cafe", "name code").lean(),
      Order.aggregate([
        { $match: { ...cafeMatch, createdAt: { $gte: fourteenDaysAgo } } },
        {
          $group: {
            _id: dayFmt("$createdAt"),
            orders: { $sum: 1 },
            points: { $sum: { $cond: [{ $in: ["$status", ["CANCELLED", "REFUNDED"]] }, 0, "$totalPoints"] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      VisitSession.aggregate([
        { $match: { ...cafeMatch, entryAt: { $gte: fourteenDaysAgo } } },
        { $group: { _id: dayFmt("$entryAt"), visits: { $sum: 1 }, minutes: { $sum: "$minutesConsumed" } } },
        { $sort: { _id: 1 } },
      ]),
      Order.aggregate([
        { $match: { ...cafeMatch, ...periodMatch, status: { $nin: ["CANCELLED", "REFUNDED"] } } },
        { $group: { _id: "$cafe", orders: { $sum: 1 }, points: { $sum: "$totalPoints" } } },
      ]),
      VisitSession.aggregate([{ $match: { ...cafeMatch, ...visitPeriodMatch } }, { $group: { _id: "$cafe", visits: { $sum: 1 }, minutes: { $sum: "$minutesConsumed" } } }]),
      Order.find({ ...cafeMatch }).sort({ createdAt: -1 }).limit(10).populate("customer", "name").populate("cafe", "name code").lean(),
      CafeMenuCustomization.countDocuments({ ...cafeMatch, isAvailable: false }),
      AuditLog.aggregate([
        { $match: { ...cafeMatch, createdAt: { $gte: sevenDaysAgo }, actorRole: { $in: ["STAFF", "MANAGER"] } } },
        { $group: { _id: "$actor", name: { $first: "$actorName" }, role: { $first: "$actorRole" }, actions: { $sum: 1 }, lastAt: { $max: "$createdAt" } } },
        { $sort: { actions: -1 } },
        { $limit: 10 },
      ]),
      Staff.countDocuments({ cafes: { $in: cafeIds }, status: "ACTIVE" }),
      Order.countDocuments({ ...cafeMatch, status: "PENDING", createdAt: { $lt: new Date(Date.now() - 15 * 60000) } }),
      VisitSession.countDocuments({ ...cafeMatch, status: "ACTIVE", entryAt: { $lt: new Date(Date.now() - 8 * 3600000) } }),
      VisitSession.aggregate([{ $match: { ...cafeMatch, ...visitPeriodMatch } }, { $group: { _id: null, total: { $sum: "$minutesConsumed" } } }]),
    ]);

  const statusMap = Object.fromEntries(ordersByStatus.map((s) => [s._id, s.count]));
  const coMap = new Map(cafeOrders.map((c) => [String(c._id), c]));
  const cvMap = new Map(cafeVisits.map((c) => [String(c._id), c]));
  const activeByCafe = activeVisits.reduce<Record<string, number>>((a, v) => {
    const k = String((v.cafe as unknown as { _id: Types.ObjectId })._id);
    a[k] = (a[k] ?? 0) + 1;
    return a;
  }, {});

  const alerts: { level: "warning" | "danger" | "info"; message: string }[] = [];
  if (pendingOld > 0) alerts.push({ level: "danger", message: `${pendingOld} order(s) pending for more than 15 minutes` });
  if (longSessions > 0) alerts.push({ level: "warning", message: `${longSessions} visit session(s) active for over 8 hours — possible missed check-out` });
  if (unavailableItems > 0) alerts.push({ level: "info", message: `${unavailableItems} menu item(s) currently marked unavailable` });
  const inactive = cafes.filter((c) => c.status !== "ACTIVE");
  if (inactive.length) alerts.push({ level: "warning", message: `${inactive.length} assigned cafe(s) not active: ${inactive.map((c) => c.name).join(", ")}` });

  return {
    kpis: {
      cafes: cafes.length,
      orders: Object.values(statusMap).reduce((a: number, b) => a + (b as number), 0),
      pendingOrders: statusMap.PENDING ?? 0,
      inProgress: (statusMap.ACCEPTED ?? 0) + (statusMap.PREPARING ?? 0) + (statusMap.READY ?? 0),
      completed: statusMap.COMPLETED ?? 0,
      cancelled: statusMap.CANCELLED ?? 0,
      salesPoints: salesAgg[0]?.total ?? 0,
      visits: visitsCount,
      activeVisits: activeVisits.length,
      hoursUsed: Math.round(((hoursUsed[0]?.total ?? 0) / 60) * 10) / 10,
      staff: staffCount,
      unavailableItems,
    },
    cafes: cafes.map((c) => ({
      _id: String(c._id),
      name: c.name,
      code: c.code,
      status: c.status,
      city: c.address?.city,
      manager: (c.manager as unknown as { name?: string })?.name,
      franchise: (c.franchise as unknown as { name?: string })?.name,
      orders: coMap.get(String(c._id))?.orders ?? 0,
      salesPoints: coMap.get(String(c._id))?.points ?? 0,
      visits: cvMap.get(String(c._id))?.visits ?? 0,
      hoursUsed: Math.round(((cvMap.get(String(c._id))?.minutes ?? 0) / 60) * 10) / 10,
      activeVisits: activeByCafe[String(c._id)] ?? 0,
    })),
    trend: trend.map((t) => ({ date: t._id, orders: t.orders, points: t.points })),
    visitTrend: visitTrend.map((t) => ({ date: t._id, visits: t.visits, hours: Math.round((t.minutes / 60) * 10) / 10 })),
    recentOrders,
    activeVisits,
    staffActivity,
    alerts,
  };
}

