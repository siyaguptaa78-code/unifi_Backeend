# UniCafe — Production Backend Service

Production-ready, independently deployable Node.js & Express REST API service for the UniCafe multi-location cafe membership, access control, and online ordering platform.

---

## 🏗️ Architecture Overview

- **Framework:** Express with Node.js LTS
- **Database:** MongoDB 7.0+ (Replica Set required for multi-document ACID transactions)
- **Authentication:** Stateless signed JWT sessions (via HTTP-only cookies or Bearer tokens)
- **Role Scoping:** 6 central roles (`SUPER_ADMIN`, `SUPERVISOR`, `FRANCHISE_OWNER`, `MANAGER`, `STAFF`, `CUSTOMER`)
- **Ledger Guarantees:** Double-entry wallet point transactions (`CREDIT`, `DEBIT`, `REFUND`)
- **Ordering Modes:**
  - `DINE_IN`: Table order within the cafe
  - `PRE_ORDER`: Online pre-order before arrival for in-cafe collection or dine-in (strictly **no home delivery**)

---

## 🚀 Quick Start (Local Development)

```bash
cd backend

# Install dependencies
npm install

# Start development server with live reload
npm run dev

# Run business logic tests
npm test

# Run database seed
npm run seed
```

---

## 🌐 Production Deployment (Render)

This repository includes a `render.yaml` Blueprint for zero-friction deployment to Render.

### Steps on Render:
1. Connect this repository: `https://github.com/anuraagmishra21-spec/unificafe_backend.git`
2. Configure Environment Variables:
   - `MONGODB_URI`: `mongodb+srv://anuraagmishra21_db_user:<PASSWORD>@cluster0.m0h122z.mongodb.net/unicafe?retryWrites=true&w=majority`
   - `JWT_SECRET`: Random 32+ character secret string
   - `APP_URL`: Production Vercel Frontend URL (e.g. `https://unificafe.vercel.app`)
   - `PORT`: `5000` (or leave default assigned by Render)
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Health Check Path: `/health`

---

## 🔒 Security & Testing

- 31 automated business logic assertions in `tests/run-tests.ts`.
- HMAC-SHA256 signature verification for payments.
- Idempotency key protection against duplicate order submissions.
- Contactless card anti-passback and duplicate-tap protection windows.
