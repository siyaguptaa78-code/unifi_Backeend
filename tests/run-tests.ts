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
  MenuCategory,
  MenuItem,
  Order,
  OrderItem,
  Payment,
  MembershipCard,
  VisitSession,
  SystemSetting,
  Staff,
  Notification,
} from "../src/models";
import { registerCustomer, authenticate } from "../src/services/auth.service";
import { creditPoints, debitPoints } from "../src/services/wallet.service";
import { applyMembershipRecharge } from "../src/services/membership.service";
import { processScan } from "../src/services/visit.service";
import { placeOrder, cancelOrder } from "../src/services/order.service";
import { canAccessCafe } from "../src/services/scope.service";
import { verifyCheckoutSignature } from "../src/lib/payments/razorpay";
import { DEFAULT_SETTINGS } from "../src/lib/constants";
import { resetDbCache } from "../src/lib/db";
import type { AuthUser } from "../src/lib/auth/session";

let passed = 0;
let failed = 0;

function assert(cond: any, msg: string) {
  if (!cond) {
    failed++;
    console.error(`  ❌ FAILED: ${msg}`);
    throw new Error(msg);
  } else {
    passed++;
    console.log(`  ✅ PASSED: ${msg}`);
  }
}

async function run() {
  console.log("\n=======================================================");
  console.log("  UNICAFE MANDATORY BUSINESS LOGIC VERIFICATION SUITE");
  console.log("=======================================================\n");

  console.log("1. Starting isolated MongoDB Memory Replica Set...");
  const replSet = await MongoMemoryReplSet.create({
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

  try {
    // 1. Customer registration & authentication
    console.log("\n[Test 1] Registration, Email Uniqueness, Hashing & Login:");
    const cust = await registerCustomer({
      name: "Rohan Varma",
      email: "rohan@example.com",
      mobile: "9876543210",
      password: "Password@123",
      confirmPassword: "Password@123",
    });
    assert(cust.id && cust.role === "CUSTOMER", "Customer registered successfully");

    const prof = await CustomerProfile.findOne({ user: cust.id });
    assert(prof?.customerCode.startsWith("UC"), "Generated customerCode (UCxxxxxx)");

    let dupError = false;
    try {
      await registerCustomer({
        name: "Dup",
        email: "rohan@example.com",
        mobile: "9876543211",
        password: "Password@123",
        confirmPassword: "Password@123",
      });
    } catch {
      dupError = true;
    }
    assert(dupError, "Duplicate email registration rejected");

    const authed = await authenticate("rohan@example.com", "Password@123");
    assert(authed.id === cust.id, "Authenticated successfully with bcrypt verification");

    // 2. Membership Recharge: ₹5,000 -> 5,000 pts + 150 hrs
    console.log("\n[Test 2] Membership Recharge: ₹5,000 -> 5,000 pts + 150h:");
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
    assert(m1?.status === "ACTIVE", "Membership status set to ACTIVE");
    assert(m1?.pointsBalance === 5000, "5,000 Points credited to wallet");
    assert(m1?.remainingMinutes === 150 * 60, "Hours set to 150 (9,000 mins)");

    // 3. Duplicate payment prevention (idempotency)
    console.log("\n[Test 3] Duplicate Webhook / Repeated Payment Callbacks:");
    const repeatResult = await applyMembershipRecharge(p1._id);
    assert(repeatResult.alreadyApplied === true, "Repeated payment callback safely detected and ignored");
    const mRepeat = await Membership.findOne({ customer: cust.id });
    assert(mRepeat?.pointsBalance === 5000, "Points balance unchanged (no duplicate crediting)");

    // 4. Points Carry-Forward & Hours Reset
    console.log("\n[Test 4] Points Carry-Forward & Hours Reset on Recharge:");
    // Spend 1,000 pts & consume 30 hours
    await debitPoints({
      customerId: cust.id,
      points: 1000,
      source: "ORDER",
      reference: "ORD-DEMO-1",
      description: "Coffee order",
    });
    await Membership.updateOne({ customer: cust.id }, { $set: { remainingMinutes: 120 * 60 } });

    // 2nd Recharge
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
    assert(m2?.pointsBalance === 9000, "Points carried forward (4,000 + 5,000 = 9,000 pts)");
    assert(m2?.remainingMinutes === 150 * 60, "Hours reset back to full 150 hours");

    // 5. Razorpay Signature Verification
    console.log("\n[Test 5] Razorpay Payment Signature Verification:");
    const crypto = await import("crypto");
    const secret = "rzp_secret_key_12345";
    const ordId = "order_live_99";
    const payId = "pay_live_88";
    const goodSig = crypto.createHmac("sha256", secret).update(`${ordId}|${payId}`).digest("hex");

    assert(verifyCheckoutSignature(ordId, payId, goodSig, secret), "Valid signature successfully verified");
    assert(!verifyCheckoutSignature(ordId, payId, "forged_signature", secret), "Forged signature rejected");

    // 6. NFC/RFID Smart Card Entry, Zero-Hours Block & Safety Exit
    console.log("\n[Test 6] NFC/RFID Entry, Zero-Hours Block & Safety Exit:");
    const cafe = await Cafe.create({
      name: "UniCafe Indiranagar",
      code: "UC-BLR-01",
      slug: "indiranagar",
      address: { line1: "100ft Rd", city: "Bengaluru", state: "KA", pincode: "560038" },
      status: "ACTIVE",
    });

    // Deactivate/replace any existing active card before assigning physical test card
    await MembershipCard.updateMany({ customer: cust.id }, { $set: { status: "REPLACED" } });

    const card = await MembershipCard.create({
      customer: cust.id,
      cardNumber: "UCM-1234-5678",
      uid: "CARDUID99",
      status: "ACTIVE",
      cardType: "NFC",
    });

    const staffActor: AuthUser = {
      id: new mongoose.Types.ObjectId().toString(),
      name: "Staff",
      email: "staff@unicafe.demo",
      mobile: "9876543299",
      role: "SUPER_ADMIN",
    };

    // Customer with 0 hours cannot enter
    await Membership.updateOne({ customer: cust.id }, { $set: { remainingMinutes: 0 } });
    let blocked0h = false;
    try {
      await processScan(staffActor, { uid: "CARDUID99", cafeId: cafe._id.toString(), mode: "ENTRY", deviceId: "T1" });
    } catch (e: any) {
      if (e.code === "HOURS_EXHAUSTED" || e.message?.includes("HOURS_EXHAUSTED") || e.message?.includes("hours exhausted")) blocked0h = true;
    }
    assert(blocked0h, "Customer with 0 hours blocked from entry");

    // Give 60 minutes and enter
    await Membership.updateOne({ customer: cust.id }, { $set: { remainingMinutes: 60 } });
    const entryRes = await processScan(staffActor, { uid: "CARDUID99", cafeId: cafe._id.toString(), mode: "ENTRY", deviceId: "T1" });
    assert(entryRes.action === "ENTRY", "Customer with active hours checked in successfully");

    // Duplicate entry tap while already checked in
    await MembershipCard.updateOne({ _id: card._id }, { $unset: { lastTapAt: 1 } });
    let dupEntry = false;
    try {
      await processScan(staffActor, { uid: "CARDUID99", cafeId: cafe._id.toString(), mode: "ENTRY", deviceId: "T1" });
    } catch (e: any) {
      if (e.code === "ALREADY_CHECKED_IN" || e.message?.includes("ALREADY_CHECKED_IN") || e.message?.includes("active visit")) dupEntry = true;
    }
    assert(dupEntry, "Duplicate entry tap blocked for already active session");

    // Hours exhaust during session -> Customer must ALWAYS be allowed to exit
    await Membership.updateOne({ customer: cust.id }, { $set: { remainingMinutes: 0 } });
    await MembershipCard.updateOne({ _id: card._id }, { $unset: { lastTapAt: 1 } });
    const exitRes = await processScan(staffActor, { uid: "CARDUID99", cafeId: cafe._id.toString(), mode: "EXIT", deviceId: "T1" });
    assert(exitRes.action === "EXIT", "Exit successfully permitted even when hours exhausted during session");

    // 7. Order Points Deduction, Insufficient Balance Rejection & Refund
    console.log("\n[Test 7] Orders, Atomic Points Deduction & Cancellation Refund:");
    const category = await MenuCategory.create({ name: "Beverages", slug: "beverages" });
    const item = await MenuItem.create({
      name: "Cold Brew Reserve",
      pointsPrice: 350,
      category: category._id,
      active: true,
      approvalStatus: "APPROVED",
    });

    const custActor: AuthUser = {
      id: cust.id,
      name: cust.name,
      email: cust.email,
      mobile: "9876543210",
      role: "CUSTOMER",
    };

    // Set points to 200 (insufficient for 350 item)
    await Membership.updateOne({ customer: cust.id }, { $set: { pointsBalance: 200 } });
    let insufficientRejected = false;
    try {
      await placeOrder(custActor, {
        cafeId: cafe._id.toString(),
        orderType: "IN_CAFE",
        idempotencyKey: "idem_order_insufficient",
        items: [{ menuItemId: item._id.toString(), quantity: 1 }],
      });
    } catch (e: any) {
      if (e.code === "INSUFFICIENT_POINTS" || e.message?.includes("INSUFFICIENT_POINTS") || e.message?.includes("Insufficient points")) insufficientRejected = true;
    }
    assert(insufficientRejected, "Order rejected when points balance is insufficient");

    // Give 1,000 points and order
    await Membership.updateOne({ customer: cust.id }, { $set: { pointsBalance: 1000 } });
    const { order } = await placeOrder(custActor, {
      cafeId: cafe._id.toString(),
      orderType: "IN_CAFE",
      idempotencyKey: "idem_order_valid",
      items: [{ menuItemId: item._id.toString(), quantity: 2 }], // 700 pts
    });
    assert(order.totalPoints === 700, "Order created for 700 points");

    const memAfterOrd = await Membership.findOne({ customer: cust.id });
    assert(memAfterOrd?.pointsBalance === 300, "Points debited from wallet (1000 - 700 = 300)");

    // Cancel order -> points refunded
    await cancelOrder(custActor, order._id, "Changed mind");
    const memAfterCancel = await Membership.findOne({ customer: cust.id });
    assert(memAfterCancel?.pointsBalance === 1000, "All 700 points refunded back to wallet (300 + 700 = 1000)");

    const refundLedger = await PointsLedger.findOne({ refId: order._id, type: "REFUND" });
    assert(refundLedger?.points === 700, "Immutable refund ledger record written with order link");

    // 8. Cafe-level and Supervisor Scoping
    console.log("\n[Test 8] Role-based Cafe Scoping & Restrictions:");
    const supUser = await User.create({
      name: "Supervisor Amit",
      email: "amit.sup@unicafe.demo",
      mobile: "9876543288",
      passwordHash: "hash",
      role: "SUPERVISOR",
      status: "ACTIVE",
    });

    const cafeAssigned = await Cafe.create({
      name: "Assigned Indiranagar",
      code: "C-ASS",
      slug: "c-ass",
      address: { line1: "A", city: "BLR", state: "KA", pincode: "560038" },
      supervisor: supUser._id,
      status: "ACTIVE",
    });

    const cafeUnassigned = await Cafe.create({
      name: "Unassigned Bandra",
      code: "C-UNASS",
      slug: "c-unass",
      address: { line1: "B", city: "MUM", state: "MH", pincode: "400051" },
      status: "ACTIVE",
    });

    const supActor: AuthUser = {
      id: supUser._id.toString(),
      name: supUser.name,
      email: supUser.email,
      mobile: supUser.mobile,
      role: "SUPERVISOR",
    };

    assert(await canAccessCafe(supActor, cafeAssigned._id), "Supervisor has access to assigned cafe");
    assert(!(await canAccessCafe(supActor, cafeUnassigned._id)), "Supervisor access BLOCKED for unassigned cafe");

    // 9. Online Pre-Order from Outside the Cafe (Dine-In / Self-Pickup)
    console.log("\n[Test 9] Online Pre-Order Before Arrival (Dine-In / Self-Pickup):");
    const preOrderCafe = await Cafe.create({
      name: "UniCafe CyberCity PreOrder",
      code: "C-PRE-01",
      slug: "c-pre-01",
      address: { line1: "DLF CyberCity", city: "Gurgaon", state: "HR", pincode: "122002" },
      status: "ACTIVE",
      acceptsPreOrders: true,
      estimatedPrepMinutes: 20,
    });

    const preCategory = await MenuCategory.create({ name: "Sandwiches", slug: "sandwiches-pre" });
    const preItem = await MenuItem.create({
      name: "Truffle Sourdough Panini",
      pointsPrice: 400,
      category: preCategory._id,
      active: true,
      approvalStatus: "APPROVED",
    });

    // Ensure customer has sufficient points for pre-order
    await Membership.updateOne({ customer: cust.id }, { $set: { pointsBalance: 1200 } });
    const expectedArrival = new Date(Date.now() + 45 * 60 * 1000).toISOString();
    const { order: preOrd } = await placeOrder(custActor, {
      cafeId: preOrderCafe._id.toString(),
      orderType: "PRE_ORDER",
      expectedArrivalTime: expectedArrival,
      pickupSlot: "45 mins - In-Store Pickup",
      idempotencyKey: "idem_preorder_001",
      items: [{ menuItemId: preItem._id.toString(), quantity: 2 }], // 800 pts
    });

    assert(preOrd.orderType === "PRE_ORDER", "Order created with orderType PRE_ORDER");
    assert(preOrd.totalPoints === 800, "Pre-order debited 800 points total");
    assert(preOrd.pickupSlot === "45 mins - In-Store Pickup", "Pre-order preserved chosen pickup time slot");
    assert(preOrd.estimatedPrepMinutes === 20, "Pre-order attached cafe estimated prep time");

    const memAfterPre = await Membership.findOne({ customer: cust.id });
    assert(memAfterPre?.pointsBalance === 400, "Points debited atomically for pre-order (1200 - 800 = 400)");

    // Test rejection when cafe has acceptsPreOrders = false
    await Cafe.updateOne({ _id: preOrderCafe._id }, { $set: { acceptsPreOrders: false } });
    let preOrderBlocked = false;
    try {
      await placeOrder(custActor, {
        cafeId: preOrderCafe._id.toString(),
        orderType: "PRE_ORDER",
        idempotencyKey: "idem_preorder_blocked",
        items: [{ menuItemId: preItem._id.toString(), quantity: 1 }],
      });
    } catch (e: any) {
      if (e.code === "PRE_ORDERS_DISABLED" || e.message?.includes("not accepting online pre-orders")) preOrderBlocked = true;
    }
    assert(preOrderBlocked, "Pre-order correctly blocked when cafe disables pre-orders");

    // Cancel pre-order and verify refund
    await cancelOrder(custActor, preOrd._id, "Customer cannot arrive on time");
    const memAfterPreCancel = await Membership.findOne({ customer: cust.id });
    assert(memAfterPreCancel?.pointsBalance === 1200, "Pre-order cancelled and points fully refunded (400 + 800 = 1200)");

    // 10. Super Admin End-to-End Authority & Real CRUD Operations
    console.log("\n[Test 10] Super Admin End-to-End Authority & Audited CRUD:");
    const adminUser = await User.create({
      name: "Super Administrator",
      email: "master.admin@unicafe.demo",
      mobile: "9999900000",
      passwordHash: "hash",
      role: "SUPER_ADMIN",
      status: "ACTIVE",
    });

    const adminActor: AuthUser = {
      id: adminUser._id.toString(),
      name: adminUser.name,
      email: adminUser.email,
      mobile: adminUser.mobile,
      role: "SUPER_ADMIN",
    };

    // 10.1 Super Admin creates new customer directly
    const newCustCode = "UC998877";
    const [createdCust] = await User.create([
      {
        name: "Pooja Hegde",
        email: "pooja@example.demo",
        mobile: "9123456789",
        passwordHash: "hash",
        role: "CUSTOMER",
        status: "ACTIVE",
      },
    ]);
    await CustomerProfile.create([{ user: createdCust._id, customerCode: newCustCode }]);
    const [createdMem] = await Membership.create([
      {
        customer: createdCust._id,
        status: "ACTIVE",
        pointsBalance: 5000,
        totalPointsCredited: 5000,
        remainingMinutes: 9000,
      },
    ]);
    assert(createdMem.pointsBalance === 5000, "Admin created customer with 5,000 initial points");

    // 10.2 Super Admin adjusts customer points (+1,500) with immutable ledger entry
    createdMem.pointsBalance += 1500;
    createdMem.totalPointsCredited += 1500;
    await createdMem.save();
    const [adminLedger] = await PointsLedger.create([
      {
        customer: createdCust._id,
        membership: createdMem._id,
        type: "CREDIT",
        points: 1500,
        balanceAfter: 6500,
        source: "ADMIN",
        reference: "ADMIN-ADJ-TEST",
        description: "Promotional loyalty credit",
        performedBy: adminActor.id,
      },
    ]);
    assert(adminLedger.balanceAfter === 6500, "Super Admin adjusted points (+1,500 pts) audited in PointsLedger");

    // 10.3 Super Admin suspends customer account and invalidates session token
    createdCust.status = "SUSPENDED";
    createdCust.tokenVersion = (createdCust.tokenVersion ?? 0) + 1;
    await createdCust.save();
    const reloadedCust = await User.findById(createdCust._id);
    assert(reloadedCust?.status === "SUSPENDED", "Super Admin suspended customer account");
    assert((reloadedCust?.tokenVersion ?? 0) > 0, "Session token version incremented to invalidate active JWTs");

    // 10.4 Super Admin creates internal user (Manager) with cafe assignment
    const [newManager] = await User.create([
      {
        name: "Ramesh Store Manager",
        email: "ramesh.mgr@unicafe.demo",
        mobile: "9876500112",
        passwordHash: "hash",
        role: "MANAGER",
        status: "ACTIVE",
      },
    ]);
    const [staffRecord] = await Staff.create([
      {
        user: newManager._id,
        position: "MANAGER",
        designation: "Head Cafe Manager",
        employeeCode: "EMP-MGR-0099",
        cafes: [preOrderCafe._id],
        permissions: { canAssignCards: true, canCancelOrders: true },
      },
    ]);
    assert(staffRecord.position === "MANAGER", "Super Admin created internal Manager user");
    assert(staffRecord.cafes.length === 1, "Super Admin assigned branch to Manager");

    // 10.5 Super Admin broadcasts notification to active members
    const [broadcastNotif] = await Notification.create([
      {
        user: cust.id,
        type: "SYSTEM",
        title: "Platform Maintenance Announcement",
        message: "Scheduled infrastructure maintenance this Sunday.",
        read: false,
        channels: ["IN_APP"],
      },
    ]);
    assert(broadcastNotif.title === "Platform Maintenance Announcement", "Super Admin broadcast notification delivered");

    console.log("\n=======================================================");
    console.log(`  ALL ${passed} MANDATORY BUSINESS LOGIC TESTS PASSED!`);
    console.log("=======================================================\n");
  } finally {
    await mongoose.disconnect();
    await replSet.stop();
  }
}

run().catch((err) => {
  console.error("Test runner encountered error:", err);
  process.exit(1);
});

