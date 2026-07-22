# Procurement App — PRD & Status

## Original Problem Statement
Import & jalankan repo PROCUREMENT (SUBBALO/PROCUREMENT). Stack asli sudah React + FastAPI + MongoDB, jadi tidak perlu porting — hanya import + install + jalankan.

## Architecture
- **Backend**: FastAPI (Python) with async Motor MongoDB driver, JWT cookie-based auth (HttpOnly)
- **Frontend**: React 19 + CRA/Craco + Tailwind + Shadcn UI + React Router 7
- **Database**: MongoDB (single collection per entity: users, transactions, activity_logs, store_receipts, store_issuances, store_requests, deliveries, sales_orders)
- **Language**: Indonesian (UI + error messages)

## User Personas / Roles
1. **admin** — full access; can approve store requests
2. **staff** — input transaksi + view dashboard; blocked from admin pages
3. **store** — store operations only (receive/issue/stock); no price visibility; blocked from purchasing pages
4. **finance** — view-only, sees prices; blocked from write endpoints (403)

## Core Features (Implemented — imported from repo)
- Auth: login/logout/refresh, cookie-based JWT, role & perms enforcement
- Transactions (Purchase Records): CRUD + bulk create + filter/search/pagination
- Master data: distinct vendors, items (with last price / last vendor)
- KPI Report: On Time Delivery (40%), Compliance Quality (35%), PO Completion Rate (25%) with graded category
- Store Module:
  - Pending PO (post_to_store flagged) with per-item + grouped views
  - Receive (single + bulk) with over-receive protection
  - Manual receive (customer/supplier without PO) with customer material flag
  - Issue (FIFO by receive_date) with allocation tracking
  - Production issue (customer material only)
  - Stock aggregation (customer_only / exclude_customer filters)
  - Edit/Delete Request workflow with admin approval + rollback for FIFO
  - Excel export (Laporan Pengeluaran Stok)
- Sales Orders master: CRUD
- Deliveries log: create + list + delete
- Excel import/export for Transactions
- Activity Log / Audit Trail (admin-visible)
- Users management (admin only)

## Seed Data (as of 2026-02-22)
- 1 admin + 3 role-specific users (staff01, store01, finance01)
- 8 transactions across 3 vendors, spanning 30 days
- 4 sales orders
- 6 transactions flagged `post_to_store=true` (pending receive at Store module)

## What's Been Implemented (dated log)
- **2026-02-22**: Imported repo from GitHub, added JWT_SECRET / ADMIN_USERNAME / ADMIN_PASSWORD to backend .env, installed openpyxl + PyJWT, ran yarn install, seeded dummy data, verified via testing_agent — 33/33 backend tests passing, all frontend flows working.

## Backlog / Next Actions (P0/P1/P2)
- **P2**: Split `server.py` (1856 lines) into domain modules (auth, transactions, store, sales-orders, deliveries) — code health only, no functional impact.
- **P2**: Silence expected 401 from `/auth/me` probe in axios interceptor for unauthenticated pages.
- **P2**: Decide if `store` role should be blocked from POST /api/transactions (currently only `finance` is blocked by `require_write`).
- **P2**: Add integration tests for Excel import/export and FIFO rollback (delete request approval).

## Test Credentials
See `/app/memory/test_credentials.md`.

## Env Vars (backend)
- MONGO_URL, DB_NAME (preserved)
- CORS_ORIGINS (preserved)
- JWT_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD (added)
