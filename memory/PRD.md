# Procurement App — PRD & Status

## Original Problem Statement
Import & run PROCUREMENT repo (SUBBALO/PROCUREMENT), then iterate 13 features (batched into 3 batches). ALL 13 features now implemented.

## Architecture
- **Backend**: FastAPI + Motor MongoDB + cookie-JWT. Split: db.py, security.py, deps.py, models.py, routers/{auth,transactions,store,orders,ai}.py. server.py = 124-line bootstrap.
- **Frontend**: React 19 + Craco + Tailwind + Shadcn + Router 7. AppShell has role-based 3-row header for admin.
- **LLM**: Google Gemini `gemini-flash-latest` via **google-genai** SDK (direct API, key format `AQ.Ab8...` w/ X-goog-api-key header) for PO auto-read.
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
- **GEMINI_API_KEY** (user's Google AI Studio key — direct SDK, no Emergent key needed for parse-PO)

## Changelog (Fork Session — 2026-02)
- ✅ **[FIXED] AI Parse PO 500 Error**: Migrated from deprecated `google.generativeai` SDK (URL-based `?key=` auth incompatible with new `AQ.` key format) → **`google-genai` v2.12** SDK (uses `X-goog-api-key` header). Model: `gemini-flash-latest`. Verified end-to-end with dummy PO → returns valid JSON with vendor/PO/items.
- ✅ Verified black button "Tarik dari PO Purchasing →" already in `/app/frontend/src/pages/StoreManualReceivePage.jsx` (line 113-121).
- ✅ **Menu Koreksi Rework (Task B)**: Structured Edit dialog (radio Edit/Hapus, field dropdown Qty/SO/Taker, readonly old value, editable new value). Admin approval auto-applies changes: `so_number`/`taker_name` → direct update; `qty` → proportional FIFO allocation scaling with receipt qty_remaining sync (rejects if insufficient stock). Delete path also refunds stock. Verified in `/app/test_reports/iteration_14.json` (12/12 pass).
- ✅ **Kategori Transaksi (Feature C)**: Added `category` free-text field to TransactionBase (default 'Uncategorized'). New /master/categories autocomplete endpoint. Input Transaksi column order reworked: `# | Item(Kategori) | Description(NamaBarang) | Qty | Unit | UnitPrice | TotalPrice | NomorSO | KeStore | X`. Master List has new Kategori column with badge. Excel import/export includes Kategori column (defaults 'Uncategorized' if missing).
- ✅ **Print MCL (Feature D)**: GET /api/store/incoming/mcl/{receipt_id} groups receipts by (vendor,po,do,invoice,receive_date), fills `/app/backend/assets/mcl_template.xlsx` template preserving A55='MKS-F-STR-004#Rev.00' doc register. Frontend adds Print button per row in Laporan Incoming Goods (new 'Aksi' column).
- ✅ **Bill of Material (Feature E)**: New /bom module. `boms` collection stores every revision. `POST /api/bom/upload` (multipart: file + `prepared_by` **required** + `revision_reason` optional) parses .xls (via xlrd 1.2.0) and .xlsx (openpyxl). Auto-detects existing SO → returns HTTP 409 with structured `{code, so_no, latest_rev, latest_uploaded_by, latest_uploaded_at, latest_prepared_by, message}`; frontend catches and reveals inline reason input. `prepared_by` captured manually because Engineering shares one login (7 people). `GET /bom/preparers` autocomplete. `GET /bom?q=...` fuzzy substring search across so_no/customer/project_name (case-insensitive). GET /bom/history/{so_no} shows revision log. PATCH /bom/{id}/annotations (admin-only) for Available Stock / Qty Purchase / Purchase Due Date / Admin Remark. New role **engineering** (seed: `engineer01`/`eng123`) — access ONLY to /bom (ProtectedRoute redirects). BOM detail meta card highlights Prepared By, Tanggal Upload, Diupload oleh. History dialog shows Pembuat BOM column. Admin remark cell uses auto-grow textarea (ref-based scrollHeight sync) so long text is fully visible without hover. Verified iter15+16 (23 tests total, 100% pass).
- ✅ **Plan Delivery Date (Bonus)**: `plan_delivery_date` field added to TransactionBase. New input in Input Transaksi header (between Tanggal PO and Tanggal Terima). New column in Master List (between SO/PO and Qty). Excel export includes 'Plan Delivery' column.

- ✅ **Sales Inquiry Costing Workflow (Phase 1)**: Full state machine `draft → submitted → in_progress → awaiting_review → (accepted | revision_requested loop) → closed`. Backend router `/api/inquiries` dengan:
  - Sales create dengan multiple items + attachments upload ke MongoDB GridFS
  - Draft mode (save-as-draft) sebelum submit
  - Auto-generate nomor `INQ-001/MKS/VII/2026` (reset counter tiap bulan, Roman month)
  - Engineering accept dengan PIC engineer name wajib (multi-collab OK)
  - Engineering upload response files + note → complete
  - Sales review Accept atau Request Revision (loop back to in_progress)
  - Notification badge `/api/inquiries/pending-count` per role
  - History log semua transisi state
- ✅ **Quotation entity (Phase 1)**: Backend `/api/quotations` create/list/get/status. Auto-generate nomor `001/MKS/Q/VII/2026` (reset bulanan). Field manual: customer, attention, cc, items, notes, terms, signature. **PDF generator + kop surat overlay** = Phase 2 next task.
- ✅ **Header cleanup**: Landing page `/` sekarang header MINIMAL (hanya logo + user + logout, semua menu dept dropdown/BOM/Master SO/Persetujuan disembunyikan). Logo brand `MKS Management System` klik = kembali ke landing (home).
- ✅ **BOM table layout refinement**: Stock/Qty Purchase columns compact (w-16), Admin Remark column enlarged (min-w-[280px]).

## Pending Tasks
- **P0 — Advanced Quotation features (nice-to-have)**: PDF preview modal in-app (currently just direct download); email quotation link.
- **P2 — QC Module**: Inspection incoming, approve/reject material before stock post, non-conformance report.
- **P3 — Refactor router besar (`store.py` 1155 lines, `transactions.py` 561 lines)** — DEFERRED. Rasio risk/value tinggi. Rekomendasi: split ke sub-package (`routers/store/{receipts,issuances,requests,reports}.py`) sebagai iterasi tersendiri dengan test regression menyeluruh sebelum & sesudah refactor.
- Retention: auto-purge job saat ini manual-trigger (`POST /api/admin/trash/auto-purge`). Bisa dijadikan cron (APScheduler) nanti.

## Recent Additions (Feb 2026 — Iter 22)
- ✅ **PDF Quotation Generator** dengan kop surat resmi PT MITRA KARYA SARANA (letterhead PNG sebagai background A4). Layout mirror Excel template user (Title, Customer+Meta, Attention/CC, Intro, Items table, Notes, Grand Total, In Words EN+ID, Term & Conditions, Signature). Endpoint: `GET /api/quotations/{id}/pdf`. Tombol "Download PDF" di QuotationDetailDialog.
- ✅ **Recycle Bin / Soft Delete** untuk 11 koleksi (transactions, sales_orders, store_receipts, store_issuances, store_requests, deliveries, boms, inquiries, quotations, customers, users). Setiap DELETE sekarang menge-set `deleted_at`, `deleted_by`, `deleted_by_name`. Semua LIST/aggregation queries di-filter agar soft-deleted tidak tampil. Login user yang soft-deleted otomatis diblokir.
- ✅ **Recycle Bin API** (Super Admin): `GET /api/admin/trash/summary` · `GET /list?collection=X` · `POST /restore {collection,ids}` · `POST /purge {collection,ids,confirm_phrase="PURGE-FOREVER"}` · `POST /auto-purge` (hapus permanen > 30 hari).
- ✅ **Recycle Bin UI**: tab baru "Recycle Bin" di `/admin` (khusus Super Admin). Strip 11 tab koleksi dengan count. Multi-select restore & purge. Konfirmasi phrase untuk purge.

## Recent Additions (Feb 2026 — Iter 20/21)
- ✅ Engineering Costing Workflow UX: SalesPage adapts header ("Engineering — Costing Requests") when role=engineering; back link to `/engineering`.
- ✅ Buat Quotation dari Inquiry: after Sales accepts inquiry, "Buat Quotation dari Inquiry" button navigates to `/sales/quotations?from_inquiry=<id>` and auto-prefills CreateQuotationDialog with customer + items.
- ✅ Bug fix: CreateQuotationDialog was crashing due to undefined `cc` state — now properly declared.
- ✅ Quotation items table: added Unit Price + Total column (previously only Description/Qty/Unit).
- ✅ Sales/Engineering Dashboard Stats (`GET /api/sales/stats`): 8-cell grid for Inquiries (Total/Draft/Terkirim/Dikerjakan/Menunggu Review/Accepted/Minta Revisi/Closed) and 4-cell grid for Quotations (Total/On Bidding/Confirm/Cancel).
- ✅ Excel Export: `GET /api/inquiries/export/excel` and `GET /api/quotations/export/excel` with styled headers and role-based visibility. Buttons in Sales & Quotation pages.
- ✅ Purchasing KPI card restored on `/` Purchasing Portal (was accidentally removed after portal restructure).
- ✅ Super Admin Backup & Reset tab: Export JSON, Import (merge/replace + RESTORE-CONFIRM phrase), Wipe database (WIPE-ALL-DATA phrase + optional keep-users). Endpoint `POST /api/admin/backup/wipe` gated by `require_super_admin`.
- ✅ Non-admin visiting `/admin` now redirects to `/` (no more spam error toast).

## Backlog (post-13-features, optional)
- P2: Split routers/store.py (~800 lines) into receipts/issuances/requests
- P2: Batch SO import lookups via $in query for large uploads
- P2: Dashboard Grouped-per-currency toggle (view exposure per FX)
