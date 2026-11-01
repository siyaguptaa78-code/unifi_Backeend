import { Router } from "express";
import { authenticate, requireAuth, requireRole } from "@/middleware/auth";
import { Errors } from "@/lib/errors";
import { User, Cafe, Order, OrderItem, VisitSession, Membership, CustomerProfile, MenuItem, MenuCategory, Staff, Franchise, FranchisePackage, Payment, PointsLedger, SystemSetting, AuditLog } from "@/models";
import { registerCustomer, authenticate as authenticateUser, hashPassword } from "@/services/auth.service";
import { placeOrder, updateOrderStatus, cancelOrder } from "@/services/order.service";
import { processScan } from "@/services/visit.service";
import { assignCard, normalizeUid } from "@/services/card.service";
import { getCafeMenu } from "@/services/menu.service";
import { createMembershipPaymentOrder, verifyRazorpayCheckout, completeDemoPayment } from "@/services/payment.service";
import { getMembershipOverview } from "@/services/membership.service";
import { signSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/jwt";
import { registerSchema, placeOrderSchema, scanSchema, cardAssignSchema, cafeSchema } from "@/lib/validators";

export const apiRouter = Router();

apiRouter.use(authenticate);

/* ==================== 1. HEALTH CHECK ==================== */
apiRouter.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "unicafe-backend",
    version: "1.0.0",
    uptimeSeconds: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

/* ==================== 2. AUTHENTICATION ==================== */
apiRouter.post("/auth/register", async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const user = await registerCustomer(input);
    const token = await signSession({
      sub: user.id,
      role: user.role,
      tv: user.tokenVersion ?? 0,
      name: user.name,
    });
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
    res.status(201).json({ success: true, data: { user, token } });
  } catch (e) {
    next(e);
  }
});

apiRouter.post("/auth/login", async (req, res, next) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) throw Errors.badRequest("Identifier and password are required");
    const user = await authenticateUser(identifier, password);
    const token = await signSession({
      sub: user.id,
      role: user.role,
      tv: user.tokenVersion ?? 0,
      name: user.name,
    });
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
    res.json({ success: true, data: { user, token } });
  } catch (e) {
    next(e);
  }
});

apiRouter.post("/auth/logout", (req, res) => {
  res.clearCookie(SESSION_COOKIE);
  res.clearCookie("unicafe_session");
  res.json({ success: true, message: "Logged out successfully" });
});

apiRouter.get("/auth/me", requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user!.id).select("-passwordHash").lean();
    if (!user) throw Errors.notFound("User");
    let membership = null;
    if (user.role === "CUSTOMER") {
      membership = await Membership.findOne({ customer: user._id }).lean();
    }
    res.json({ success: true, data: { user: { ...user, membership } } });
  } catch (e) {
    next(e);
  }
});

/* ==================== 3. CAFES ==================== */
apiRouter.get("/cafes", async (req, res, next) => {
  try {
    const cafes = await Cafe.find({ status: { $ne: "INACTIVE" } }).sort({ name: 1 }).lean();
    res.json({ success: true, data: cafes });
  } catch (e) {
    next(e);
  }
});

apiRouter.get("/cafes/:id", async (req, res, next) => {
  try {
    const cafe = await Cafe.findById(String(req.params.id)).lean();
    if (!cafe) throw Errors.notFound("Cafe");
    res.json({ success: true, data: cafe });
  } catch (e) {
    next(e);
  }
});

/* ==================== 4. MENU ==================== */
apiRouter.get("/menu/cafe/:cafeId", async (req, res, next) => {
  try {
    const menu = await getCafeMenu(String(req.params.cafeId));
    res.json({ success: true, data: menu });
  } catch (e) {
    next(e);
  }
});

apiRouter.get("/menu/categories", async (req, res, next) => {
  try {
    const categories = await MenuCategory.find({ active: true }).sort({ sortOrder: 1 }).lean();
    res.json({ success: true, data: categories });
  } catch (e) {
    next(e);
  }
});

/* ==================== 5. CUSTOMER DASHBOARD & ORDERS ==================== */
apiRouter.get("/customer/membership", requireAuth, async (req, res, next) => {
  try {
    const data = await getMembershipOverview(req.user!.id);
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

apiRouter.get("/customer/orders", requireAuth, async (req, res, next) => {
  try {
    const orders = await Order.find({ customer: req.user!.id })
      .sort({ createdAt: -1 })
      .populate("cafe", "name code address openingHours acceptsPreOrders estimatedPrepMinutes")
      .lean();

    const orderIds = orders.map((o) => o._id);
    const items = await OrderItem.find({ order: { $in: orderIds } }).lean();
    const itemMap = new Map<string, any[]>();
    for (const it of items) {
      const k = String(it.order);
      if (!itemMap.has(k)) itemMap.set(k, []);
      itemMap.get(k)!.push(it);
    }

    const rows = orders.map((o) => ({
      ...o,
      items: itemMap.get(String(o._id)) || [],
    }));

    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
});

apiRouter.post("/customer/orders", requireAuth, async (req, res, next) => {
  try {
    const input = placeOrderSchema.parse(req.body);
    const result = await placeOrder(req.user!, input);
    res.status(result.duplicate ? 200 : 201).json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
});

apiRouter.delete("/customer/orders/:id", requireAuth, async (req, res, next) => {
  try {
    const reason = req.body?.reason || "Cancelled by customer";
    const result = await cancelOrder(req.user!, String(req.params.id), reason);
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
});

/* ==================== 6. OPERATIONS / STAFF ORDERS ==================== */
apiRouter.get("/orders", requireRole("SUPER_ADMIN", "SUPERVISOR", "FRANCHISE_OWNER", "MANAGER", "STAFF"), async (req, res, next) => {
  try {
    const cafeId = req.query.cafeId as string;
    const match: Record<string, any> = {};
    if (cafeId) match.cafe = cafeId;

    const orders = await Order.find(match)
      .sort({ createdAt: -1 })
      .limit(100)
      .populate("cafe", "name code openingHours acceptsPreOrders estimatedPrepMinutes")
      .populate("customer", "name email mobile")
      .lean();

    const orderIds = orders.map((o) => o._id);
    const customerIds = orders.map((o) => (o.customer as any)?._id || o.customer);

    const [items, activeSessions] = await Promise.all([
      OrderItem.find({ order: { $in: orderIds } }).lean(),
      VisitSession.find({ customer: { $in: customerIds }, status: "ACTIVE" }).select("customer cafe").lean(),
    ]);

    const activeMap = new Map<string, string>();
    for (const s of activeSessions) activeMap.set(String(s.customer), String(s.cafe));

    const itemMap = new Map<string, any[]>();
    for (const it of items) {
      const k = String(it.order);
      if (!itemMap.has(k)) itemMap.set(k, []);
      itemMap.get(k)!.push(it);
    }

    const rows = orders.map((o) => {
      const custId = String((o.customer as any)?._id || o.customer);
      const cafeIdStr = String((o.cafe as any)?._id || o.cafe);
      return {
        ...o,
        items: itemMap.get(String(o._id)) || [],
        customerPresent: activeMap.get(custId) === cafeIdStr,
      };
    });

    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
});

apiRouter.patch("/orders/:id", requireRole("SUPER_ADMIN", "SUPERVISOR", "FRANCHISE_OWNER", "MANAGER", "STAFF"), async (req, res, next) => {
  try {
    const { status, reason } = req.body;
    const result = await updateOrderStatus(req.user!, String(req.params.id), status, reason);
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
});

apiRouter.post("/orders/:id/refund", requireRole("SUPER_ADMIN", "SUPERVISOR", "FRANCHISE_OWNER", "MANAGER", "STAFF"), async (req, res, next) => {
  try {
    const reason = req.body?.reason || "Staff administrative cancellation";
    const result = await cancelOrder(req.user!, String(req.params.id), reason);
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
});

/* ==================== 7. NFC/RFID VISITS & HARDWARE SIMULATOR ==================== */
apiRouter.post("/visits/scan", requireRole("SUPER_ADMIN", "SUPERVISOR", "MANAGER", "STAFF"), async (req, res, next) => {
  try {
    const input = scanSchema.parse(req.body);
    const result = await processScan(req.user!, input, req.ip || "127.0.0.1");
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
});

/* ==================== 8. PAYMENTS & RECHARGES ==================== */
apiRouter.post("/payments/create-order", requireAuth, async (req, res, next) => {
  try {
    const result = await createMembershipPaymentOrder(req.user!);
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
});

apiRouter.post("/payments/demo-complete", requireAuth, async (req, res, next) => {
  try {
    const { paymentId, outcome } = req.body;
    const result = await completeDemoPayment(req.user!, paymentId, outcome || "SUCCESS");
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
});

apiRouter.post("/payments/verify", requireAuth, async (req, res, next) => {
  try {
    const result = await verifyRazorpayCheckout(req.user!, req.body);
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
});
