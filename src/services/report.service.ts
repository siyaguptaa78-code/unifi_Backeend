import { Types, type PipelineStage } from "mongoose";
import { User } from "@/models/User";
import { Membership } from "@/models/Membership";
import { MembershipTransaction } from "@/models/MembershipTransaction";
import { Payment } from "@/models/Payment";
import { PointsLedger } from "@/models/PointsLedger";
import { VisitSession } from "@/models/VisitSession";
import { Order } from "@/models/Order";
import { Cafe } from "@/models/Cafe";
import { Franchise } from "@/models/Franchise";
import { AuditLog } from "@/models/AuditLog";
import { cafeFilter, getCafeScope } from "@/services/scope.service";
import { escapeRegex } from "@/lib/query";
import { Errors } from "@/lib/errors";
import type { AuthUser } from "@/lib/auth/session";
import type { Role } from "@/lib/rbac";

export type ReportFilters = { from?: string; to?: string; cafeId?: string; franchiseId?: string; status?: string; q?: string };
export type Column = { key: string; label: string; type?: "date" | "datetime" | "number" | "inr" | "points" | "minutes" | "status" | "text" };
export type ReportResult = { rows: Record<string, unknown>[]; total: number; summary?: Record<string, number | string> };

type ReportDef = {
  title: string;
  description: string;
  roles: Role[];
  columns: Column[];
  filters: ("date" | "cafe" | "status" | "q" | "franchise")[];
  statuses?: string[];
  run: (user: AuthUser, f: ReportFilters, skip: number, limit: number) => Promise<ReportResult>;
};

const ADMIN: Role[] = ["SUPER_ADMIN"];
const OPS: Role[] = ["SUPER_ADMIN", "SUPERVISOR", "FRANCHISE_OWNER", "MANAGER"];

function range(f: ReportFilters, field = "createdAt") {
  const r: Record<string, Date> = {};
  if (f.from && !isNaN(Date.parse(f.from))) r.$gte = new Date(f.from);
  if (f.to && !isNaN(Date.parse(f.to))) {
    const d = new Date(f.to);
    if (/^\d{4}-\d{2}-\d{2}$/.test(f.to)) d.setHours(23, 59, 59, 999);
    r.$lte = d;
  }
  return Object.keys(r).length ? { [field]: r } : {};
}

async function paged<T>(pipeline: PipelineStage[], model: { aggregate: (p: PipelineStage[]) => { exec: () => Promise<T[]> } }, skip: number, limit: number) {
  const [res] = (await model
    .aggregate([...pipeline, { $facet: { rows: [{ $skip: skip }, { $limit: limit }], count: [{ $count: "n" }] } }])
    .exec()) as unknown as [{ rows: Record<string, unknown>[]; count: { n: number }[] }];
  return { rows: res.rows, total: res.count[0]?.n ?? 0 };
}

const lookupUser = (local: string, as: string): PipelineStage[] => [
  { $lookup: { from: "users", localField: local, foreignField: "_id", as, pipeline: [{ $project: { name: 1, email: 1, mobile: 1 } }] } },
  { $unwind: { path: `$${as}`, preserveNullAndEmptyArrays: true } },
];
const lookupCafe = (local: string, as: string): PipelineStage[] => [
  { $lookup: { from: "cafes", localField: local, foreignField: "_id", as, pipeline: [{ $project: { name: 1, code: 1 } }] } },
  { $unwind: { path: `$${as}`, preserveNullAndEmptyArrays: true } },
];

async function franchiseCafeFilter(user: AuthUser, f: ReportFilters) {
  const base = await cafeFilter(user, f.cafeId || null);
  if (f.franchiseId && Types.ObjectId.isValid(f.franchiseId)) {
    const ids = (await Cafe.find({ franchise: f.franchiseId }).select("_id").lean()).map((c) => c._id);
    const scope = await getCafeScope(user);
    const allowed = scope ? ids.filter((i) => scope.some((s) => String(s) === String(i))) : ids;
    return { $and: [base, { cafe: { $in: allowed } }] };
  }
  return base;
}

export const REPORTS: Record<string, ReportDef> = {
  customers: {
    title: "Customer report",
    description: "Registered customers with membership balances",
    roles: ADMIN,
    filters: ["date", "q", "status"],
    statuses: ["ACTIVE", "INACTIVE", "SUSPENDED"],
    columns: [
      { key: "customerCode", label: "Code" },
      { key: "name", label: "Name" },
      { key: "email", label: "Email" },
      { key: "mobile", label: "Mobile" },
      { key: "membershipStatus", label: "Membership", type: "status" },
      { key: "pointsBalance", label: "Points", type: "points" },
      { key: "remainingMinutes", label: "Hours left", type: "minutes" },
      { key: "rechargeCount", label: "Recharges", type: "number" },
      { key: "createdAt", label: "Joined", type: "date" },
    ],
    run: async (_u, f, skip, limit) => {
      const match: Record<string, unknown> = { role: "CUSTOMER", ...range(f) };
      if (f.q) match.$or = [{ name: { $regex: escapeRegex(f.q), $options: "i" } }, { email: { $regex: escapeRegex(f.q), $options: "i" } }, { mobile: { $regex: escapeRegex(f.q) } }];
      const pipeline: PipelineStage[] = [
        { $match: match },
        { $lookup: { from: "memberships", localField: "_id", foreignField: "customer", as: "m" } },
        { $unwind: { path: "$m", preserveNullAndEmptyArrays: true } },
        { $lookup: { from: "customerprofiles", localField: "_id", foreignField: "user", as: "p" } },
        { $unwind: { path: "$p", preserveNullAndEmptyArrays: true } },
        ...(f.status ? [{ $match: { "m.status": f.status } }] : []),
        { $sort: { createdAt: -1 } },
        {
          $project: {
            customerCode: "$p.customerCode",
            name: 1,
            email: 1,
            mobile: 1,
            membershipStatus: "$m.status",
            pointsBalance: "$m.pointsBalance",
            remainingMinutes: "$m.remainingMinutes",
            rechargeCount: "$m.rechargeCount",
            createdAt: 1,
          },
        },
      ];
      return paged(pipeline, User, skip, limit);
    },
  },
  memberships: {
    title: "Membership report",
    description: "Membership status, points and hours per customer",
    roles: ADMIN,
    filters: ["status", "q"],
    statuses: ["ACTIVE", "INACTIVE", "SUSPENDED"],
    columns: [
      { key: "customer.name", label: "Customer" },
      { key: "customer.email", label: "Email" },
      { key: "status", label: "Status", type: "status" },
      { key: "pointsBalance", label: "Points balance", type: "points" },
      { key: "totalPointsCredited", label: "Credited", type: "points" },
      { key: "totalPointsSpent", label: "Spent", type: "points" },
      { key: "remainingMinutes", label: "Hours left", type: "minutes" },
      { key: "rechargeCount", label: "Recharges", type: "number" },
      { key: "lastRechargeAt", label: "Last recharge", type: "datetime" },
    ],
    run: async (_u, f, skip, limit) => {
      const pipeline: PipelineStage[] = [
        { $match: f.status ? { status: f.status } : {} },
        ...lookupUser("customer", "customer"),
        ...(f.q ? [{ $match: { $or: [{ "customer.name": { $regex: escapeRegex(f.q), $options: "i" } }, { "customer.email": { $regex: escapeRegex(f.q), $options: "i" } }] } }] : []),
        { $sort: { updatedAt: -1 } },
      ];
      const res = await paged(pipeline, Membership, skip, limit);
      const [s] = await Membership.aggregate([
        { $group: { _id: null, active: { $sum: { $cond: [{ $eq: ["$status", "ACTIVE"] }, 1, 0] } }, points: { $sum: "$pointsBalance" }, minutes: { $sum: "$remainingMinutes" } } },
      ]);
      return { ...res, summary: { "Active memberships": s?.active ?? 0, "Outstanding points": s?.points ?? 0, "Outstanding hours": Math.round((s?.minutes ?? 0) / 60) } };
    },
  },
  recharges: {
    title: "Recharge report",
    description: "Membership purchases and recharges",
    roles: ADMIN,
    filters: ["date", "status"],
    statuses: ["PURCHASE", "RECHARGE"],
    columns: [
      { key: "createdAt", label: "Date", type: "datetime" },
      { key: "reference", label: "Reference" },
      { key: "customer.name", label: "Customer" },
      { key: "type", label: "Type", type: "status" },
      { key: "amount", label: "Amount", type: "inr" },
      { key: "pointsCredited", label: "Points", type: "points" },
      { key: "pointsAfter", label: "Balance after", type: "points" },
      { key: "minutesAfter", label: "Hours set", type: "minutes" },
      { key: "isDemo", label: "Demo" },
    ],
    run: async (_u, f, skip, limit) => {
      const match = { type: f.status ? f.status : { $in: ["PURCHASE", "RECHARGE"] }, ...range(f) };
      const res = await paged([{ $match: match }, { $sort: { createdAt: -1 } }, ...lookupUser("customer", "customer")], MembershipTransaction, skip, limit);
      const [s] = await MembershipTransaction.aggregate([{ $match: match }, { $group: { _id: null, amount: { $sum: "$amount" }, n: { $sum: 1 } } }]);
      return { ...res, summary: { Recharges: s?.n ?? 0, "Total amount (₹)": s?.amount ?? 0 } };
    },
  },
  payments: {
    title: "Payment report",
    description: "All payment transactions (DEMO payments flagged)",
    roles: ADMIN,
    filters: ["date", "status", "q"],
    statuses: ["CREATED", "PENDING", "SUCCESS", "FAILED", "REFUNDED"],
    columns: [
      { key: "createdAt", label: "Date", type: "datetime" },
      { key: "receipt", label: "Receipt" },
      { key: "customer.name", label: "Customer" },
      { key: "purpose", label: "Purpose", type: "status" },
      { key: "provider", label: "Provider" },
      { key: "amount", label: "Amount", type: "inr" },
      { key: "status", label: "Status", type: "status" },
      { key: "providerPaymentId", label: "Gateway ref" },
      { key: "isDemo", label: "Demo" },
    ],
    run: async (_u, f, skip, limit) => {
      const match: Record<string, unknown> = { ...range(f), ...(f.status ? { status: f.status } : {}) };
      if (f.q) match.receipt = { $regex: escapeRegex(f.q), $options: "i" };
      const res = await paged([{ $match: match }, { $sort: { createdAt: -1 } }, ...lookupUser("customer", "customer"), { $project: { signature: 0, events: 0 } }], Payment, skip, limit);
      const s = await Payment.aggregate([{ $match: match }, { $group: { _id: "$status", amount: { $sum: "$amount" }, n: { $sum: 1 } } }]);
      return { ...res, summary: Object.fromEntries(s.map((x) => [`${x._id} (₹)`, x.amount])) };
    },
  },
  "points-ledger": {
    title: "Points ledger report",
    description: "Every points credit, debit, refund and adjustment",
    roles: ADMIN,
    filters: ["date", "status", "q", "cafe"],
    statuses: ["CREDIT", "DEBIT", "REFUND", "ADJUSTMENT"],
    columns: [
      { key: "createdAt", label: "Date", type: "datetime" },
      { key: "reference", label: "Reference" },
      { key: "customer.name", label: "Customer" },
      { key: "type", label: "Type", type: "status" },
      { key: "source", label: "Source" },
      { key: "points", label: "Points", type: "number" },
      { key: "balanceAfter", label: "Balance after", type: "points" },
      { key: "description", label: "Description" },
    ],
    run: async (u, f, skip, limit) => {
      const match: Record<string, unknown> = { ...range(f), ...(f.status ? { type: f.status } : {}), ...(f.cafeId ? await cafeFilter(u, f.cafeId) : {}) };
      if (f.q) match.reference = { $regex: escapeRegex(f.q), $options: "i" };
      const res = await paged([{ $match: match }, { $sort: { createdAt: -1 } }, ...lookupUser("customer", "customer")], PointsLedger, skip, limit);
      const s = await PointsLedger.aggregate([{ $match: match }, { $group: { _id: "$type", pts: { $sum: "$points" } } }]);
      return { ...res, summary: Object.fromEntries(s.map((x) => [x._id, x.pts])) };
    },
  },
  "membership-hours": {
    title: "Membership hours report",
    description: "Hours consumed per customer from completed visits",
    roles: OPS,
    filters: ["date", "cafe"],
    columns: [
      { key: "customer.name", label: "Customer" },
      { key: "customer.mobile", label: "Mobile" },
      { key: "visits", label: "Visits", type: "number" },
      { key: "minutes", label: "Hours used", type: "minutes" },
      { key: "remainingMinutes", label: "Hours left", type: "minutes" },
      { key: "lastVisit", label: "Last visit", type: "datetime" },
    ],
    run: async (u, f, skip, limit) => {
      const match = { ...range(f, "entryAt"), ...(await cafeFilter(u, f.cafeId || null)) };
      const pipeline: PipelineStage[] = [
        { $match: match },
        { $group: { _id: "$customer", visits: { $sum: 1 }, minutes: { $sum: "$minutesConsumed" }, lastVisit: { $max: "$entryAt" } } },
        { $sort: { minutes: -1 } },
        ...lookupUser("_id", "customer"),
        { $lookup: { from: "memberships", localField: "_id", foreignField: "customer", as: "m" } },
        { $addFields: { remainingMinutes: { $first: "$m.remainingMinutes" } } },
        { $project: { m: 0 } },
      ];
      const res = await paged(pipeline, VisitSession, skip, limit);
      const [s] = await VisitSession.aggregate([{ $match: match }, { $group: { _id: null, minutes: { $sum: "$minutesConsumed" }, n: { $sum: 1 } } }]);
      return { ...res, summary: { Visits: s?.n ?? 0, "Total hours used": Math.round(((s?.minutes ?? 0) / 60) * 10) / 10 } };
    },
  },
  visits: {
    title: "Cafe entry/exit report",
    description: "Check-in and check-out records",
    roles: OPS,
    filters: ["date", "cafe", "status"],
    statuses: ["ACTIVE", "COMPLETED", "CORRECTED"],
    columns: [
      { key: "entryAt", label: "Entry", type: "datetime" },
      { key: "exitAt", label: "Exit", type: "datetime" },
      { key: "customer.name", label: "Customer" },
      { key: "cafe.name", label: "Cafe" },
      { key: "status", label: "Status", type: "status" },
      { key: "minutesConsumed", label: "Duration", type: "minutes" },
      { key: "minutesAfter", label: "Hours left after", type: "minutes" },
      { key: "entryDevice", label: "Device" },
    ],
    run: async (u, f, skip, limit) => {
      const match = { ...range(f, "entryAt"), ...(f.status ? { status: f.status } : {}), ...(await cafeFilter(u, f.cafeId || null)) };
      return paged([{ $match: match }, { $sort: { entryAt: -1 } }, ...lookupUser("customer", "customer"), ...lookupCafe("cafe", "cafe")], VisitSession, skip, limit);
    },
  },
  orders: {
    title: "Order report",
    description: "All orders with status and points",
    roles: OPS,
    filters: ["date", "cafe", "status", "q"],
    statuses: ["PENDING", "ACCEPTED", "PREPARING", "READY", "COMPLETED", "CANCELLED", "REFUNDED"],
    columns: [
      { key: "createdAt", label: "Date", type: "datetime" },
      { key: "orderNumber", label: "Order #" },
      { key: "customer.name", label: "Customer" },
      { key: "cafe.name", label: "Cafe" },
      { key: "orderType", label: "Type", type: "status" },
      { key: "itemCount", label: "Items", type: "number" },
      { key: "totalPoints", label: "Points", type: "points" },
      { key: "status", label: "Status", type: "status" },
    ],
    run: async (u, f, skip, limit) => {
      const match: Record<string, unknown> = { ...range(f), ...(f.status ? { status: f.status } : {}), ...(await cafeFilter(u, f.cafeId || null)) };
      if (f.q) match.orderNumber = { $regex: escapeRegex(f.q), $options: "i" };
      const res = await paged([{ $match: match }, { $sort: { createdAt: -1 } }, ...lookupUser("customer", "customer"), ...lookupCafe("cafe", "cafe")], Order, skip, limit);
      const [s] = await Order.aggregate([{ $match: match }, { $group: { _id: null, n: { $sum: 1 }, pts: { $sum: "$totalPoints" } } }]);
      return { ...res, summary: { Orders: s?.n ?? 0, "Total points": s?.pts ?? 0 } };
    },
  },
  "cancelled-orders": {
    title: "Cancelled order report",
    description: "Cancelled orders and cancellation reasons",
    roles: OPS,
    filters: ["date", "cafe"],
    columns: [
      { key: "createdAt", label: "Date", type: "datetime" },
      { key: "orderNumber", label: "Order #" },
      { key: "customer.name", label: "Customer" },
      { key: "cafe.name", label: "Cafe" },
      { key: "totalPoints", label: "Points", type: "points" },
      { key: "cancelReason", label: "Reason" },
      { key: "refundStatus", label: "Refund", type: "status" },
    ],
    run: async (u, f, skip, limit) => {
      const match = { ...range(f), status: "CANCELLED", ...(await cafeFilter(u, f.cafeId || null)) };
      return paged([{ $match: match }, { $sort: { createdAt: -1 } }, ...lookupUser("customer", "customer"), ...lookupCafe("cafe", "cafe")], Order, skip, limit);
    },
  },
  refunds: {
    title: "Refund report",
    description: "Points refunds linked to original orders",
    roles: OPS,
    filters: ["date", "cafe"],
    columns: [
      { key: "createdAt", label: "Date", type: "datetime" },
      { key: "reference", label: "Refund ref" },
      { key: "order.orderNumber", label: "Original order" },
      { key: "customer.name", label: "Customer" },
      { key: "cafe.name", label: "Cafe" },
      { key: "points", label: "Points refunded", type: "points" },
      { key: "description", label: "Description" },
    ],
    run: async (u, f, skip, limit) => {
      const match = { ...range(f), type: "REFUND", ...(await cafeFilter(u, f.cafeId || null)) };
      const res = await paged(
        [
          { $match: match },
          { $sort: { createdAt: -1 } },
          ...lookupUser("customer", "customer"),
          ...lookupCafe("cafe", "cafe"),
          { $lookup: { from: "orders", localField: "refId", foreignField: "_id", as: "order", pipeline: [{ $project: { orderNumber: 1 } }] } },
          { $unwind: { path: "$order", preserveNullAndEmptyArrays: true } },
        ],
        PointsLedger,
        skip,
        limit
      );
      const [s] = await PointsLedger.aggregate([{ $match: match }, { $group: { _id: null, pts: { $sum: "$points" }, n: { $sum: 1 } } }]);
      return { ...res, summary: { Refunds: s?.n ?? 0, "Points refunded": s?.pts ?? 0 } };
    },
  },
  "cafe-sales": {
    title: "Cafe sales report",
    description: "Points sales per cafe (excludes cancelled/refunded)",
    roles: OPS,
    filters: ["date", "cafe", "franchise"],
    columns: [
      { key: "cafe.code", label: "Code" },
      { key: "cafe.name", label: "Cafe" },
      { key: "orders", label: "Orders", type: "number" },
      { key: "items", label: "Items sold", type: "number" },
      { key: "points", label: "Sales (points)", type: "points" },
      { key: "avgOrder", label: "Avg order", type: "points" },
    ],
    run: async (u, f, skip, limit) => {
      const match = { ...range(f), status: { $nin: ["CANCELLED", "REFUNDED"] }, ...(await franchiseCafeFilter(u, f)) };
      const res = await paged(
        [
          { $match: match },
          { $group: { _id: "$cafe", orders: { $sum: 1 }, items: { $sum: "$itemCount" }, points: { $sum: "$totalPoints" } } },
          { $addFields: { avgOrder: { $round: [{ $divide: ["$points", "$orders"] }, 0] } } },
          { $sort: { points: -1 } },
          ...lookupCafe("_id", "cafe"),
        ],
        Order,
        skip,
        limit
      );
      const [s] = await Order.aggregate([{ $match: match }, { $group: { _id: null, pts: { $sum: "$totalPoints" }, n: { $sum: 1 } } }]);
      return { ...res, summary: { Orders: s?.n ?? 0, "Total sales (points)": s?.pts ?? 0 } };
    },
  },
  "franchise-performance": {
    title: "Franchise performance report",
    description: "Franchise payment status and cafe performance",
    roles: ["SUPER_ADMIN", "SUPERVISOR", "FRANCHISE_OWNER"],
    filters: ["date", "status"],
    statuses: ["PENDING_APPROVAL", "APPROVED", "ACTIVE", "SUSPENDED", "REJECTED", "TERMINATED"],
    columns: [
      { key: "code", label: "Code" },
      { key: "name", label: "Franchise" },
      { key: "owner.name", label: "Owner" },
      { key: "status", label: "Status", type: "status" },
      { key: "paymentStatus", label: "Payment", type: "status" },
      { key: "agreedAmount", label: "Agreed", type: "inr" },
      { key: "amountPaid", label: "Paid", type: "inr" },
      { key: "cafeCount", label: "Cafes", type: "number" },
      { key: "orders", label: "Orders", type: "number" },
      { key: "salesPoints", label: "Sales (points)", type: "points" },
      { key: "visits", label: "Visits", type: "number" },
    ],
    run: async (u, f, skip, limit) => {
      const match: Record<string, unknown> = f.status ? { status: f.status } : {};
      if (u.role === "FRANCHISE_OWNER") match.owner = new Types.ObjectId(u.id);
      if (u.role === "SUPERVISOR") {
        const scope = (await getCafeScope(u)) ?? [];
        const fids = await Cafe.distinct("franchise", { _id: { $in: scope }, franchise: { $ne: null } });
        match.$or = [{ supervisor: new Types.ObjectId(u.id) }, { _id: { $in: fids } }];
      }
      const orderRange = range(f);
      const visitRange = range(f, "entryAt");
      const pipeline: PipelineStage[] = [
        { $match: match },
        { $sort: { createdAt: -1 } },
        ...lookupUser("owner", "owner"),
        { $lookup: { from: "cafes", localField: "_id", foreignField: "franchise", as: "cafes", pipeline: [{ $project: { _id: 1 } }] } },
        {
          $lookup: {
            from: "orders",
            let: { ids: "$cafes._id" },
            pipeline: [
              { $match: { $expr: { $in: ["$cafe", "$$ids"] }, status: { $nin: ["CANCELLED", "REFUNDED"] }, ...orderRange } },
              { $group: { _id: null, n: { $sum: 1 }, pts: { $sum: "$totalPoints" } } },
            ],
            as: "o",
          },
        },
        {
          $lookup: {
            from: "visitsessions",
            let: { ids: "$cafes._id" },
            pipeline: [{ $match: { $expr: { $in: ["$cafe", "$$ids"] }, ...visitRange } }, { $count: "n" }],
            as: "v",
          },
        },
        {
          $addFields: {
            cafeCount: { $size: "$cafes" },
            orders: { $ifNull: [{ $first: "$o.n" }, 0] },
            salesPoints: { $ifNull: [{ $first: "$o.pts" }, 0] },
            visits: { $ifNull: [{ $first: "$v.n" }, 0] },
          },
        },
        { $project: { cafes: 0, o: 0, v: 0 } },
      ];
      return paged(pipeline, Franchise, skip, limit);
    },
  },
  "staff-activity": {
    title: "Staff activity report",
    description: "Operational actions performed by cafe staff and managers",
    roles: OPS,
    filters: ["date", "cafe", "q"],
    columns: [
      { key: "createdAt", label: "Date", type: "datetime" },
      { key: "actorName", label: "Staff" },
      { key: "actorRole", label: "Role", type: "status" },
      { key: "action", label: "Action", type: "status" },
      { key: "entity", label: "Entity" },
      { key: "cafe.name", label: "Cafe" },
    ],
    run: async (u, f, skip, limit) => {
      const match: Record<string, unknown> = { ...range(f), actorRole: { $in: ["STAFF", "MANAGER"] }, ...(await cafeFilter(u, f.cafeId || null)) };
      if (f.q) match.actorName = { $regex: escapeRegex(f.q), $options: "i" };
      const res = await paged([{ $match: match }, { $sort: { createdAt: -1 } }, ...lookupCafe("cafe", "cafe")], AuditLog, skip, limit);
      const top = await AuditLog.aggregate([{ $match: match }, { $group: { _id: "$actorName", n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 3 }]);
      return { ...res, summary: Object.fromEntries(top.map((t) => [String(t._id), t.n])) };
    },
  },
};

export function listReports(role: Role) {
  return Object.entries(REPORTS)
    .filter(([, r]) => r.roles.includes(role))
    .map(([key, r]) => ({ key, title: r.title, description: r.description, columns: r.columns, filters: r.filters, statuses: r.statuses ?? [] }));
}

export async function runReport(user: AuthUser, key: string, f: ReportFilters, page: number, limit: number) {
  const def = REPORTS[key];
  if (!def) throw Errors.notFound("Report");
  if (!def.roles.includes(user.role)) throw Errors.forbidden("You do not have access to this report");
  const res = await def.run(user, f, (page - 1) * limit, limit);
  return { ...res, columns: def.columns, title: def.title };
}

function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}

function csvCell(v: unknown) {
  if (v === null || v === undefined) return "";
  let s = v instanceof Date ? v.toISOString() : String(v);
  // Prevent CSV/formula injection in spreadsheet apps
  if (/^[=+\-@\t\r]/.test(s) && isNaN(Number(s))) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns: Column[], rows: Record<string, unknown>[]) {
  const head = columns.map((c) => csvCell(c.label)).join(",");
  const body = rows.map((r) =>
    columns
      .map((c) => {
        const v = getPath(r, c.key);
        if (c.type === "minutes" && typeof v === "number") return csvCell((v / 60).toFixed(2));
        return csvCell(v);
      })
      .join(",")
  );
  return [head, ...body].join("\n");
}

