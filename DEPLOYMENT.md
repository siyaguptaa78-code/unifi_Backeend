# UniCafe — Production Deployment Guide

This guide provides end-to-end instructions for deploying the UniCafe platform to production:
- **Frontend Application:** Deployed on **Vercel**
- **Backend API Service:** Deployed on **Render**
- **Database:** Hosted on **MongoDB Atlas** (Replica Set enabled by default)

---

## 1. Architecture Overview

```
+-------------------------------------------------------------+
|                          CUSTOMERS                          |
+------------------------------+------------------------------+
                               |
                               v
               +-------------------------------+
               |       VERCEL (Frontend)       |
               |  Next.js 14 App Router (SSR)  |
               |  Obsidian/Amber UI Interface  |
               +---------------+---------------+
                               |
               (API Proxy / Rewrites or Direct)
                               |
                               v
               +-------------------------------+
               |        RENDER (Backend)       |
               |  Express + TypeScript Engine  |
               |  NFC/RFID Scanner Simulator   |
               |  ACID Transaction Services    |
               +---------------+---------------+
                               |
                               v
               +-------------------------------+
               |         MONGODB ATLAS         |
               |  Replica Set (rs0) Cluster    |
               |  Points Ledger & Sessions     |
               +-------------------------------+
```

---

## 2. GitHub Repositories Setup

Both codebases are prepared and committed on branch `main`:

| Repository | GitHub URL | Target Cloud |
| :--- | :--- | :--- |
| **Frontend** | `https://github.com/anuraagmishra21-spec/unificafe_-Frontend.git` | Vercel |
| **Backend** | `https://github.com/anuraagmishra21-spec/unificafe_backend.git` | Render |

### Pushing Code to GitHub

To push the latest commits to GitHub from PowerShell:
```powershell
# Using personal access token:
powershell -File scripts/push-repos.ps1 -GitHubToken <YOUR_GITHUB_PAT>

# Or directly using git:
git push -u origin main
cd backend
git push -u origin main
```

---

## 3. MongoDB Atlas Configuration

UniCafe requires MongoDB Replica Set capabilities for multi-document ACID transactions across memberships, points ledgers, and orders. **All MongoDB Atlas clusters provide replica sets out of the box.**

### Target Cluster Details
- **Cluster Host:** `cluster0.m0h122z.mongodb.net`
- **Database User:** `anuraagmishra21_db_user`
- **Database Name:** `unicafe`

### Atlas Configuration Steps
1. Log in to [MongoDB Atlas Console](https://cloud.mongodb.com/).
2. Under **Database Access**:
   - Ensure `anuraagmishra21_db_user` has `readWriteAnyDatabase` or `readWrite@unicafe` role.
   - Note the password for this user.
3. Under **Network Access**:
   - Click **Add IP Address**.
   - Add `0.0.0.0/0` (Allow access from anywhere) to allow Vercel and Render dynamic serverless IP ranges.
4. Construct your production connection string:
   ```env
   MONGODB_URI="mongodb+srv://anuraagmishra21_db_user:<YOUR_PASSWORD>@cluster0.m0h122z.mongodb.net/unicafe?retryWrites=true&w=majority&appName=Cluster0"
   ```

---

## 4. Backend Deployment on Render

The backend is configured with `render.yaml` for automated deployment.

### Option A: Deploy via Render Blueprint (Recommended)
1. Go to [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** -> **Blueprint**.
3. Connect repository `anuraagmishra21-spec/unificafe_backend`.
4. Render detects `render.yaml` automatically.
5. Provide the `MONGODB_URI` environment variable when prompted.
6. Click **Apply**.

### Option B: Manual Web Service Setup
1. Click **New +** -> **Web Service**.
2. Connect `https://github.com/anuraagmishra21-spec/unificafe_backend.git`.
3. Configure service settings:
   - **Name:** `unicafe-backend`
   - **Region:** `Oregon (US West)` or nearest to your users
   - **Branch:** `main`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/health`
4. Configure Environment Variables:
   ```env
   NODE_ENV=production
   PORT=5000
   MONGODB_URI=mongodb+srv://anuraagmishra21_db_user:<PASSWORD>@cluster0.m0h122z.mongodb.net/unicafe?retryWrites=true&w=majority&appName=Cluster0
   JWT_SECRET=super-secret-jwt-key-min-32-chars-long-production-xyz
   APP_URL=https://<YOUR_VERCEL_FRONTEND_DOMAIN>.vercel.app
   PAYMENT_MODE=demo
   EMAIL_PROVIDER=mock
   SMS_PROVIDER=mock
   WHATSAPP_PROVIDER=mock
   ```
5. Click **Create Web Service**. Once deployed, note your service URL (e.g. `https://unicafe-backend.onrender.com`).

---

## 5. Frontend Deployment on Vercel

### Step-by-Step Vercel Setup
1. Log in to [Vercel Dashboard](https://vercel.com/).
2. Click **Add New...** -> **Project**.
3. Import `anuraagmishra21-spec/unificafe_-Frontend`.
4. Configure Project Settings:
   - **Framework Preset:** `Next.js`
   - **Root Directory:** `./`
   - **Build Command:** `npm run build`
   - **Output Directory:** `.next`
5. Configure Environment Variables in Vercel:
   ```env
   NODE_ENV=production
   MONGODB_URI=mongodb+srv://anuraagmishra21_db_user:<PASSWORD>@cluster0.m0h122z.mongodb.net/unicafe?retryWrites=true&w=majority&appName=Cluster0
   JWT_SECRET=super-secret-jwt-key-min-32-chars-long-production-xyz
   APP_URL=https://<YOUR_VERCEL_PROJECT>.vercel.app
   BACKEND_API_URL=https://unicafe-backend.onrender.com
   PAYMENT_MODE=demo
   EMAIL_PROVIDER=mock
   SMS_PROVIDER=mock
   WHATSAPP_PROVIDER=mock
   ```
6. Click **Deploy**. Vercel will build and launch the frontend with zero-downtime edge distribution.

---

## 6. Database Seeding in Production

To initialize standard branches, menu categories, demo items, and administrator accounts on the production MongoDB Atlas cluster:

```bash
# From local terminal with Atlas MONGODB_URI set:
$env:MONGODB_URI="mongodb+srv://anuraagmishra21_db_user:<PASSWORD>@cluster0.m0h122z.mongodb.net/unicafe?retryWrites=true&w=majority&appName=Cluster0"
npx tsx scripts/seed.ts
```

### Initial Administrative Credentials
- **Super Admin:** `admin@unicafe.in` / `Admin@12345`
- **Area Supervisor:** `supervisor@unicafe.in` / `Supervisor@12345`
- **Franchise Owner:** `franchise@unicafe.in` / `Franchise@12345`
- **Cafe Manager:** `manager.koramangala@unicafe.in` / `Manager@12345`
- **Cafe Staff:** `staff.koramangala@unicafe.in` / `Staff@12345`
- **Demo Customer:** `rahul@example.com` / `Customer@12345` (₹5,000 Recharge, 5,000 points, 150h active)

---

## 7. Health Checks & Verification

1. **Backend Health Check:**
   ```bash
   curl -I https://unicafe-backend.onrender.com/health
   # Response: HTTP/2 200 OK {"status":"ok","service":"unicafe-backend","database":"connected"}
   ```
2. **Frontend Public Pages:**
   - Homepage: `https://<VERCEL_APP>/`
   - Menu & Pre-Ordering: `https://<VERCEL_APP>/customer/menu`
   - Customer Portal: `https://<VERCEL_APP>/customer/dashboard`
   - Staff Order Terminal: `https://<VERCEL_APP>/staff/orders`
3. **Automated Business Logic Verification:**
   - All 31 tests passing locally.
