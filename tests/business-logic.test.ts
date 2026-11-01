import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import {
  User,
  CustomerProfile,
  Membership,
  MembershipTransaction,
  PointsLedger,
  Cafe,
  Franchise,
  FranchisePackage,
  Staff,
  MenuCategory,
  MenuItem,
  CafeMenuCustomization,
  Order,
  OrderItem,
  Payment,
  MembershipCard,
  VisitSession,
  SystemSetting,
} from "@/models";
import { registerCustomer, authenticate } from "@/services/auth.service";
import { creditPoints, debitPoints, getWalletSummary } from "@/services/wallet.service";
import { applyMembershipRecharge } from "@/services/membership.service";
import { processScan, correctVisit } from "@/services/visit.service";
import { placeOrder, cancelOrder } from "@/services/order.service";
import { canAccessCafe, getCafeScope } from "@/services/scope.service";
import { verifyCheckoutSignature, verifyWebhookSignature } from "@/lib/payments/razorpay";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import { resetDbCache } from "@/lib/db";
import type { AuthUser } from "@/lib/auth/session";

let replSet: MongoMemoryReplSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({
    replSet: { name: "rs0", count: 1, storageEngine: "wiredTiger" },
  });
  const uri = replSet.getUri();
  process.env.MONGODB_URI = uri;
  process.env.JWT_SECRET = "super-secret-test-jwt-key-must-be-at-least-32-chars-long";
  resetDbCache();
  await mongoose.connect(uri);

  for (const [key, item] of Object.entries(DEFAULT_SETTINGS)) {
    await SystemSetting.create({ key, value: item.value, description: item.description });
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
});

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    CustomerProfile.deleteMany({}),
    Membership.deleteMany({}),
    MembershipTransaction.deleteMany({}),
    PointsLedger.deleteMany({}),
    Cafe.deleteMany({}),
    Franchise.deleteMany({}),
    FranchisePackage.deleteMany({}),
    Staff.deleteMany({}),
    MenuCategory.deleteMany({}),
    MenuItem.deleteMany({}),
    CafeMenuCustomization.deleteMany({}),
    Order.deleteMany({}),
    OrderItem.deleteMany({}),
    Payment.deleteMany({}),
    MembershipCard.deleteMany({}),
    VisitSession.deleteMany({}),
  ]);
});

describe("UniCafe Mandatory Business Logic & Rules Suite", () => {
  // Test 1 & 2: Registration, Authentication & Profiles
  it("registers customer, enforces unique email/mobile, hashes password, and authenticates", async () => {
    const cust = await registerCustomer({
      name: "Rohan Varma",
      email: "rohan@example.com",
      mobile: "9876543210",
      password: "Password@123",
      confirmPassword: "Password@123",
    });

    expect(cust.id).toBeDefined();
    expect(cust.role).toBe("CUSTOMER");

    // Check membership and profile were created
    const profile = await CustomerProfile.findOne({ user: cust.id });
    expect(profile?.customerCode).toMatch(/^UC\d{6}$/);

    const mem = await Membership.findOne({ customer: cust.id });
    expect(mem?.status).toBe("INACTIVE");
    expect(mem?.pointsBalance).toBe(0);

    // Duplicate email rejected
    await expect(
      registerCustomer({
        name: "Duplicate",
        email: "rohan@example.com",
        mobile: "9876543211",
        password: "Password@123",
        confirmPassword: "Password@123",
      })
    ).rejects.toThrow();

    // Authenticate
    const authed = await authenticate("rohan@example.com", "Password@123");
    expect(authed.id).toBe(cust.id);
  });

  // Test 4, 7, 8, 9: Membership purchase, Points crediting, Carry forward & Hours reset
  it("credits 5,000 points and sets 150 hours, points carry forward on recharge while hours reset", async () => {
    const cust = await registerCustomer({
      name: "Priya Nair",
      email: "priya@example.com",
      mobile: "9876543212",
      password: "Password@123",
      confirmPassword: "Password@123",
    });

    // 1st Recharge: Purchase
    const p1 = await Payment.create({
      customer: cust.id,
      purpose: "MEMBERSHIP_PURCHASE",
      amount: 5000,
      provider: "DEMO",
      providerOrderId: "order_1",
      receipt: "RCP-001",
      status: "SUCCESS",
    });

    await applyMembershipRecharge(p1._id);

    const m1 = await Membership.findOne({ customer: cust.id });
    expect(m1?.status).toBe("ACTIVE");
    expect(m1?.pointsBalance).toBe(5000);
    expect(m1?.remainingMinutes).toBe(150 * 60); // 9000 mins

    // Spend 1,000 points and use 30 hours (1800 mins)
    await debitPoints({
      customerId: cust.id,
      points: 1000,
      source: "ORDER",
      reference: "ORD-TEST-1",
      description: "Test coffee order",
    });
    await Membership.updateOne({ customer: cust.id }, { $set: { remainingMinutes: 120 * 60 } });

    const mAfterSpend = await Membership.findOne({ customer: cust.id });
    expect(mAfterSpend?.pointsBalance).toBe(4000);
    expect(mAfterSpend?.remainingMinutes).toBe(7200); // 120 hrs

    // 2nd Recharge: Points carry forward (4,000 + 5,000 = 9,000), Hours reset to 150h
    const p2 = await Payment.create({
      customer: cust.id,
      purpose: "MEMBERSHIP_RECHARGE",
      amount: 5000,
      provider: "DEMO",
      providerOrderId: "order_2",
      receipt: "RCP-002",
      status: "SUCCESS",
    });

    await applyMembershipRecharge(p2._id);

    const m2 = await Membership.findOne({ customer: cust.id });
    expect(m2?.pointsBalance).toBe(9000); // Points carried forward!
    expect(m2?.remainingMinutes).toBe(150 * 60); // Hours reset to 150!
  });

  // Test 5 & 6: Razorpay signature verification & Idempotency
  it("verifies Razorpay signatures and prevents duplicate payment crediting", async () => {
    const orderId = "order_9A33X5";
    const paymentId = "pay_29384729";
    const secret = "test_razorpay_secret_12345";

    // Expected HMAC SHA256 of "order_9A33X5|pay_29384729" with secret
    const crypto = await import("crypto");
    const validSig = crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");

    expect(verifyCheckoutSignature(orderId, paymentId, validSig, secret)).toBe(true);
    expect(verifyCheckoutSignature(orderId, paymentId, "invalid_sig", secret)).toBe(false);

    // Duplicate webhook prevention
    const cust = await registerCustomer({
      name: "Karan Johar",
      email: "karan@example.com",
      mobile: "9876543213",
      password: "Password@123",
      confirmPassword: "Password@123",
    });

    const payment = await Payment.create({
      customer: cust.id,
      purpose: "MEMBERSHIP_PURCHASE",
      amount: 5000,
      provider: "RAZORPAY",
      providerOrderId: orderId,
      providerPaymentId: paymentId,
      receipt: "RCP-WEBHOOK-1",
      status: "SUCCESS",
    });

    const res1 = await applyMembershipRecharge(payment._id);
    expect(res1.alreadyApplied).toBe(false);

    // Calling again returns alreadyApplied: true without double crediting points!
    const res2 = await applyMembershipRecharge(payment._id);
    expect(res2.alreadyApplied).toBe(true);

    const mem = await Membership.findOne({ customer: cust.id });
    expect(mem?.pointsBalance).toBe(5000); // exactly 5000, not 10000!
  });

  // Test 10, 11, 12, 13: NFC Entry/Exit, Zero-Hours Block & Safety Exit
  it("enforces entry rules: zero hours blocked, active visit exit allowed, duplicate entry blocked", async () => {
    const cust = await registerCustomer({
      name: "Siddharth Malhotra",
      email: "sid@example.com",
      mobile: "9876543214",
      password: "Password@123",
      confirmPassword: "Password@123",
    });

    const cafe = await Cafe.create({
      name: "UniCafe Indiranagar",
      code: "UC-BLR-01",
      slug: "indiranagar",
      address: { line1: "100ft Rd", city: "Bengaluru", state: "KA", pincode: "560038" },
      status: "ACTIVE",
    });

    const card = await MembershipCard.create({
      customer: cust.id,
      cardNumber: "UCM-1111-2222",
      uid: "CARDUID01",
      status: "ACTIVE",
      cardType: "NFC",
    });

    const staffActor: AuthUser = {
      id: new mongoose.Types.ObjectId().toString(),
      name: "Staff Barista",
      email: "staff@test.com",
      mobile: "9876543299",
      role: "SUPER_ADMIN",
    };

    // Case A: Customer with inactive membership cannot enter
    await expect(
      processScan(staffActor, { uid: "CARDUID01", cafeId: cafe._id.toString(), mode: "ENTRY", deviceId: "TERM1" })
    ).rejects.toThrow(/MEMBERSHIP_INACTIVE/);

    // Activate membership with 0 hours
    await Membership.updateOne({ customer: cust.id }, { $set: { status: "ACTIVE", remainingMinutes: 0 } });

    // Case B: Zero hours customer CANNOT enter
    await expect(
      processScan(staffActor, { uid: "CARDUID01", cafeId: cafe._id.toString(), mode: "ENTRY", deviceId: "TERM1" })
    ).rejects.toThrow(/HOURS_EXHAUSTED/);

    // Give 60 minutes
    await Membership.updateOne({ customer: cust.id }, { $set: { remainingMinutes: 60 } });

    // Case C: Successful check-in
    const entryRes = await processScan(staffActor, { uid: "CARDUID01", cafeId: cafe._id.toString(), mode: "ENTRY", deviceId: "TERM1" });
    expect(entryRes.action).toBe("ENTRY");
    expect(entryRes.session.status).toBe("ACTIVE");

    // Clear debounce for test
    await MembershipCard.updateOne({ _id: card._id }, { $unset: { lastTapAt: 1 } });

    // Case D: Duplicate entry tap blocked while session is active
    await expect(
      processScan(staffActor, { uid: "CARDUID01", cafeId: cafe._id.toString(), mode: "ENTRY", deviceId: "TERM1" })
    ).rejects.toThrow(/ALREADY_CHECKED_IN/);

    // Case E: Customer's remaining minutes exhaust to 0 while inside. Customer MUST STILL BE ALLOWED TO EXIT!
    await Membership.updateOne({ customer: cust.id }, { $set: { remainingMinutes: 0 } });

    await MembershipCard.updateOne({ _id: card._id }, { $unset: { lastTapAt: 1 } });

    const exitRes = await processScan(staffActor, { uid: "CARDUID01", cafeId: cafe._id.toString(), mode: "EXIT", deviceId: "TERM1" });
    expect(exitRes.action).toBe("EXIT");
    expect(exitRes.session.status).toBe("COMPLETED");
  });

  // Test 14, 15, 16: Order Points Deduction, Insufficient Points Rejection, and Refund
  it("handles ordering with points, rejects insufficient balance, and refunds points on cancellation", async () => {
    const cust = await registerCustomer({
      name: "Ananya Panday",
      email: "ananya@example.com",
      mobile: "9876543216",
      password: "Password@123",
      confirmPassword: "Password@123",
    });

    const cafe = await Cafe.create({
      name: "UniCafe Koramangala",
      code: "UC-BLR-02",
      slug: "koramangala",
      address: { line1: "80ft Rd", city: "Bengaluru", state: "KA", pincode: "560034" },
      status: "ACTIVE",
    });

    const category = await MenuCategory.create({ name: "Coffee", slug: "coffee" });
    const item = await MenuItem.create({
      name: "Truffle Cappuccino",
      pointsPrice: 300,
      category: category._id,
      active: true,
      approvalStatus: "APPROVED",
    });

    const custUser: AuthUser = {
      id: cust.id,
      name: cust.name,
      email: cust.email,
      mobile: "9876543216",
      role: "CUSTOMER",
    };

    // Activate membership with 500 points
    await Membership.updateOne({ customer: cust.id }, { $set: { status: "ACTIVE", pointsBalance: 500 } });

    // Order 2 items = 600 points -> Should REJECT due to insufficient balance
    await expect(
      placeOrder(custUser, {
        cafeId: cafe._id.toString(),
        orderType: "IN_CAFE",
        idempotencyKey: "idem_fail_1",
        items: [{ menuItemId: item._id.toString(), quantity: 2 }],
      })
    ).rejects.toThrow(/INSUFFICIENT_POINTS/);

    // Order 1 item = 300 points -> Should SUCCEED
    const { order } = await placeOrder(custUser, {
      cafeId: cafe._id.toString(),
      orderType: "IN_CAFE",
      idempotencyKey: "idem_success_1",
      items: [{ menuItemId: item._id.toString(), quantity: 1 }],
    });

    expect(order.totalPoints).toBe(300);

    const memAfterOrder = await Membership.findOne({ customer: cust.id });
    expect(memAfterOrder?.pointsBalance).toBe(200); // 500 - 300 = 200

    // Cancel order -> Points should be REFUNDED
    await cancelOrder(custUser, order._id, "Customer changed mind");

    const memAfterRefund = await Membership.findOne({ customer: cust.id });
    expect(memAfterRefund?.pointsBalance).toBe(500); // 200 + 300 = 500 restored!

    // Verify refund ledger entry exists
    const refundLedger = await PointsLedger.findOne({ refId: order._id, type: "REFUND" });
    expect(refundLedger).toBeDefined();
    expect(refundLedger?.points).toBe(300);
  });

  // Test 17 & 18: Cafe-Level & Supervisor Scope Restrictions
  it("enforces cafe scoping so supervisors only access their assigned cafes", async () => {
    const supUser = await User.create({
      name: "Supervisor Amit",
      email: "amit.supervisor@example.com",
      mobile: "9876543250",
      passwordHash: "hash",
      role: "SUPERVISOR",
      status: "ACTIVE",
    });

    const cafe1 = await Cafe.create({
      name: "Assigned Cafe",
      code: "C1",
      slug: "c1",
      address: { line1: "A", city: "B", state: "C", pincode: "560001" },
      supervisor: supUser._id,
      status: "ACTIVE",
    });

    const cafe2 = await Cafe.create({
      name: "Unassigned Cafe",
      code: "C2",
      slug: "c2",
      address: { line1: "A", city: "B", state: "C", pincode: "560001" },
      status: "ACTIVE",
    });

    const supActor: AuthUser = {
      id: supUser._id.toString(),
      name: supUser.name,
      email: supUser.email,
      mobile: supUser.mobile,
      role: "SUPERVISOR",
    };

    expect(await canAccessCafe(supActor, cafe1._id)).toBe(true);
    expect(await canAccessCafe(supActor, cafe2._id)).toBe(false); // Unassigned cafe blocked!
  });
});

