# UniCafe — Online Ordering & Pre-Arrival Architecture & Workflow

## Overview & Executive Principles

UniCafe supports two distinct, cafe-centric ordering modes designed for maximum operational efficiency and customer convenience. **UniCafe strictly DOES NOT offer home delivery.** All food preparation, inventory deduction, and order fulfillment occur exclusively at physical UniCafe branches.

```
+-----------------------------------------------------------------------------------+
|                              UNICAFE ORDERING SYSTEM                              |
+---------------------------------------------------------+-------------------------+
                                                          |
                 +----------------------------------------+----------------------------------------+
                 |                                                                                 |
                 v                                                                                 v
      [MODE 1: DINE-IN (IN CAFE)]                                              [MODE 2: PRE-ORDER (OUTSIDE CAFE)]
+-----------------------------------------+                              +-----------------------------------------+
| Customer is physically inside branch.   |                              | Customer is outside the cafe (anywhere).|
| Active VisitSession active via NFC/RFID |                              | Selects pickup branch & time slot.      |
| Direct kitchen prep for current seat.   |                              | Travels to branch -> Enjoys/Picks up.   |
+-----------------------------------------+                              +-----------------------------------------+
                 |                                                                                 |
                 +----------------------------------------+----------------------------------------+
                                                          |
                                                          v
                                     [ATOMIC POINTS DEDUCTION]
                                     Membership balance charged
                                     No delivery fee / No courier
                                                          |
                                                          v
                                        [KITCHEN MANAGEMENT QUEUE]
                                     Staff sees customer presence:
                                     - "Inside Cafe Now" vs
                                     - "Yet to Arrive (Slot: 15-20 min)"
                                                          |
                                                          v
                                     [STATUS PROGRESSION & HANDOVER]
                                     PLACED -> ACCEPTED -> PREPARING
                                           -> READY -> COMPLETED
```

---

## 1. Ordering Modes

### Mode A: Order Inside Cafe (Dine-In)
- **Eligibility:** Available to customers present at the cafe (with an active NFC/RFID card tap or checked-in session).
- **Workflow:**
  1. Customer selects their current cafe branch.
  2. Browses the branch-specific menu with real-time stock availability.
  3. Adds items to cart, customized to preferences.
  4. Selects **Dine-In** order type.
  5. Reviews points total and places order.
  6. Atomic points deduction from membership account via ACID transaction.
  7. Kitchen display immediately tags order as `Dine-In` with customer presence verified (`Inside Cafe Now`).
  8. Order is prepared and served at the cafe.

### Mode B: Order Online Before Arrival (Pre-Order / Self-Pickup)
- **Eligibility:** Available to any registered customer from anywhere (home, office, transit).
- **Core Constraints:**
  - **Zero home delivery:** No address collection, no delivery fees, no third-party courier dispatch.
  - Branch selection required: Customer must pick the exact UniCafe branch they intend to visit.
  - Branch capability check: Selected cafe must have `acceptsPreOrders: true` and be within active operating hours.
  - Arrival time slot required: Customer selects an estimated arrival window (`15–20 min`, `30 min`, `45 min`, `1 hour`, `1.5 hours`).
- **Workflow:**
  1. Customer browses branches and selects target cafe.
  2. Cafe details display estimated kitchen preparation time (e.g., ~15 mins) and operating hours.
  3. Customer selects menu items and enters the cart.
  4. Customer chooses **Pre-Order (Pick up / Dine-in at cafe)** and selects an expected arrival slot.
  5. System validates cafe pre-order acceptance and time constraints.
  6. Points are debited atomically; transaction is recorded in `PointsLedger` with reference `ORDER-<id>`.
  7. Order enters kitchen queue marked with amber badge: `Pre-Order` and badge: `Yet to Arrive (ETA: <time>)`.
  8. Customer travels to the branch and taps NFC/RFID card or shows digital membership code at reception.
  9. Staff status view dynamically updates to `Inside Cafe Now` as soon as the visit session starts.
  10. Staff completes handover and marks order `COMPLETED`.

---

## 2. Order Lifecycle & State Machine

```
              [CUSTOMER PLACES ORDER]
                        |
                        v
                     PLACED <-------------------------------+
                        |                                   |
         +--------------+--------------+                    |
         | (Reject)                    | (Accept)           |
         v                             v                    |
     REJECTED                      ACCEPTED                 | (Customer Cancel
   [Points Refunded]                   |                    |  before prep)
                                       v                    |
                                   PREPARING ---------------+
                                       |
                                       v
                                     READY
                                       |
                                       v
                                   COMPLETED
                               (In-store Handover)
```

### Cancellation & Refund Rules
1. **Customer-Initiated Cancellation:**
   - Allowed when order is in `PLACED` or `ACCEPTED` status.
   - Strictly prohibited once status reaches `PREPARING`, `READY`, or `COMPLETED`.
   - On cancellation, 100% of deducted points are automatically credited back to customer's `Membership` wallet in an ACID transaction with an audit trail in `PointsLedger` (`REFUND-ORDER-<id>`).
2. **Staff/Administrative Cancellation:**
   - Staff/Managers can cancel an order with a mandatory reason if an item is out of stock or kitchen is overloaded.
   - Automatically processes an atomic points refund and dispatches a notification to the customer.

---

## 3. Data Models & Database Indexes

### Order Schema (`src/models/Order.ts`)
```typescript
{
  orderNumber: string;                 // e.g. "ORD-123456"
  customer: ObjectId;                  // Ref: User
  cafe: ObjectId;                      // Ref: Cafe
  status: "PLACED" | "ACCEPTED" | "PREPARING" | "READY" | "COMPLETED" | "CANCELLED" | "REJECTED";
  orderType: "DINE_IN" | "PRE_ORDER" | "IN_CAFE";
  expectedArrivalTime?: Date;          // Pre-order estimated arrival timestamp
  pickupSlot?: string;                 // e.g. "15-20 mins", "30 mins", "1 hour"
  estimatedPrepMinutes?: number;       // Kitchen prep estimate (from cafe settings)
  totalPoints: number;                 // Points charged
  totalItems: number;                  // Item count
  cancellationReason?: string;
  cancelledAt?: Date;
  refundedPoints?: number;
  createdAt: Date;
  updatedAt: Date;
}
```

### Key Performance Indexes
- `{ customer: 1, createdAt: -1 }` — Fast customer order history lookup.
- `{ cafe: 1, status: 1, createdAt: -1 }` — Real-time kitchen display and queue filtering.
- `{ orderType: 1, status: 1 }` — Operational analytics and pre-order volume monitoring.

---

## 4. Kitchen Management View Features

Staff and Cafe Managers have access to an enhanced kitchen management view (`/staff/orders` and `/manager/orders`):
- **Visual Distinction:** Pre-orders display with an Amber pre-order tag; dine-in orders display with an Indigo tag.
- **Customer Presence Indicator:**
  - `🟢 Inside Cafe Now`: Customer has an active visit session at this branch.
  - `⏳ Yet to Arrive`: Customer is in transit; requested arrival slot is displayed.
- **Single-Click Workflow Progression:**
  - `Accept Order` -> `Start Prep` -> `Mark Ready` -> `Handover Complete`.
- **Administrative Action:**
  - Cancel & Refund button with audit logging.
