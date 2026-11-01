# UniCafe — Production Infrastructure & Environment Reference

## 1. MongoDB Atlas Configuration & Replica Sets

### ACID Transactions Requirement
UniCafe enforces strict multi-document ACID transactions across:
- `Membership` (points balance, remaining minutes)
- `PointsLedger` (atomic credits & debits)
- `Payment` (idempotent webhook & capture events)
- `Order` & `OrderItem` (atomic points deductions and inventory reservation)
- `VisitSession` & `MembershipTransaction` (time usage calculations & anti-passback)

MongoDB Atlas clusters natively support multi-document transactions across replica set nodes (`rs0`).

### Connection String Anatomy
```
mongodb+srv://<USERNAME>:<PASSWORD>@<CLUSTER_HOST>/<DB_NAME>?retryWrites=true&w=majority&appName=<APP_NAME>
```
- `retryWrites=true`: Automatically retries write operations on transient network drops.
- `w=majority`: Ensures data replication to majority nodes before acknowledgment.

---

## 2. Environment Variables Matrix

| Variable | Required | Default | Scope | Description |
| :--- | :--- | :--- | :--- | :--- |
| `NODE_ENV` | Yes | `production` | Both | Environment mode (`development` / `production` / `test`) |
| `PORT` | Yes (Backend) | `5000` | Backend | HTTP listening port for Express server |
| `MONGODB_URI` | Yes | - | Both | Connection URI to MongoDB Atlas replica set |
| `JWT_SECRET` | Yes | - | Both | Minimum 32-character secret for signing session tokens |
| `SESSION_TTL_HOURS` | No | `168` (7 days) | Both | Token expiry duration |
| `APP_URL` | Yes | - | Both | Public URL of the frontend for CORS and reset links |
| `BACKEND_API_URL` | No | - | Frontend | URL of backend API on Render (for Vercel rewrites) |
| `PAYMENT_MODE` | No | `demo` | Both | `demo` (in-app test simulator) or `razorpay` |
| `RAZORPAY_KEY_ID` | Optional | - | Both | Required only if `PAYMENT_MODE=razorpay` |
| `RAZORPAY_KEY_SECRET` | Optional | - | Both | Required only if `PAYMENT_MODE=razorpay` |
| `RAZORPAY_WEBHOOK_SECRET` | Optional | - | Both | Required for signature verification of webhooks |
| `EMAIL_PROVIDER` | No | `mock` | Both | `mock` or `resend` / `ses` / `smtp` |
| `SMS_PROVIDER` | No | `mock` | Both | `mock` or `msg91` / `twilio` |
| `WHATSAPP_PROVIDER` | No | `mock` | Both | `mock` or `meta` / `gupshup` |

---

## 3. Database Indexes

Run the following command to ensure all production compound indexes are initialized:

```bash
npx tsx -e '
  import { connectDB } from "./src/lib/db";
  import * as models from "./src/models";
  async function run() {
    await connectDB();
    for (const [name, model] of Object.entries(models)) {
      if ((model as any).syncIndexes) {
        console.log("Syncing indexes for:", name);
        await (model as any).syncIndexes();
      }
    }
    console.log("All indexes synchronized successfully.");
    process.exit(0);
  }
  run();
'
```

### Critical Production Indexes
- `users`: `{ email: 1 }` (unique), `{ mobile: 1 }` (unique)
- `customer_profiles`: `{ customerCode: 1 }` (unique)
- `membership_cards`: `{ uid: 1 }` (unique), `{ cardNumber: 1 }` (unique), `{ customer: 1, status: 1 }` (filtered unique for ACTIVE)
- `memberships`: `{ customer: 1 }` (unique)
- `orders`: `{ orderNumber: 1 }` (unique), `{ customer: 1, createdAt: -1 }`, `{ cafe: 1, status: 1, createdAt: -1 }`
- `points_ledgers`: `{ customer: 1, createdAt: -1 }`, `{ reference: 1 }`
- `visit_sessions`: `{ customer: 1, status: 1 }`, `{ cafe: 1, status: 1 }`
- `audit_logs`: `{ performedBy: 1, createdAt: -1 }`, `{ entityType: 1, entityId: 1 }`

---

## 4. Production Security Checklist

- [x] Secure HTTP-only cookies (`uc_session`) with `SameSite=lax` and `secure=true` in production.
- [x] Content Security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`.
- [x] Password hashing using `bcryptjs` with 10 salt rounds and timing attack mitigation.
- [x] Role-Based Access Control (RBAC) enforced on both frontend portal routes and server endpoints.
- [x] MongoDB multi-document ACID transactions preventing race conditions on points and time deduction.
- [x] Anti-passback gate security preventing simultaneous active visits with the same NFC/RFID card.
- [x] Zero delivery workflows: strictly in-store dine-in or pre-ordered cafe pickup.
