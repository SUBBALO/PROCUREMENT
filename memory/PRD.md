# Procurement App — PRD & Status

## Original Problem Statement
Import & jalankan repo PROCUREMENT (SUBBALO/PROCUREMENT). Kemudian iterate 13 fitur besar dari user (batched into 3 batches).

## Architecture
- **Backend**: FastAPI (Python) + Motor MongoDB + cookie-based JWT auth. Split into `db.py`, `security.py`, `deps.py`, `models.py`, `routers/{auth,transactions,store,orders}.py`. `server.py` is a 122-line bootstrap.
- **Frontend**: React 19 + Craco + Tailwind + Shadcn + React Router 7
- **Database**: MongoDB
- **Language**: Indonesian UI + errors

## Roles
1. **admin** (susanto=primary, erwin=secondary) — full access + approve store requests + direct toggle add_to_stock on receipts
2. **staff** — purchasing writes (transactions + SO); no admin/store operations
3. **store** — store ops only; no purchasing writes; no price visibility
4. **finance** — read-only including prices; can view Incoming Report

## Multi-Currency (iter 3)
Transactions carry `currency` (IDR|SGD|USD) + `exchange_rate` (multiplier to IDR). Server auto-computes `total_price_idr = total_price × exchange_rate`. IDR is default & rate forced to 1. Master List shows `unit_price` with currency label + IDR total.

## Modules Implemented
- Auth (login/logout/refresh/me), Users CRUD + Activity Log (admin only)
- Transactions CRUD + bulk create + **bulk delete** + Excel import/export
- Master data (distinct vendors, items with last price/vendor)
- KPI Purchasing (On Time 40%, Compliance 35%, Completion 25%)
- Store Module:
  - Pending PO + grouped view
  - **Terima dari PO Purchasing** (GRN) — bulk + per-item add_to_stock + auto-update source transaction with invoice_no & receive_date
  - **Input Incoming Goods** (multi-item, replaces single Manual Receive) — per-item add_to_stock toggle
  - **Laporan Incoming Goods** — unified report (PO + manual sources) with MCL/MIF toggle
  - FIFO Issue (bulk + single), Stock aggregate, Production issue (endpoint retained, menu removed)
  - Edit/Delete Request workflow + rollback on approve
  - Excel export Laporan Store
- Sales Orders CRUD
- Deliveries create/list/delete

## Seed Data (2026-07-22)
- Users: susanto (admin), erwin (admin), staff01, store01, finance01
- 8 mixed-currency transactions (6 IDR, 1 SGD, 1 USD)
- 4 Sales Orders

## Test Credentials
See `/app/memory/test_credentials.md`. Primary admin: **susanto / admin123**.

## Progress Log
- 2026-07-22: Imported repo, seeded, tests 33/33
- 2026-07-22: Refactored server.py (1856→122 lines) + fixed store-role authz gap. Tests 44/44
- 2026-07-22: **Batch 1 complete** — #4 remove production menu, #12 multi-currency, #1 Input Incoming Goods, #5 GRN auto-update, #8 bulk delete + import fix. Tests 65/65.

## Backlog

### Batch 2 (report + UX)
- #2 Laporan Incoming Goods page (backend DONE, frontend page DONE — pending polish)
- #3 Pengiriman: autocomplete Tujuan/Supir + multi-item + Nomor SO per item + list view w/ SO column & search
- #6 Master SO visible di Store (read-only) + upload Excel SO
- #10 SO autocomplete di semua menu (auto-suggest saat ketik SO no → tampil customer+desc)
- #11 Login form geser atas (form saat ini terlalu ke bawah)
- #13 Dashboard: total pembelian bulan ini (tgl 1 s.d. hari ini) + jumlah PO
- #9 Header 3-baris untuk admin (row1=purchasing, row2=store, row3=persetujuan+log)

### Batch 3 (integration)
- #7 Auto-read PO dari JPG/PDF via **Gemini 3 Flash** (via Emergent LLM key)

## Env Vars
- MONGO_URL, DB_NAME, CORS_ORIGINS (preserved)
- JWT_SECRET, ADMIN_USERNAME=susanto, ADMIN_PASSWORD
