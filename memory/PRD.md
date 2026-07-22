# Procurement App — PRD & Status

## Original Problem Statement
Import & run PROCUREMENT repo (SUBBALO/PROCUREMENT), then iterate 13 features (batched into 3 batches). ALL 13 features now implemented.

## Architecture
- **Backend**: FastAPI + Motor MongoDB + cookie-JWT. Split: db.py, security.py, deps.py, models.py, routers/{auth,transactions,store,orders,ai}.py. server.py = 124-line bootstrap.
- **Frontend**: React 19 + Craco + Tailwind + Shadcn + Router 7. AppShell has role-based 3-row header for admin.
- **LLM**: Gemini 3 Flash via emergentintegrations + EMERGENT_LLM_KEY for PO auto-read.
- **Language**: Indonesian.

## Roles
- **admin** (susanto=primary, erwin=secondary) — full + 3-row header (Purchasing / Store / Admin)
- **staff** — purchasing writes + parse-PO
- **store** — store ops + delivery + Master SO read-only
- **finance** — read-only + prices + incoming report

## Multi-Currency (IDR/SGD/USD)
`currency` + `exchange_rate` on transactions → server auto-computes `total_price_idr`. Master List shows both currency price and IDR total.

## Modules
- Auth, Users, Activity Log
- Transactions CRUD + bulk + **bulk-delete** + Excel import (force post_to_store=false) + Excel export
- **Auto-Read PO** via Gemini 3 Flash (JPG/PNG/WEBP/PDF)
- Master vendors, Master items
- KPI Purchasing (On Time 40% + Compliance 35% + Completion 25%)
- Dashboard: annual summary + **monthly summary card** (current month IDR total + tx + PO count)
- Store:
  - Pending PO + grouped
  - **Terima dari PO Purchasing** — per-item add_to_stock + auto-update source transaction (invoice_no + receive_date)
  - **Input Incoming Goods** multi-item + add_to_stock toggle
  - **Laporan Incoming Goods** unified report (PO + manual) + MCL/MIF toggle
  - FIFO Issue, Stock, Production issue (endpoint retained, menu removed)
  - Edit/Delete Request workflow, Excel export
- **Sales Orders** CRUD + **Excel upload** + visible to store role read-only
- **Deliveries** — multi-item + autocomplete Tujuan/Supir + Nomor SO per item + flat list view with SO search
- **SO Autocomplete** across Input Transaksi, Deliveries, Input Incoming Goods

## Endpoints Added (iter 4)
- `GET /api/stats/monthly` — current month total IDR + tx + PO count
- `GET /api/deliveries/autocomplete` — distinct destinations + drivers
- `POST /api/sales-orders/import/xlsx` — bulk create SOs from Excel (skip duplicates)
- `POST /api/transactions/parse-po` — Gemini 3 Flash vision parser (admin+staff only)
- `POST /api/transactions/bulk-delete` — checkbox bulk delete
- `POST /api/store/incoming` — multi-item Input Incoming Goods
- `GET /api/store/incoming-report` — unified receipts report

## Seed Data
- susanto (admin), erwin (admin), staff01, store01, finance01
- 8 mixed-currency transactions (IDR/SGD/USD), 4 SOs
- Reset via `python /app/backend/seed_data.py`

## Test Credentials
See `/app/memory/test_credentials.md`. Primary admin: **susanto / admin123**.

## Test Results
- iter 1: 33/33 (post-import)
- iter 2: 44/44 (post-refactor + authz)
- iter 3: 65/65 (Batch 1: multi-currency + incoming goods + bulk-delete)
- iter 4: **86/86** (Batch 2 + 3: monthly + delivery multi-item + SO import + parse-po Gemini)

## Env Vars
- MONGO_URL, DB_NAME, CORS_ORIGINS (preserved)
- JWT_SECRET, ADMIN_USERNAME=susanto, ADMIN_PASSWORD
- **EMERGENT_LLM_KEY** (for parse-PO via Gemini 3 Flash)

## Backlog (post-13-features, optional)
- P2: Split routers/store.py (~800 lines) into receipts/issuances/requests
- P2: Batch SO import lookups via $in query for large uploads
- P2: Dashboard Grouped-per-currency toggle (view exposure per FX)
