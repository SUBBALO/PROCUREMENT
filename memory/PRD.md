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

## Recent Additions (Feb 2026 — Iter 22 · Batch 1 Improvements)
### #10 Activity Log Viewer
- ✅ Filter Entity/Modul ditambahkan (transaction, bom, quotation, inquiry, sales_order, delivery, user, auth) di AdminPage LogsTab.
- Backend endpoint `GET /api/auth/logs` sudah support param `entity` sebelumnya.

### #6 Inventory / Stock Level Alert
- ✅ Collection baru: `store_reorder_points` (`{item_name, min_qty, unit, note}`).
- ✅ Endpoints:
  - `GET /api/store/reorder-points` — list dengan current_qty + is_below_min per item
  - `POST /api/store/reorder-points` — upsert min threshold
  - `DELETE /api/store/reorder-points/{id}` — soft delete
  - `GET /api/store/low-stock` — items yang stok saat ini < min
- ✅ StoreStockPage overhaul: banner alert merah untuk item di bawah min, kolom "Min" & "Aksi", dialog untuk set/edit/hapus minimum.
- ✅ Role rules: super_admin/admin/supervisor/store bisa edit min, semua role dengan store access bisa lihat.

### #1 Dashboard Analytics per Departemen
- ✅ Sales & Quotation stats sudah ada inline (per-status count cards) di SalesPage & QuotationPage.
- ✅ Baru: Panel "Total Nilai Quotation per Status" di QuotationPage — grid 3 kolom (On Bidding/Confirm Order/Cancel), breakdown per currency (IDR/USD/EUR).
- Endpoint `/api/sales/stats` return `values_by_status: {status: {currency: total}}` sudah ada.

### #2 Event-Based Notifications
- ✅ Notification aggregator (`/api/notifications`) ditambahkan 3 kategori baru:
  1. **low_stock** (critical) — untuk role store/admin/purchasing: items di bawah minimum.
  2. **bom_new_unpurchased** (info) — untuk purchasing/admin: BOM baru (7 hari terakhir) yang belum ada transaksi pembeliannya (project_no match).
  3. **inquiry_stagnant** (warn) — untuk sales/admin: inquiry submitted > 5 hari tanpa progress.

### #4 Export Report
- ✅ Endpoint baru: `GET /api/store/movements/export/xlsx?start_date=&end_date=` — Excel 3-sheet:
  - Sheet 1: Penerimaan (tanggal, item, vendor, PO, qty, batch info)
  - Sheet 2: Pengeluaran (tanggal, item, qty, tujuan, pengambil, catatan)
  - Sheet 3: Ringkasan (net movement per item: in - out)
- ✅ Tombol "Export Movement" di StoreStockPage.

### SO Number Normalization (Iter 22 preparation)
- ✅ Function `normalize_so_no` di `routers/bom.py`: SO murni angka → strip leading zero (`005221` → `5221`), alphanumerik tetap.
- ✅ Diterapkan di: BOM upload, BOM search, Master SO create/update, Transaction create/update/bulk/import.
- ✅ Backfill: 1 BOM & 1 SO ternormalisasi. 
- ✅ Auto-create Master SO saat BOM diupload (idempotent, tag `source: bom_upload`).

### Landing Page Light Theme + Compact Layout
- ✅ LandingPage & DeptPortal dari dark (bg-slate-950) → light (bg-slate-50).
- ✅ Grid 5-column pada lg screen → 5 departmen muat 1 layar tanpa scroll.

### BOM Purchase History with Role-Based Price Hiding
- ✅ Endpoint `GET /api/bom/{id}/purchases` dengan role rules:
  - super_admin/admin/supervisor/finance/eng_head/eng_staff/sales/purchasing: full visibility
  - store: harga (unit_price, total_price, currency, total_price_idr, exchange_rate) DIHAPUS dari response, flag `price_hidden: true`
- ✅ BomDetail component menampilkan tabel Riwayat Pembelian dengan indicator jika price hidden.

### Excel 97-2003 (.xls) Support
- ✅ `_read_workbook` di `bom.py`: xlrd 1.2.0 untuk .xls, openpyxl untuk .xlsx/.xlsm.
- ✅ Magic byte fallback (OLE2 `d0cf11e0` untuk .xls, ZIP `PK\x03\x04` untuk xlsx) bila extension hilang/salah.
- ✅ Frontend accept mime types lengkap.

## Pending / Backlog After Batch 1
### Batch 2 (approved, not yet started)
- P1: **#3 Cross-Module Linking / Deep Search** — global search (⌘K), clickable SO drill-down ke semua data (inquiry/quotation/BOM/purchases), SO Timeline view.
- P1: **#5 Vendor Management Module** — master data vendor, history transaksi, rating performa, comparison harga.

### Batch 3 (approved, lower priority)
- P2: **#7 Design System consistency** — standardisasi border-radius, warna per action, toast pattern
- P2: **#8 Bulk actions & keyboard shortcuts** — bulk edit BOM items, ⌘K search, keyboard shortcuts (N/E/Esc)
- P2: **#9 Data Import Improvements** — preview before commit, better error line reporting, undo last import

## Recent Additions (Feb 2026 — Iter 23 · Fork Session)
### Store — Consumable Good Request module (P0 delivered)
- ✅ Backend `/app/backend/routers/consumable_requests.py`: full CRUD (`GET/POST/PATCH/DELETE /api/consumable-requests`) + `POST /consumable-requests/{req_id}/items/{item_id}/mark-purchased` (records vendor, PO, actual item name, qty bought). Auto status transition open → partial → fulfilled when all items purchased. Endpoint `GET /consumable-requests/open-items` for flat list of unpurchased items.
- ✅ Frontend `/app/frontend/src/pages/ConsumableRequestPage.jsx` (route `/store/consumable-requests`): list, create dialog (multi-item), detail dialog with Tandai Dibeli form (vendor, PO, qty, purchase date).
- ✅ Store Portal card `Consumable Good Request` (icon ClipboardText, teal accent).

### Incoming Goods merger (P0 delivered)
- ✅ `/app/frontend/src/pages/IncomingReportPage.jsx` gets 2 shortcut cards: green **Input Manual** (opens `/store/manual-receive?embed=1` inside iframe modal) and blue **Tarik Data dari PO** (opens `/store/receive?embed=1`).
- ✅ `AppShell.jsx` detects `?embed=1` query and hides header + footer (chrome-less inside iframe).
- ✅ `StoreManualReceivePage.jsx` also detects `?embed=1` to hide BackLink and the "Tarik dari PO Purchasing" link (redundant inside modal).

### Landing Page — Document Control card (P1 delivered)
- ✅ Moved from Store portal to main Landing (`/`). Now 6 dept cards (grid-cols-6 on lg) inc. `Document Control` (Coming Soon).
- ✅ Roles: visible to everyone. Icon: FileText, slate accent.

### Login Page redesigned copy
- ✅ Left panel now shows:
  - **MKS Management System (ERP)** (bold)
  - Integrated Enterprise Resource Planning System
  - Sales • Engineering • Procurement • Store • Quality Control • Document Control

### Sales/Quotation Date Filter + Excel Export
- ✅ `/api/sales/stats` accepts `start_date` & `end_date` (already existed, now consumed by frontend).
- ✅ `/api/quotations/export/excel` extended with `start_date`, `end_date`, `status` filters. Backend filters `created_at` between the range.
- ✅ `/api/inquiries/export/excel` extended with `start_date`, `end_date` filters.
- ✅ `QuotationPage.jsx` and `SalesPage.jsx`: `monthFilter` (YYYY-MM) now derives `start_date`/`end_date` (first & last day of month) and passes to both `/sales/stats` and export endpoints.

## Recent Additions (Feb 2026 — Iter 24 · Bulk Transaksi + Consumable Link)

### Bulk Transaksi (Langsung) — new menu (P0 delivered)
- ✅ Route `/purchasing/bulk` (blocked for finance). Card di Purchasing Portal (Lightning icon).
- ✅ Spreadsheet grid dengan 13 kolom: Tanggal, SO No, PO No, Supplier*, Nama Barang*, Qty*, Unit, Unit Price, Total Price (auto = qty × unit_price), Invoice, Masuk Stok?* (Ya/Tidak), Aksi.
- ✅ Enter navigation: cell → next cell → di cell terakhir Enter = baris baru.
- ✅ Autocomplete: SO dari Master SO, Supplier dari `master/vendors`, Nama Barang dari `master/items`.
- ✅ Backend `POST /api/transactions/bulk-direct`: buat transaksi + store_receipt sekaligus (`source='bulk-direct'`, bypass persetujuan Store). Wajib `masuk_stok` (bool). Row tetap dibuatkan receipt walau `masuk_stok=false` (audit trail, `add_to_stock=false`).
- ✅ Save behaviour: baris tersimpan diberi highlight ✅ + disabled + baris baru auto-append. Tombol Simpan menunjukkan count baris valid.

### Consumable Request ↔ Transaksi linking (P0 delivered)
- ✅ Model `Transaction` tambah 2 field opsional: `consumable_request_id`, `consumable_request_item_id`.
- ✅ Helper `link_purchase_to_request` / `unlink_purchase_from_request` di `consumable_requests.py`. Idempotent (keyed by transaction_id).
- ✅ Hook di `create_transaction`, `bulk_create`, `bulk_direct_create` → auto-call link.
- ✅ Hook di `delete_transaction` → auto-call unlink (revert item to open/partial).
- ✅ UI: tombol "🔗 Tarik dari Consumable Request" di Bulk Transaksi buka modal picker dengan search + Check All + item list. Item terpilih di-append ke tabel dengan link tersimpan; nama barang & supplier tetap editable.
- ✅ Row linked ditandai emoji 🔗 di kolom #.

### Consumable Request Table Improvements
- ✅ Kolom baru "Description Singkat" — join nama-nama item (max 3 + "+N lainnya").
- ✅ Sortir dropdown: Tanggal (Baru→Lama / Lama→Baru), Request By (A→Z / Z→A), Status, Jumlah Item.
- ✅ Enter navigation di dialog Request Baru: Description → Qty → Unit → SO → Remarks → Enter di Remarks = baris baru (auto-focus baris baru).

### Input Transaksi Pembelian — Catatan
- ✅ Textarea "Catatan Transaksi" di bawah tabel item (sebelum tombol Simpan). Isi opsional — di-prepend ke setiap item's `notes` saat submit.
- ✅ BackLink ditambahkan di header (sebelumnya tidak ada).
- ✅ Tombol "Tarik dari Consumable Request" di header — buka modal picker checkbox (search, Check All, multi-select). Item terpilih di-append sebagai baris baru di form dengan `consumable_request_id`/`item_id` tersimpan. Saat submit → auto link/mark-purchased.
- ✅ Tombol "Tarik DO Belum PO" di header — untuk kasus barang datang duluan (Store terima manual tanpa PO), PO dibuat belakangan. Modal picker: filter vendor + search + Check All. Setelah dipilih & save transaksi → backend `_link_receipt_to_tx` update `store_receipts.transaction_id / po_no / invoice_no` (close-out). Delete transaksi → auto-reopen receipt.
- ✅ Backend endpoint baru `GET /api/store/receipts/pending-po` — list receipt manual/bulk-direct yang `transaction_id=null` dan `po_no=""`.

### Reusable Sort Dropdown across ALL major list pages
- ✅ Component baru `/app/frontend/src/components/SortDropdown.jsx` dengan helper `sortItems()`, `cmpStr()`, `cmpDateStr()`, `cmpNum()`.
- ✅ Dropdown "Urutkan" diterapkan di: Consumable Request, Quotation, Sales/Inquiries, Master List Transaksi, Incoming Goods Report.
- Setiap halaman punya preset sort keys sesuai kolom-nya (tanggal ASC/DESC, nama A→Z / Z→A, total besar→kecil, dst).

### Consumable Request — Unit Dropdown
- ✅ Unit field per item sekarang dropdown dengan opsi standard: Ea, Pcs, Set, Lot, Kg, Ltr, Mtr, Box, Roll, Can, Pack, Meter (sama dengan Input Transaksi Pembelian).

### Testing
- iter5: 15/15 backend pytest PASS (bulk-direct, validation, link, unlink, finance 403), frontend Playwright PASS. Report: `/app/test_reports/iteration_5.json`. Suite: `/app/backend/tests/test_iter5_bulk_direct.py`.
- iter6: 8/8 backend pytest PASS (pending-po endpoint, single/bulk tx close-out, delete revert), frontend Playwright PASS untuk DO Belum PO picker. Report: `/app/test_reports/iteration_6.json`. Suite: `/app/backend/tests/test_iter6_do_belum_po.py`.
- iter7: Comprehensive regression + Document Control restriction + Sort dropdowns SOMaster/BOM/Delivery/Store Stock. 100% PASS (9/9 backend endpoints, 11/11 frontend flows). Report: `/app/test_reports/iteration_7.json`.

### iter-27 additions (Sortir + Document Control)
- ✅ Sort dropdown ditambah ke: SOMaster (`/so-master`), BOM (`/bom`), Delivery (`/deliveries`), Store Stock (`/store/stock`). Store Stock default = "Prioritas: Under-Min Dulu".
- ✅ Landing Page: Document Control card sekarang hanya visible untuk role admin/super_admin/supervisor. Store role (khairul) tidak lagi melihatnya.
- 🔮 Future: role dedicated "salma" akan ditambahkan untuk Document Control department (menunggu instruksi user).

### iter-28 additions (Produksi Coming Soon)
- ✅ Kartu baru "**Produksi**" (icon Factory, warna orange) di Landing Page — Coming Soon, visible untuk semua role.
- ✅ Grid Landing diubah ke 4 kolom (lg): Baris 1 = 4 aktif (Sales/Engineering/Purchasing/Store), Baris 2 = 3 Coming Soon (Quality Control / Document Control / Produksi).
- ✅ Login page tagline diupdate: "Sales • Engineering • Procurement • Store • Quality Control • Document Control • **Produksi**".

### iter-29 additions (Quotation Stats Enhanced + Date Range)
- ✅ Section "Total Nilai Quotation per Status" di QuotationPage sekarang menampilkan **3 metrik per status** (On Bidding / Confirm Order / Cancel): jumlah Quotation, jumlah Perusahaan unik, dan Nilai total per currency.
- ✅ Filter bar QuotationPage: tambah **Dari Tanggal** & **Sampai Tanggal** (default: tgl 1 bulan ini → hari ini). Berdampingan dengan "Bulan (cepat)" — bulan overrides range jika terisi. Stats auto-update saat tanggal berubah.
- ✅ Halaman SalesPage juga dapat card ringkasan quotation dengan 3 metrik (opsional, bila stats.quotations tersedia).

### iter-32 additions (Costing Store 2-tab + Landing Footer + Combined Export)
- ✅ **Costing Store** (`/store/report`) sekarang punya 2 tab:
  - **Stok Keluar (Issue)** — existing FIFO dengan harga per allocation
  - **Stok Masuk (Incoming)** — baru: list semua receipt yang `add_to_stock=true` (Accounting requirement)
- ✅ **Export Gabungan** (1 tombol hijau) → 1 file Excel dengan 3 sheet:
  - Sheet "Stok Masuk" (14 kolom + total)
  - Sheet "Stok Keluar" (10 kolom + total)
  - Sheet "Ringkasan" (period, total masuk, total keluar, selisih, dibuat oleh, waktu)
- ✅ Backend: `GET /api/store/report/combined-xlsx?start_date=&end_date=` — Accounting hanya butuh 1 file.
- ✅ Backend `/store/incoming-report` & `/xlsx` support param `add_to_stock=true/false`
- ✅ **Landing Page footer**: teks branding 4 baris center — MKS Management System (ERP) · Integrated Enterprise Resource Planning System · daftar 7 modul · Developed by Purchasing Department © tahun — PT. Mitra Karya Sarana

### iter-31 additions (Consumable Request — Edit/Delete + Approval Workflow)
- ✅ Tombol **Edit** (biru) & **Hapus** (merah) di header Detail Dialog Consumable Request.
- ✅ **EditDialog** — form full editable (tanggal, requester, catatan, tabel items dengan Unit dropdown). Item yang sudah `purchased` tidak bisa dihapus (validasi disable).
- ✅ **Logika Otorisasi:**
  - `admin`/`super_admin`/`supervisor` → edit/hapus **langsung berlaku** tanpa approval
  - `store` (bukan creator) atau status ≠ open → **submit permintaan** ke collection `consumable_request_approvals` (status=pending); admin lihat & approve/reject
  - `store` yang creator sendiri + status=open → **self-serve**, edit langsung
  - Role lain → tombol Edit/Hapus tidak muncul
- ✅ **Backend endpoints baru:**
  - `PATCH /api/consumable-requests/{id}` (role-aware, direct atau pending)
  - `DELETE /api/consumable-requests/{id}` (role-aware)
  - `GET /api/consumable-requests/approvals?status=` (approver lihat semua, store lihat sendiri)
  - `POST /api/consumable-requests/approvals/{id}/approve` (approver-only)
  - `POST /api/consumable-requests/approvals/{id}/reject` (approver-only, alasan **wajib**)
- ✅ **Fix Portal Focus**: Modal Cari & Link Transaksi diangkat state-nya ke parent page (lifted state), jadi tidak lagi ter-clip parent Radix Dialog & input bisa diketik + tombol X clear bekerja.
- 🔮 TODO iterasi berikutnya (untuk approver): banner "N Permintaan Menunggu" + panel/modal Approve/Reject di UI.

### iter-30 additions (Consumable Request — Retroactive Linking)
- ✅ Tombol lama **"Tandai Dibeli" DIHILANGKAN** dari Consumable Request detail dialog (kolom Aksi) — data pembelian sekarang otomatis dari Bulk Transaksi / Input Transaksi via link mechanism.
- ✅ **"Cari & Link Transaksi"** (tombol biru — satu-satunya cara linking): buka modal via `ReactDOM.createPortal` (render di document.body supaya tidak ter-clip parent Dialog). Modal list transaksi existing, filter fuzzy + rentang hari 30/60/90/180/365. Klik "Link" per row → transaksi di-tag `consumable_request_id/_item_id`, item request dapat purchase entry.
- ✅ Backend baru: `GET /api/consumable-requests/search-transactions?q=&days=` + `POST /consumable-requests/{req_id}/items/{item_id}/link-transaction`.
- ❌ Opsi "Tandai Dibeli di Luar Sistem" (offline) — **dihapus** (per request user, konsistensi data lebih penting).




### iter-31 (Feb 2026) — Form Template Designer + PRODUCTION card + Costing Store Date Preset
- ✅ **Landing Page role-fix**: "Produksi" card hidden dari role Store (`khairul`) — sekarang hanya `admin`/`super_admin`/`supervisor`/`production` yang lihat.
- ✅ **Rename**: "Produksi" → **"PRODUCTION"** (kartu + footer landing & login pages).
- ✅ **Date Range Presets** untuk Costing Store Excel Export (`StoreReportPage.jsx`): 5 tombol quick pick (Hari Ini · Minggu Ini · Bulan Ini · Bulan Lalu · Tahun Ini) + Reset Tanggal + badge periode aktif di tombol Export.
- ✅ **Form Template Designer (BIG)**: Visual A4 drag-drop editor (ala Accurate) untuk desain form cetak.
  - Backend: router baru `/app/backend/routers/form_templates.py` + collection `form_templates` (JSON elements) + reportlab render engine
  - Endpoints: `GET/POST/PATCH/DELETE /api/form-templates`, `POST /{id}/render`, `POST /{id}/preview`, `GET /bindings/{code}`, `GET /by-code/{code}/active`
  - Element types: `text`, `field` (data-bound via binding path), `logo`, `image`, `rect`, `line`, `table` (multi-column w/ rows_source)
  - Frontend: `/admin/form-templates` (list + duplicate/preview/delete) & `/admin/form-templates/:id` (drag-resize canvas pakai `react-rnd`)
  - Properties panel: posisi/ukuran mm, font size, align, bold/italic, binding dropdown dari schema, table column editor
  - Zoom 30-200%, grid 10mm, preview PDF button
  - Access: **admin/super_admin/supervisor only** (di-enforce backend + UI blocked)
  - Seeded default MCL template (22 elements) via `seed_form_templates()` di startup
  - Bindings schemas untuk `MCL` & `SURAT_JALAN_STORE` di `FORM_BINDINGS` dict
- ✅ **MCL PDF integration**: `/api/store/incoming/mcl/{id}/pdf` sekarang cek `form_templates` (code=MCL, active), kalau ada pakai template engine baru; kalau tidak fallback ke layout legacy.
- Menu link baru: **Admin → Template Form (MCL, dll)** di top nav.



### iter-32 (Feb 2026) — Group Batch Edit + Approval Queue UI + Store-Receive Role Gate + MCL Row-Overlap Fix

**Group Batch Edit di Masterlist (P0 dari user):**
- ✅ Nomor PO & Nama Vendor di Masterlist sekarang **clickable** → buka modal batch-edit
- ✅ Modal group edit: tampilkan semua item satu grup (batch_id/po_no/vendor+date), edit inline (Item Name, Kategori, **SO No**, **PO No**, Qty, Unit, Harga, Catatan) + toggle **Masuk Stok** per baris + bulk toggle "Masuk Stok Semua"
- ✅ Save via `POST /api/transactions/bulk-update` → update tx + sync linked receipt (add_to_stock + qty_remaining)
- ✅ Auto-buat receipt baru jika belum ada linked_receipt saat user centang Masuk Stok
- ✅ Endpoints baru:
  - `GET /api/transactions/group?batch_id=|po_no=|vendor_name=&invoice_date=` — fetch grouped items + linked receipt info
  - `POST /api/transactions/bulk-update` — update banyak transaksi + sync receipt sekaligus
- ✅ Field baru `batch_id` (UUID) di setiap `transactions.bulk-direct` row + receipt untuk grouping akurat

**Admin Approval Queue UI (P1):**
- ✅ Banner + tombol "Approval Queue" di `ConsumableRequestPage.jsx` — muncul hanya untuk role admin/super_admin/supervisor kalau ada pending approvals
- ✅ Modal Queue: list semua permintaan edit/delete dari Store, summary diff, tombol Approve (satu klik konfirmasi) & Reject (wajib alasan)
- ✅ Reuse endpoint existing `/api/consumable-requests/approvals` + `/approve` + `/reject`

**Store Receive — Alur "Masuk Stok" ditentukan Purchasing (bukan Store):**
- ✅ **Backend**: field baru `should_stock` (bool, default True) di Transaction model — Purchasing/Admin decide upfront apakah item masuk stok atau hanya log Incoming Good
- ✅ Group Batch Edit "Masuk Stok" toggle sekarang tulis ke `tx.should_stock` (dan sync receipt jika ada)
- ✅ `GET /api/store/pending` sekarang return `should_stock` per item — Store lihat keputusan Purchasing
- ✅ `POST /api/store/receive/bulk`: jika role bukan super_admin/admin/purchasing, backend paksa `add_to_stock = tx.should_stock` (Store tidak bisa override)
- ✅ `StoreReceivePage.jsx`: kolom "Ke Stok?" checkbox **DIHAPUS** dari modal Terima Barang — diganti dengan **badge read-only** (Ya = hijau ✓, Log = abu-abu 🔒)
- ✅ Info banner: "Kolom Masuk Stok di-set oleh Purchasing/Admin di Master List — Store hanya konfirmasi barang datang."

**Barang tidak masuk stok tapi masuk laporan Incoming Good:**
- Endpoint `/api/store/incoming-report` return **SEMUA** `store_receipts` (log-only maupun stok) — sudah otomatis
- Item `add_to_stock=false` → `qty_remaining=0` → tidak muncul di Stock listing, tapi tetap di Incoming Good report

**MCL/MIF PDF fix — Row overlap saat > 14 items:**
- ✅ Root cause: `openpyxl.insert_rows()` tidak menduplikasi merged cell ranges → row ke-16+ tidak ter-merge → item name overflow ke area lain
- ✅ Fix: capture template row's merged ranges sebelum insert, lalu `merge_cells()` ulang untuk setiap baris baru
- ✅ Fix tambahan: set explicit row height (dari template atau default 20pt) supaya LibreOffice tidak collapse row baru ke 0
- ✅ Diverifikasi via curl: MCL PDF 31 items → semua tampil rapi di page 1 + footer di page 2


---

## Iter 28 (Feb 2026) — Quotation Preview WYSIWYG + Master Customer link

**Quotation Preview vs PDF layout mismatch (FIXED):**
- Sebelumnya: Preview modal hanya menampilkan teks polos "PT. MITRA KARYA SARANA" tanpa letterhead, kolom "UNIT PRICE" / "TOTAL PRICE", footer "TOTAL" saja
- PDF asli: letterhead lengkap (logo, orange bar, UKAS/SGS/KAN badges), kolom "Unit Price (IDR)" / "AMOUNT (IDR)", "GRAND TOTAL" bar hitam, "Thank you for your inquiry..." intro, closing "We trust..."
- ✅ Copy `letterhead.png` ke `/app/frontend/public/letterhead.png` supaya frontend bisa akses
- ✅ Rewrite `QuotationPreviewDialog` di `QuotationPage.jsx` (~line 899): container A4 ratio (aspect-ratio 210/297) dengan `letterhead.png` sebagai background, semua konten di-overlay via absolute positioning dengan koordinat % mirror PDF geometry
- ✅ Table header dark navy (#1E293B) + white text, kolom exact: NO / DESCRIPTION / QTY / UNIT / Unit Price (currency) / AMOUNT (currency)
- ✅ GRAND TOTAL bar hitam dengan white text
- ✅ Term & Conditions dengan bullet `-` untuk match PDF format
- ✅ Closing paragraph "We trust that above quotation..."

**Master Customer link ke Incoming Goods form (BUILT):**
- Sebelumnya: `StoreManualReceivePage` pakai plain `<Input>` untuk source_name — user harus ketik nama customer manual (rawan typo, inconsistent dengan Master Customer)
- ✅ New component `/app/frontend/src/components/CustomerCombobox.jsx` — autocomplete combobox fetch `/api/customers`, keyboard nav (Enter to pick, Escape close), clear button, inline "+ Tambah customer baru" untuk role sales/admin/super_admin/supervisor
- ✅ Role-aware create: store user tidak lihat tombol tambah (backend memang 403 untuk store)
- ✅ Update `StoreManualReceivePage.jsx`: conditional render — combobox saat source_type=customer, plain input saat source_type=supplier
- ✅ Toast success saat customer baru dibuat, list auto-refresh

**Testing:** iter_8 testing agent — Backend 6/6 PASS, Frontend 4/4 PASS. Preview modal renders lettered background + all sections match PDF. CustomerCombobox opens, searches, creates inline, closes. Sales filter Asiong verified (0 rows karena tidak ada inquiry oleh Asiong di data).

## Iter 28.1 (Feb 2026) — Quotation Sales Filter

- ✅ Tambah dropdown filter **Sales** di halaman `/sales/quotations` (`QuotationPage.jsx`) — konsisten dengan filter di SalesPage
- ✅ Roster: Asiong / Nicholas / Kiki / Riska / Feggie / Fiana
- ✅ Filter client-side by `created_by_name` (case-insensitive)
- ✅ Empty state ramah: "Tidak ada quotation untuk Sales &lt;Nama&gt;."
- ✅ Header hitung: "Daftar Quotation — N (filter Sales: X)"
- ✅ Reset Filter button ikut clear salesFilter


---

## Iter 29 (Feb 2026) — Quality Control Module (Material Incoming Inspection)

**Modul baru: Quality Control (QC)** — implementasi form ISO **MKS-F-QAD-002 REV 03** (Material Incoming Inspection / MII).

**Business Rule (dari user):**
- Item Incoming Goods dengan `add_to_stock=true` (masuk stok) → **tidak perlu** QC, MCL, MIF
- Item dengan `add_to_stock=false` (non-stok / material customer) → **auto-buat** QC Inspection pending + Store buat MCL/MIF
- 1 role `qc` — semua QC user bisa Inspect + Verify (no separation Inspector/Leader)
- Hasil NG hanya dicatat sebagai laporan QC (tidak block downstream)

**Backend Implementation:**
- Router baru `/app/backend/routers/qc.py`:
  - `GET /api/qc/stats` — dashboard counts (pending / inspected / verified / ng_items)
  - `GET /api/qc/inspections` — list dengan filter status/q/date
  - `GET /api/qc/inspections/{id}` — detail
  - `POST /api/qc/inspections/{id}/save` — QC Inspector isi data (auto status `inspected` jika semua items result != empty)
  - `POST /api/qc/inspections/{id}/verify` — QC Leader verifikasi (status `verified`)
  - `POST /api/qc/inspections/{id}/reopen` — kembali ke `pending` untuk edit
  - `GET /api/qc/inspections/{id}/pdf` — Download PDF MII
- Auto-create hook di:
  - `POST /api/store/incoming` (manual receive)
  - `POST /api/store/receive/bulk` (PO-based receive)
  - Non-blocking (try/except) supaya QC failure tidak block receive
- `VALID_ROLES` di auth.py + `is_qc()` helper di deps.py
- PDF generator `services/mii_pdf.py` — landscape A4, letterhead PT MKS di kiri-atas, table match ISO Excel layout

**Frontend Implementation:**
- `/app/frontend/src/pages/QCPage.jsx` — 1 file (list + dialog):
  - 4 stat cards (Pending / Inspected / Verified / NG Items) — clickable filter
  - Filter row (search + status + date range + reset)
  - Table listing dengan kolom: Tgl Terima, Sumber, Nama, DO No, PO No, Items, NG count, Status, Inspector, Aksi
  - Dialog Inspection dengan:
    - Header: Sumber checkboxes (Supplier / Supplied by Customer) — sesuai `source_type`, Customer/Supplier Name, DO No, Date
    - Items table dengan **3-row thead** (ISO exact): NO / SO. NO. / BATCH No.#/GRADE MAT'L/Heat No.# / MILL CERT/ EDS NO. / DESCRIPTION OF PART / QTY / IQC INSPECTION RESULT (DIMENTION[SPEC/ACTUAL] + VISUAL) / RESULT (OK/NG) / REMARK
    - Auto-fill columns (NO, SO NO, DESC, QTY): readonly display
    - Manual columns (BATCH, MILL CERT, SPEC, ACTUAL, VISUAL, REMARK): text inputs
    - OK/NG: mutually exclusive radio per row
    - Note: "Visual = Check of Appearance (Dent, Damage, Scratch, Colour)"
    - Signatures section (Inspector + Leader)
    - Buttons: Save · Verify (only inspected) · Re-open (only verified) · Download PDF
- Route `/qc` + role restriction: `qc` role only sees `/qc`
- Landing page: kartu Quality Control activated (`href="/qc"`, no longer Coming Soon)

**Testing:** iter_9 testing agent — **Backend 11/11 PASS**, **Frontend ~95% PASS**. Design polish: labels updated to exact ISO wording (DESCRIPTION OF PART, DIMENTION prefix, IQC INSPECTION RESULT supergroup). Seed: `qc01/qc12345` role=qc.

**Files affected:**
- NEW: `/app/backend/routers/qc.py`, `/app/backend/services/mii_pdf.py`, `/app/frontend/src/pages/QCPage.jsx`
- Modified: `auth.py` (VALID_ROLES), `deps.py` (QC_ROLES), `server.py` (mount router), `store.py` (auto-create hooks x2), `App.js` (route + role restriction), `LandingPage.jsx` (activate QC card)


## Iter 29.1 (Feb 2026) — QC Portal + Description Editable + Preview + Form Template

**Portal QC (sub-portal):**
- ✅ `/qc` sekarang jadi portal (`QCPortalPage.jsx`) — konsisten dgn Sales/Store/Engineering portals
- ✅ Kartu pertama: **Material Incoming Inspection** → link ke `/qc/mii` (list). Siap tambah kartu Outgoing QC / NCR di masa depan.
- ✅ Route `/qc/mii` untuk list & inspection dialog

**DESCRIPTION OF PART editable:**
- ✅ Backend `QCItemUpdate` model tambah `description` (optional)
- ✅ Save endpoint merge description ke item
- ✅ Frontend: kolom Description sekarang `<CellInput>` (editable saat status pending/inspected, readonly setelah verified)

**Preview WYSIWYG:**
- ✅ Tombol **"Preview"** di footer inspection dialog
- ✅ Modal preview A4 landscape dengan letterhead PT MKS, kotak "PT. MITRA KARYA SARANA", title, checkbox Supplier/Customer, 3-row table header exact ISO
- ✅ Ekstra 10 empty rows form-like untuk match PDF final
- ✅ Download PDF button di preview footer

**MII di Form Template Engine:**
- ✅ Added "MII" ke `FORM_BINDINGS` di `form_templates.py` (top_fields + row_fields untuk Description/Batch/MillCert/Dimention/Visual/Result/Remark)
- ✅ Seeder `seed_mii_template()` di `server.py` — landscape A4 dengan semua elemen default (border, logo, company box, title, checkbox supplier/customer, table dgn column groups, note, signatures)
- ✅ QC PDF endpoint `/api/qc/inspections/{id}/pdf` sekarang **prefer template** — jika ada MII template aktif → pakai `_render_pdf` (bisa diedit via visual editor di `/admin/form-templates`), fallback ke hardcode `mii_pdf.py`
- ✅ Fix seed logic: MCL & MII di-seed independen — sebelumnya MII skip karena existing MCL check menghalangi

**Files affected:**
- NEW: `/app/frontend/src/pages/QCPortalPage.jsx`
- Modified: `backend/routers/qc.py` (description in schema, PDF endpoint uses template), `backend/routers/form_templates.py` (MII binding), `backend/server.py` (seed MII), `frontend/src/App.js` (route /qc/mii), `frontend/src/pages/QCPage.jsx` (editable description, Preview button + MIIPreviewDialog component)


---

## Iter 30 (Feb 2026) — Bug Fix: Stock History IN entries hilang di local server

**Bug (dilaporkan user via screenshot local Windows Server):**
- Halaman `/store/stock` → tombol Riwayat suatu item → dialog menampilkan **Total Masuk (IN) = 0 Ea** meski di Incoming Report jelas ada penerimaan (KACA LAS PUTIH: 100 Ea 23 Jul + 1 Ea 28 Jul)
- Balance jadi negatif karena semua IN receipts di-skip, hanya OUT (issuance) yang tampil
- Terjadi khusus di data lama yang legacy (local Windows server user)

**Root cause:**
- Frontend `StoreStockPage.jsx` panggil `/api/store/stock/history?item_name=X&is_customer_material=false`
- Backend `stock_item_history` sebelumnya: `filt["is_customer_material"] = is_customer_material` — Mongo exact-match `False`
- Dokumen `store_receipts` legacy tidak punya field `is_customer_material` (missing) → tidak match filter `{"is_customer_material": False}` → semua IN records ter-skip
- OUT (issuances) filter by item_name saja → tetap muncul, makanya balance negatif

**Fix di `/app/backend/routers/store.py` (endpoint `stock_item_history` ~line 344-373):**
- `is_customer_material=True` → filter strict (customer-supplied material)
- `is_customer_material=False` → `$or` match `[field missing OR false OR null]` — konsisten dengan endpoint stock listing (line 322)
- `is_customer_material=None` → no filter (semua)

**File untuk di-download & overwrite di Windows Server 2012 R2:** `/app/backend/routers/store.py`


---

## Iter 31 (Feb 2026) — BOM ↔ Purchasing Link (Pattern Consumable Request)

**Kebutuhan user:** Tracking per-item BOM: sudah dibeli berapa, sisa berapa, di PO mana. Pattern harus **identik** dengan Consumable Request yang sudah proven.

**Implementasi (kopi pola Consumable Request):**

**Backend (`bom.py`):**
- Struktur BOM item ditambah field runtime (computed, not stored on upload): `purchases[]`, `total_bought`, `purchased`, `purchase_status` (pending/partial/fulfilled/over)
- Endpoints baru:
  - `GET /api/bom/{bom_id}/purchase-status` — detail per-item + overall progress
  - `GET /api/bom/purchase/open-items` — flat list item BOM belum dibeli (cross-BOM) untuk "Tarik dari BOM" picker
  - `GET /api/bom/purchase/search-transactions` — search transactions untuk Cari & Link
  - `POST /api/bom/{bom_id}/items/{item_no}/mark-purchased` — mark manual (offline PO/cash)
  - `POST /api/bom/{bom_id}/items/{item_no}/link-transaction` — retroactive link ke transaction existing
  - `POST /api/bom/{bom_id}/items/{item_no}/unmark-purchased/{purchase_index}` — undo
- Helper `link_purchase_to_bom()` dipanggil dari `transactions.py` saat create tx dgn `bom_item_ref`
- List `/api/bom` sekarang include `purchase_progress` (fulfilled/total/percent)
- Auto-recompute status setiap ada perubahan purchases

**Transactions model (`models.py`):**
- Field baru `bom_item_ref: {bom_id, item_no}` — di-set saat "Tarik dari BOM"
- Auto-link di `POST /transactions` + `POST /transactions/bulk`

**Frontend:**
- New component `/app/frontend/src/components/BomPurchaseWidgets.jsx`:
  - `BomPurchaseBadge` — badge status per item + progress bar
  - `BomListProgress` — progress bar overall untuk list row
  - `BomSearchLinkModal` — modal Cari & Link (search transactions, click Link)
  - `ManualMarkModal` — form manual mark-purchased untuk pembelian offline
- `BOMPage.jsx`:
  - Kolom "Beli" per item dgn badge + tombol "Cari & Link" + expandable purchases[] history
  - Kolom "Progress Beli" di list utama (X/Y items + progress bar %)
- `InputTransactionPage.jsx`:
  - Tombol baru **"Tarik dari BOM"** (biru indigo) di samping "Tarik dari Consumable Request"
  - `BomItemPicker` modal: list item BOM belum dibeli lintas SO, check-all/uncheck-all, filter search + SO, qty otomatis = sisa
  - `bom_item_ref` di-passthrough ke payload transaksi

**Testing:** Verified via screenshot — BOM detail tampil kolom "BELI" dgn badge/counter/CARI & LINK · BOM picker di InputTransactionPage tampil 54 item BOM belum dibeli dgn semua kolom (SO NO, #, Item, Spec, Material, Qty BOM, Dibeli, Sisa, Unit, Status).

**Files untuk di-download di Windows Server 2012 R2:**
- Backend: `/app/backend/routers/bom.py`, `/app/backend/routers/transactions.py`, `/app/backend/models.py`
- Frontend BARU: `/app/frontend/src/components/BomPurchaseWidgets.jsx`
- Frontend UBAH: `/app/frontend/src/pages/BOMPage.jsx`, `/app/frontend/src/pages/InputTransactionPage.jsx`


---

## Iter 31.1 (Feb 2026) — BOM Purchase Improvements

**Fix 1 — Riwayat Pembelian card include BOM-linked tx (tanpa SO):**
- Sebelumnya `/api/bom/{id}/purchases` filter cuma `project_no==so_no`. Kalau tx punya `bom_item_ref` tapi tanpa SO → tidak muncul di riwayat.
- Fix: query pakai `$or` `[{project_no:so_no}, {bom_item_ref.bom_id:bom_id}]` → semua tx yang berhubungan tampil di riwayat.

**Fix 2 — Auto-link tx-to-BOM by SO+item name (fuzzy):**
- Helper `auto_link_tx_to_bom_by_so()` di bom.py — dipanggil dari transactions.py saat create/bulk tx tanpa `bom_item_ref`
- Logic: kalau `project_no` cocok SO BOM aktif, cari BOM item yang `item_name` fuzzy match → auto set `bom_item_ref` + append purchase entry
- Fuzzy match: normalize case + whitespace + punctuation, contains OR ≥ 2 token match

**Fix 3 — Stock-aware purchase status:**
- `_recompute_bom_purchase_status()` sekarang consider `annotations.available_stock`
- Status baru: `in_stock` (biru "STOK CUKUP") — kalau `avail_stock >= qty` maka item tidak perlu beli
- `needed_qty = max(0, qty - avail_stock)` — purchases[] dinilai vs needed_qty (bukan qty full)
- Frontend BomPurchaseBadge: tampil "Stok: X · ✓ Cukup" saat in_stock, hide "Cari & Link" button
- BOM Picker (Tarik dari BOM) skip item ber-status in_stock — Purchasing tidak diganggu item yang sudah ada stok

**Fix 4 — Auto-calc qty_purchase saat annotate:**
- Endpoint annotations: kalau `qty_purchase=null` (tidak eksplisit user isi), backend auto-compute `qty_purchase = max(0, qty_bom - available_stock)`
- User bisa override manual (isi field qty_purchase)

**Files affected:** `bom.py`, `transactions.py`, `BomPurchaseWidgets.jsx`, `BOMPage.jsx`

## Iter 32 (Feb 2026) — Engineering Material Costing Reference Database (MVP)

**Modul baru `/engineering/material-costing`** — katalog harga material untuk costing manual Engineering. BUKAN inventory. Purchasing input harga utuh → sistem auto-compute berat teoritis + harga/Kg + final price (dgn markup ongkir).

**Backend (`/app/backend/routers/material_costing.py`):**
- Collection `materials_costing` + `material_density` (overrides)
- Density reference table (25+ grade: A36, SS400, S275JR, S355JR, SUS304/316, AL 6061/5052, Q235B, dll)
- CRUD endpoints: GET/POST/PUT/DELETE `/api/material-costing/materials`
- `GET /api/material-costing/density-table` — full density reference
- Auto-enrich per save: density lookup, weight compute (Plate/Pipe/Round Bar formulas), price/Kg, final price with markup
- Price history log per record (audit trail)

**Frontend (`/app/frontend/src/pages/MaterialCostingPage.jsx`):**
- Portal-in-page dgn 4 kartu kategori: Raw Material (active), Standard Parts / Consumables / Subcon (soon)
- Tabel dgn kolom: Grade · Jenis · Ukuran · Berat(Kg) · Harga Utuh · Harga/Kg · Markup · Final /Kg · Supplier · Update · Aksi
- Form Tambah/Edit dgn live preview:
  - Dropdown Jenis (Plate/Pipe/Bar/dll) + Grade (ASTM A36/SS400/dst datalist)
  - Dimensi (auto muncul sesuai jenis: Plate=LxWxT, Pipe=OD/wall/L, Round=D/L)
  - Weight auto-compute dari density × volume (bisa override manual)
  - Harga Utuh + Unit (sheet/bar/piece/roll/meter)
  - Markup % → final price/Kg auto
  - Green box 'Hasil Perhitungan Otomatis (Live)' menampilkan Berat + Harga/Kg + Markup + Final/Kg secara real-time saat isi form

**Contoh test:** Plate ASTM A36 4×8×5mm (2440×1220×5mm) → density 7.85 → berat 116.84 Kg → harga utuh Rp 10jt → harga/Kg Rp 85.588 → markup 5% → final Rp 89.867/Kg.

**Extension points (untuk 3 kategori berikutnya):**
- Standard Parts (baut/mur/gasket): switch category ke `standard_part`, sesuaikan dimensi form
- Consumables & Paint: category=`consumable`, tambah expire date + kaleng size
- Subcon Rate Card: category=`subcon`, tambah rate_per_m2 / rate_per_hour / rate_fixed

**Files:**
- BARU: `/app/backend/routers/material_costing.py`, `/app/frontend/src/pages/MaterialCostingPage.jsx`
- UBAH: `/app/backend/server.py` (mount router), `/app/frontend/src/App.js` (route)


---

## Iter 33 (Feb 2026) — Material Costing: 4 Kategori Aktif + Grade Autocomplete 68 Grades

**User request:** Aktifkan 3 kartu tersisa di Engineering Costing Database (Standard Parts, Consumables & Paint, Subcon Rate Card) dan expand density autocomplete untuk grade material.

**Backend (`material_costing.py`):**
- MaterialIn schema extended dgn field opsional universal:
  - Standard Parts: `catalog_code`, `brand`, `moq`
  - Consumables: `pack_size`, `brand`
  - Subcon: `service_name`, `rate_unit` (per_item/lumpsum/m2/jam/kg/meter)
- `_enrich()` skip density/weight math untuk non-raw_material category — only apply markup ke `final_price_per_unit`
- Search `$or` diperluas ke field baru
- `POST /density-table` relaxed dari admin-only → `_can_edit` (Purchasing/Engineering bisa tambah grade)
- **DEFAULT_DENSITY expanded 15 → 68 grade** (semua 51 grade permintaan user + legacy):
  - Carbon steel (ASTM A36/A572/A516/A283, SS400, S235/S275/S355, Q235B, Q345B)
  - Pipe grade (ASTM A106/A53, API 5L B/X42/X52/X60/X65/X70)
  - Medium carbon (S45C/C45, AISI 1018/1020/1045/4140/4340)
  - Wear-resistant (Hardox 400/450/500/550/600, AR200/400/500)
  - Stainless (SS304/304L/316/316L/310/321/410/420/430)
  - Aluminium (1050/5052/5083/6061/6063/7075)
  - Copper C110, Brass C260, Bronze C932
  - Cast Iron, Ductile Iron, Galvanized Steel

**Frontend (`MaterialCostingPage.jsx`):**
- Rewrite dgn kategori aktif per switch — semua 4 kartu clickable (tidak ada lagi "coming soon")
- **Tabel unik per kategori:**
  - Raw Material — Grade/Jenis/Ukuran/Berat/Harga/Kg/Final/Kg
  - Standard Parts — Kode Katalog/Nama/Brand/MOQ/Harga per pcs/Final Price
  - Consumables — Nama/Pack Size/Brand/Harga per unit
  - Subcon — Layanan/Unit Rate (per_item/lumpsum/m²/jam)/Vendor
- **Form kondisional per kategori** — field sesuai dgn kategori aktif
- Grade autocomplete di form Raw Material — pakai `<datalist>` dinamis fetch dari `/density-table` endpoint (68 opsi + custom), tampil density value + status
- Tombol **"+ Grade"** inline untuk tambah density grade baru permanen (Purchasing/Engineering bisa akses)
- Visual feedback: "✓ Density X g/cm³" jika grade cocok, "⚠ pakai default 7.85" jika grade custom belum terdaftar

**Engineering Portal (`EngineeringPortalPage.jsx`):**
- Kartu "Material Costing Database" sekarang aktif → `/engineering/material-costing` (sebelumnya "Coming Soon")

**Testing:** Curl end-to-end verified (create ke 4 kategori, list per kategori, final_price computation correct). Screenshot smoke test: 4 tab kategori muncul dengan tabel unik dan data test.

**Files:**
- Modified: `/app/backend/routers/material_costing.py`, `/app/frontend/src/pages/MaterialCostingPage.jsx`, `/app/frontend/src/pages/EngineeringPortalPage.jsx`

## Iter 33.1 (Feb 2026) — Material Costing UX: Parser Ukuran + Update Harga Quick + Grade Fuzzy Combobox

**User needs:**
1. Grade autocomplete fuzzy — ketik `a36`, `4140`, `hardox500`, `aisi 1045` → sistem tetap ketemu `ASTM A36`, `AISI 4140`, dll.
2. Kolom Ukuran (Deskripsi) → ketik `4' x 8' x 5mm` atau `Dia. 16mm x 6M` → tekan Enter → auto-parse & auto-hitung berat.
3. Kolom "Update Harga" per item — Purchasing bisa update harga cepat tanpa buka form lengkap, sekaligus riwayat perubahan harga tersimpan otomatis.

**Frontend (`MaterialCostingPage.jsx`):**
- **`GradeCombobox` component baru** — fuzzy match (uppercase + strip non-alphanumeric): `4140` ketemu `AISI 4140`, `a36` ketemu `ASTM A36`, `hardox500` ketemu `HARDOX 500`. Dropdown scrollable, keyboard nav (↑↓ Enter Esc).
- **Parser Ukuran (Deskripsi)** — unit-aware:
  - `4'` → 1219.2mm (foot × 304.8)
  - `8'` → 2438.4mm
  - `6M` / `6m` → 6000mm (meter × 1000)
  - `16mm` → 16mm
  - `1"` → 25.4mm (inch)
  - Prefix `Dia.`, `Diameter`, `Ø`, `OD`, `ID`, `wall` auto-strip
  - Separator bebas: `x`, `×`, `*`, space
  - Auto-assign per material type: Plate → sort L>W>T; Pipe → largest=L, middle=OD, smallest=wall; Round → largest=L, other=Ø
- Enter di field ukuran → parse & compute berat. Ada tombol "⏎ Hitung" juga. Feedback text: "✓ Terbaca: L=2438.4 W=1219.2 T=5 mm".
- **Tombol Rp (Update Harga)** per item di kolom Aksi — buka `UpdatePriceDialog`.
- **`UpdatePriceDialog`** — quick update:
  - Panel harga sekarang (harga + markup + tanggal update terakhir badge)
  - Form harga baru (dgn diff % visual: "▲ 15% dari harga lama")
  - Markup + Supplier + Catatan (opsional)
  - **Riwayat Perubahan Harga** table (tanggal, oleh, harga lama → baru, markup, supplier, catatan)
- **PriceDateBadge** component — badge hijau "HARI INI" jika update = hari ini, warna merah jika > 90 hari (stale price).
- Kolom "Update" ganti → "Update Harga" dengan badge.

**Backend (`material_costing.py`):**
- Field baru: `price_last_updated` (ISO timestamp)
  - Di-set otomatis ke NOW saat harga berubah (via POST create + PUT update + dedicated update-price endpoint)
  - Tidak berubah kalau edit lain (mis. supplier, remark)
- Endpoint baru:
  - `POST /material-costing/materials/{id}/update-price` — quick price update. Payload: `{price_per_unit, markup_pct?, supplier_name?, note?}`. Append ke `price_history` dengan `price_per_unit_old` + `price_per_unit_new` untuk delta viewing. Set `price_last_updated=now`. Recompute derived fields.
  - `GET /material-costing/materials/{id}/price-history` — return current price + full history sorted DESC.

**Testing:** Curl verified:
- Update-price endpoint: harga Rp 0 → Rp 11.000.000, markup 0% → 8%, note "Kenaikan harga bulanan" tersimpan, `price_last_updated=now` ✓, history 2 entri (initial + update) ✓
- Frontend screenshot: tabel tampil badge "HARI INI", tombol Rp buka dialog, riwayat 2 entri.

## Iter 33.2 (Feb 2026) — Multi-Currency + Excel Template Import

### Multi-Currency Support
- MaterialIn schema: `currency` (IDR/USD/SGD/EUR/CNY/JPY/MYR) + `exchange_rate` (default 1 IDR, auto default per currency)
- `_enrich()` menghitung IDR-equivalent otomatis: `price_per_unit_idr`, `price_per_kg_idr`, `final_price_per_unit_idr`, `final_price_per_kg_idr`
- Frontend `PriceCell` component menampilkan native currency + IDR-equivalent below (untuk cross-comparison)
- `UpdatePriceDialog` include currency selector — jika bukan IDR, muncul field kurs → IDR + preview conversion
- Constants `CURRENCIES` di frontend dengan default rate: USD=16000, SGD=12000, EUR=17500, CNY=2200, JPY=105, MYR=3500
- Applied ke semua 4 kategori (Raw Material, Standard Parts, Consumables, Subcon)

### Excel Template + Bulk Import
- **Backend endpoints:**
  - `GET /material-costing/materials/template/xlsx?category=X` — download blank Excel template (openpyxl):
    - Sheet 1: headers untuk kategori terpilih + 1-3 baris sample italic
    - Sheet 2: REFERENSI berisi valid currency, unit, material_type, density table lengkap (68 grade)
    - Header row bold + dark navy fill, freeze panes
    - Kolom bertanda `*` = required
  - `POST /material-costing/materials/import/xlsx` — parse xlsx, bulk create dgn `_enrich()` auto compute weight/price_per_kg/IDR conversion. Return summary: `{created, errors: [{row, reason}], total_rows_scanned}`. Header row auto-detect (fuzzy match).
- **Frontend `ImportExcelDialog`:**
  - Toolbar buttons "Template" + "Upload Excel" (top-right dgn ikon `DownloadSimple` + `UploadSimple`)
  - Modal 2-langkah: Download Template → Upload File Terisi
  - File input accept `.xlsx/.xls`
  - Result panel menampilkan `X entri berhasil di-import` + list error details (expandable)
- **Testing:** Curl verified — template download 7.8KB xlsx valid → import back 3 sample rows (Plate/Pipe/USD Round Bar) → tersimpan dgn weight auto (116.84kg/27.04kg/9.47kg) dan currency conversion tepat.

### Files
- Modified: `/app/backend/routers/material_costing.py`, `/app/frontend/src/pages/MaterialCostingPage.jsx`

### Menu Impact
- User workflow untuk bulk input harga baru dari supplier: klik Template → isi di Excel offline → upload → semua entries masuk dengan berat & IDR-conversion auto.

## Iter 33.3 (Feb 2026) — Combined View "Semua Kategori"

**User need:** Tampilkan list harga gabungan lintas kategori — ketik "plate" muncul semua plate, "cat" muncul consumable cat, dst — tanpa harus switch tab.

**Frontend:**
- Kartu baru "Semua Kategori" (icon MagnifyingGlass, warna slate) sebagai kartu pertama di grid (5 kolom)
- `CombinedTable` component — kolom generic: Kategori badge (warna per kategori: Raw=sky, Std=amber, Consumable=emerald, Subcon=violet) · Nama/Grade · Jenis · Ukuran/Spec · Detail (brand/moq/pack/rate_unit context-aware) · Harga Utuh · Markup · Final Price · Supplier · Update Harga · Aksi
- Toolbar: tombol Tambah/Template/Upload disembunyikan saat mode "all" (dgn hint "Pilih kategori spesifik"). Search + Refresh tetap tersedia.
- Search fuzzy bekerja lintas kategori via backend `$or` yang sudah include semua field kategori.
- Verified via screenshot: 9 entri tampil semua · filter "plate" → 3 raw · filter "sand" → 1 subcon.

**Backend:**
- `list_materials` param `category` default `None` sekarang (tidak lagi `"raw_material"`)
- Jika `category` empty atau `"all"` → tidak filter kategori (return all)

## Iter 34 (Feb 2026) — BOM Attachments + Master List Drawing

### BOM Attachments (embedded di BOM detail page)
**Backend router `bom_attachments.py`:**
- Collection: `bom_attachments` · Storage: GridFS bucket `bom_attachments`
- Endpoints:
  - `GET /api/bom/{bom_id}/attachments` — list grouped by category (drawing/nesting/costing)
  - `POST /api/bom/{bom_id}/attachments` — multipart upload (category + remark + file), 50MB max
  - `DELETE /api/bom/{bom_id}/attachments/{attach_id}`
  - `GET /api/bom/{bom_id}/attachments/{attach_id}/preview` — inline: PDF native · Excel → convert to PDF via soffice
  - `GET /api/bom/{bom_id}/attachments/{attach_id}/download` — original file
- Kategori: **Drawing PDF** (.pdf), **Nesting PDF** (.pdf), **Costing Excel** (.xlsx/.xls/.pdf)
- Multiple files per kategori supported.

**Frontend `components/BomAttachments.jsx`:**
- 3-kolom panel di BomDetail (Drawing/Nesting/Costing) — masing-masing punya tombol Upload + list file
- Setiap file: icon Preview (buka iframe modal · Excel auto-convert to PDF) · Download · Hapus
- Upload dialog: file picker + remark input
- Preview dialog: iframe fullscreen A4-like dengan tombol Download original

### Master List Drawing (Engineering)
**Backend router `drawing_register.py`:**
- Collection: `drawings` · Storage: GridFS bucket `drawings`
- Fields: `drawing_no`, `title`, `revision`, `discipline` (Mech/Civil/Elec/Piping/Struct/Instrument/General), `so_no`, `project_name`, `prepared_by`, `checked_by`, `drawing_date`, `status` (Draft/Issued/Superseded/Cancelled), `remark`
- Unique constraint: `drawing_no + revision`
- Endpoints:
  - `GET /api/drawings` — list dgn filter (q · discipline · status · so_no)
  - `POST /api/drawings` — register
  - `PUT /api/drawings/{id}` — update
  - `DELETE /api/drawings/{id}` — soft delete + GridFS cleanup
  - `POST /api/drawings/verify-pdf` — pre-check: extract text dari PDF (pypdf), match drawing_no
  - `POST /api/drawings/{id}/upload` — upload PDF; runs verify → set `pdf_match_status` = verified | warning · store `pdf_match_note` + `pdf_extracted_candidates`
  - `GET /api/drawings/{id}/preview` — inline PDF stream
  - `GET /api/drawings/{id}/download` — original
- Text extraction: `pypdf` — scan first 5 pages, normalize (uppercase + strip non-alphanumeric) → substring match
- Extract candidate drawing numbers dari PDF: regex `[A-Za-z0-9][A-Za-z0-9\-/_.]{4,30}[A-Za-z0-9]` filtered by (contains letter + digit)

**Frontend `pages/MasterDrawingPage.jsx`:**
- Route `/engineering/drawings`
- Kartu baru di Engineering Portal (icon FileText, warna violet)
- Table columns: Drawing No · Title · Rev · Discipline · SO · Project · Prepared By · Status badge · File info (dgn ✓ verified / ⚠ warning icon) · Actions (Upload · Preview · Edit · Delete)
- Filter row: search + discipline dropdown + status dropdown
- Upload dialog dgn **pre-verify** on file select — tampilkan hasil sebelum submit:
  - ✓ Nomor cocok → tombol hijau "Upload PDF"
  - ⚠ Warning → panel kuning tampilkan kandidat nomor yg terbaca (badges) + tombol amber "Upload Tetap (dgn warning)"
- Preview dialog: iframe fullscreen native PDF viewer + tombol Download

**Testing:** Curl verified:
- Register `MKS-DWG-001-2026` OK
- Verify-PDF endpoint: good.pdf → match=true · dummy.pdf → match=false + reason
- Upload: matched PDF → `pdf_match_status=verified` · mismatched PDF → `pdf_match_status=warning`
- Screenshot: portal dgn 4 kartu · list drawing · upload dialog dgn register info tampil.

### Files
- Backend NEW: `/app/backend/routers/bom_attachments.py`, `/app/backend/routers/drawing_register.py`
- Backend UBAH: `/app/backend/server.py` (mount routers)
- Frontend NEW: `/app/frontend/src/components/BomAttachments.jsx`, `/app/frontend/src/pages/MasterDrawingPage.jsx`
- Frontend UBAH: `/app/frontend/src/pages/EngineeringPortalPage.jsx` (kartu Drawing), `/app/frontend/src/pages/BOMPage.jsx` (mount BomAttachments), `/app/frontend/src/App.js` (route drawings)

## Iter 34.1 (Feb 2026) — Drawing Auto-Number Generator

**User need:** Nomor drawing auto-generate berurutan, format bisa dicustom karena user belum finalize pola.

**Backend:**
- Endpoint baru:
  - `GET /api/drawings/config` — return current config + preview next number
  - `PUT /api/drawings/config` — update prefix/padding/reset_per_year/suffix_year
  - `GET /api/drawings/next-number` — preview only (tidak increment counter)
- `create_drawing` sekarang: kalau `drawing_no` kosong → auto-generate `{prefix}-{seq:padded}-{year}`
- Counter di collection `counters` (`_id: drawing_seq_2026`), atomic via `find_one_and_update` + `$inc`, reset per tahun
- Config default: `prefix="MKS-DWG"`, `seq_padding=3`, `reset_per_year=true`, `suffix_year=true` → contoh `MKS-DWG-001-2026`
- Semua config field bisa di-override via `PUT /drawings/config` (mis. prefix `MKS-ENG-DWG`, padding 4 digit → `MKS-ENG-DWG-0003-2026`)
- Field baru di doc: `auto_generated` (bool)

**Frontend:**
- Register Form: banner biru "Auto Generate" tampil preview nomor berikutnya + link "Ganti Format"
- `ConfigDialog` — form untuk edit prefix/padding/reset_per_year/suffix_year dengan preview realtime
- Field Drawing No placeholder = preview auto-number (kosong = auto)

**Testing curl:** Auto 001-2026 → 002-2026 → ganti prefix ke MKS-ENG-DWG padding 4 → 0003-2026 · Reset default OK · Screenshot: dialog register tampil banner "Nomor berikutnya: MKS-DWG-004-2026".

## Iter 34.2 (Feb 2026) — Drawing Number Format Finalized (Project-Based)

**Format resmi:** `DWG.YY.MM.NN_CUSTOMER.INITIAL.TYPE.SEQ`
- Contoh: `DWG.26.07.01_MKS.SP.A.00` (Assembly), `DWG.26.07.01_MKS.SP.P.01` (Part)
- `NN` = monthly running number, **unique per project** dalam bulan yang sama (drawing lain di project sama share NN)
- `A.00` = Assembly · `P.01+` = Part (increment per project per bulan)

**Backend changes:**
- Field baru DrawingIn: `customer_code` (default MKS), `project_initial` (WAJIB kalau auto), `drawing_type` (Assembly/Part)
- Field baru tersimpan di doc: `year_month`, `monthly_running`, `type_letter`, `type_seq`
- `_next_drawing_no(customer, initial, type)`:
  1. Kalau project (customer+initial) sudah punya drawing di bulan ini → reuse `monthly_running`
  2. Kalau project baru → increment monthly counter (`drawing_monthly_{YY}_{MM}`)
  3. Assembly: seq mulai dari 00, Part: seq mulai dari 01 · Both auto-increment
- `GET /drawings/next-number?customer_code=...&project_initial=...&drawing_type=...` — live preview tanpa mengubah counter, return `is_new_project` + `existing_project_drawings`
- Config sekarang: `default_customer_code`, `assembly_start_seq`, `part_start_seq`

**Frontend changes:**
- Form Register: field baru `Customer Code`, `Project Initial *`, `Drawing Type *` (Assembly/Part dropdown), `Project Name`
- Banner biru live-preview auto-nomor dgn hint "✨ Project baru monthly running #NN" atau "↩ Project sudah ada X drawing"
- Debounced 250ms update saat user ketik
- Config dialog: default customer code + Assembly/Part start seq

**Testing curl (all match):**
- SP Assembly → `DWG.26.07.01_MKS.SP.A.00`
- SP Part 1 → `DWG.26.07.01_MKS.SP.P.01` (reuse NN=01)
- SP Part 2 → `DWG.26.07.01_MKS.SP.P.02` (increment seq)
- BF Assembly → `DWG.26.07.02_MKS.BF.A.00` (project baru → NN=02)
- BF Part → `DWG.26.07.02_MKS.BF.P.01`

## Iter 34.3 (Feb 2026) — BOM Manual Register + Link ke Drawing (Sekaligus)

**User need (dari tim Engineering):** Saat register drawing, sekaligus register nomor BOM di kesempatan yang sama. Format BOM: `BOM001-07-2026` (running per bulan-tahun).

**Backend `/app/backend/routers/bom.py`:**
- Auto-gen BOM number: `_next_bom_no()` — counter `bom_seq_{YYYY}_{MM}`, format `BOM{seq:03d}-{MM}-{YYYY}`
- `GET /api/bom/next-number` — preview (tidak increment)
- `POST /api/bom/register` — register BOM manual (tanpa Excel), auto-gen bom_no jika kosong
- `GET /api/bom/lookup?q=` — lightweight search untuk dropdown (return bom_no + so_no + project_name)
- Existing BOM upload flow tidak berubah — cuma tambah alternative manual entry path

**Backend `/app/backend/routers/drawing_register.py`:**
- DrawingIn field baru: `bom_link_mode` (none/create_new/existing), `bom_no`, `bom_id`
- Doc field: `bom_id`, `bom_no` tersimpan di drawing
- Saat create drawing dgn mode `create_new` → sekaligus INSERT BOM record dgn `source=drawing_register`, items kosong (tambah nanti)
- Mode `existing` → verifikasi bom_id, link saja

**Frontend `MasterDrawingPage.jsx`:**
- Tabel drawing: kolom **BOM** baru (font-mono amber) — kosong = "-"
- Form Register: section amber "Link ke BOM (opsional)" di bawah form dgn 3 radio:
  - Tanpa BOM (default)
  - Buat BOM Baru — tampil preview bom_no otomatis + optional override
  - Link ke BOM Existing — search + list result (BOM Excel yang sudah ada bisa juga di-link)
- Setelah register success → auto-open Upload PDF dialog (UX improvement)
- Tombol "Upload PDF" per baris dgn label hijau menonjol (bukan icon kecil) — clear CTA
- Badge "⚠ BELUM UPLOAD" amber untuk drawing yang belum ada file

**Testing curl:**
- `BOM001-07-2026` auto-gen ✓
- Drawing `DWG.26.07.03_MKS.HB.A.00` + BOM `BOM001-07-2026` created together ✓
- Preview next: `BOM002-07-2026` ✓


## 2026-07-29 — UX Fix: Enter Key in Material Form
**Bug (user report)**: Di form Tambah Raw Material, tekan Enter di kolom Supplier langsung submit form padahal user belum selesai isi kolom-kolom berikutnya.

**Root cause**: `<form onSubmit={save}>` HTML default behavior — Enter di single-line `<input>` men-submit form ke tombol submit pertama.

**Fix — `/app/frontend/src/pages/MaterialCostingPage.jsx` (MaterialForm component)**:
- Tambahkan `onKeyDown={handleFormKeyDown}` di element `<form>`
- Handler: jika Enter ditekan di INPUT/SELECT (bukan TEXTAREA/BUTTON) → `e.preventDefault()` + pindahkan fokus ke input berikutnya dalam form (tab order alami via `querySelectorAll('input,select,textarea')` yg visible)
- Submit HANYA lewat klik tombol "Simpan"
- Update DialogDescription untuk edukasi user: *"Tekan Enter untuk pindah ke kolom berikutnya. Klik Simpan untuk menyimpan."*
- Berlaku untuk semua kategori (Raw Material, Standard Parts, Consumables, Subcon) karena semua pakai MaterialForm yang sama

**Verified (screenshot test)**:
- Enter di `mf-supplier` → dialog tetap terbuka, fokus pindah ke `mf-markup` ✓
- Combobox Grade & Size input Enter handlers tetap berfungsi (compute weight) — event bubble ke form handler untuk lanjut ke field berikutnya

## 2026-07-29 — Material Costing: Row Detail Popup + Pagination + Access Control + Price Averages

### 1. Row Click → Popup Detail Lengkap
- Klik baris manapun (kecuali kolom Aksi) di semua tabel (Semua/Raw/Std Part/Consumable/Subcon) → buka `MaterialDetailDialog`
- Detail sections: Identifikasi (grade, jenis, spec, catalog, brand, service, remark), Dimensi & Berat (raw_material — panjang/lebar/tebal/OD/wall, density, total berat), Harga & Markup (currency, harga utuh, harga/kg, markup, final price), Supplier & Update Info, Price History (dari `/api/material-costing/materials/{id}/price-history`)
- Tombol footer: **Tutup**, **Update Harga** (canEdit), **Edit Lengkap** (canEdit) → open respective dialogs

### 2. Column Reorder (Raw Material) + Colored Highlight
**Sebelum**: `Grade | Jenis | Ukuran | Berat | Harga Utuh | Harga/Kg | Markup | Final/Kg | Supplier | Update | Aksi` (11 kol)
**Sesudah** (per user spec): `Grade | Jenis | Ukuran | Harga Utuh | Total Berat | Harga/Kg | Markup🟨 | Final /Kg🟢 | Update Harga | Aksi` (10 kol — Supplier dipindah ke popup detail)
- Kolom **Markup** background `bg-amber-50` text amber
- Kolom **Final /Kg** background `bg-emerald-50` text emerald bold
- Supplier column removed from CombinedTable, StandardPartTable, ConsumableTable, SubconTable juga

### 3. Pagination 15 baris/halaman
- Client-side slice (state `page`, konstanta `PAGE_SIZE=15`)
- Footer bar: "Menampilkan 1–15 dari 28" · Hal X/Y · [◂ Prev] [Next ▸]
- Auto reset ke page 1 saat kategori/pencarian berubah
- Prev disabled saat page=1, Next disabled saat page=totalPages

### 4. Role-Based Access Control
**Full CRUD** (`FULL_ACCESS_ROLES` konstanta):
- `super_admin`, `admin`, `purchasing`, `eng_head` (Riski)
- Melihat: Tombol Tambah, Template, Upload Excel, Edit, Hapus, Update Harga

**View Only** (`eng_staff`, `sales`, `finance`, `store`, `qc`, `supervisor`):
- Tombol Tambah/Template/Upload disembunyikan → diganti banner *"View only — hubungi Purchasing untuk perubahan"*
- Kolom Aksi menampilkan `—` (dash) tanpa tombol
- Klik baris tetap membuka popup detail (tanpa tombol Edit/Update Harga di footer)

**Backend enforcement** (`/app/backend/routers/material_costing.py`):
- `_can_edit()` — hanya `("purchasing", "admin", "super_admin", "eng_head")` (hapus `supervisor`, `eng_staff`, `engineering`)
- `delete_material` diubah dari `is_admin_like` → `_can_edit` (purchasing/eng_head boleh delete)

### 5. Harga Rata-rata per Kg — Basic Reference Bar
- **Endpoint**: `GET /api/material-costing/price-summary?category=raw_material|standard_part|consumable|subcon`
- Return: `{items: [{grade, material_type, count, avg_price, min_price, max_price, last_updated}]}`
- Aggregate menggunakan `final_price_per_kg_idr` (raw) atau `final_price_per_unit_idr` (others) — multi-currency friendly
- **Frontend** `PriceAveragesBar` component di atas Filter row:
  - Grid responsif 2/3/4/5/6 kolom
  - Tiap kartu: Grade + Jenis (dua baris), badge count (×N), Avg Rp, min–max range (bila variasi), tanggal update terakhir
  - Collapsible (▾/▸ toggle)
  - Auto refresh setiap items list berubah (`refreshKey={items.length}`)

### 6. UX Fix (dari task sebelumnya)
- Form Tambah Raw Material: Enter di kolom apapun sekarang pindah ke kolom berikutnya (bukan submit langsung). Submit hanya via klik tombol Simpan.

### Test Credentials Update
- `madian` / `admin123` (eng_staff) — untuk uji view-only
- `sales01`, `engineer01` password direset ke `admin123` juga


## 2026-07-29 — Master Drawing: Edit Dialog Unification + Unified Attachments Panel

### 1. Edit Dialog Sekarang Identik dengan Register
**Sebelum**: Saat Edit, form skip preview auto-number (`if (initial) return`), sehingga kalau user salah tulis `project_initial`/`customer_code`/`drawing_type`, `drawing_no` tidak ter-update otomatis.

**Sesudah** (`/app/frontend/src/pages/MasterDrawingPage.jsx` — `DrawingForm`):
- useEffect next-number sekarang jalan di kedua mode (Register & Edit) — dependency: `[initial, f.customer_code, f.project_initial, f.drawing_type]`
- Preview banner amber muncul di Edit mode dengan label *"NOMOR OTOMATIS (SUGGESTION) — kalau field diubah, klik Terapkan untuk regenerate"*
- Tombol **↻ Terapkan Nomor** muncul saat `nextPreview !== f.drawing_no.trim()` — klik → replace `drawing_no` dengan suggestion baru
- Menampilkan "Drawing No sekarang: xxx" untuk konteks
- Grid form (Customer/Initial/Type/Project Name/Drawing No/Title/Rev/Discipline/Status/SO/Prepared/Checked/Date/Remark) sekarang render di kedua mode (`orderType === "new" || initial`)

### 2. Unified File Attachments Panel (`DrawingAttachmentsPanel`)
Panel baru **di dalam form Edit Drawing** (muncul saat `initial?.id`) dengan 4 slot:

| Slot | Backend | GridFS Storage |
|------|---------|----------------|
| **Drawing PDF (MKS)** 🟢 | `POST /api/drawings/{id}/upload` · `GET /api/drawings/{id}/preview` | `drawings` bucket |
| **Customer Reference PDF** 🔵 | `POST /api/drawings/{id}/upload-customer-ref` · `GET /api/drawings/{id}/customer-ref/preview` | `drawings` bucket |
| **Nesting PDF (BOM Layout)** 🟣 | `POST /api/bom/{bom_id}/attachments` (category=`nesting`) | `bom_attachments` bucket |
| **Costing Excel** 🟡 | `POST /api/bom/{bom_id}/attachments` (category=`costing`) | `bom_attachments` bucket |

- Nesting & Costing hanya aktif bila drawing punya `bom_id` (via BOM link mode saat Register), else placeholder "Link ke BOM dulu untuk mengaktifkan"
- Nesting/Costing bisa **multi-file** (allowMulti), Drawing & Customer Ref single-file (Replace)
- Tombol Delete (Trash icon) hanya untuk Nesting/Costing (BOM attachments)

### 3. Inline Preview (`InlinePreviewDialog`)
- **PDF & image**: iframe / img tag native — no download
- **Excel (.xlsx/.xls)**: karena browser tidak preview native, dialog menampilkan info card + tombol "Buka di Tab Baru" (fallback yang jelas)
- Header: nama file + tag "Preview inline — tanpa download"

### Test Verified (screenshot):
- Edit dialog: preview banner amber tampil dengan tombol Terapkan
- Ganti `project_initial` TS → XX → banner update ke `DWG.26.07.05_MKS.XX.A.00` ✓ + monthly running badge
- Attachments panel: 4 slot muncul, Drawing PDF sudah menampilkan file existing dengan tombol Preview (Eye)
- Preview click → `InlinePreviewDialog` terbuka dengan iframe PDF (endpoint `/preview` return `application/pdf` inline)
- Backend `/api/drawings/{id}/preview` return valid `application/pdf` dengan `Content-Disposition: inline`

### Note
- Upload Drawing PDF & Customer Ref pakai `window.location.reload()` setelah sukses karena `drawing.file_id` field ada di parent state — untuk kesederhanaan. TODO refactor: pass callback to refresh row data


## 2026-07-29 — Repeat Order: Copy Items from Existing BOM + Auto-Status Draft→Issued

### 1. Repeat Order — Pick Source BOM (copy items)
**Skenario**: User klik Register Drawing Baru → pilih Repeat Order → pilih drawing yang di-repeat → **opsional pilih source BOM** → items dari source BOM di-copy ke BOM baru. Nomor BOM baru tetap auto-generate dari sequence bulan ini.

**Backend** (`/app/backend/routers/bom.py` — `POST /bom/register`):
- Tambah field `source_bom_id: str = ""` di `BomRegisterIn`
- Jika di-set, backend ambil `source_bom_ref` dari `db.boms.find_one`
- Deep-copy `items` (regenerate `id` per item, drop `_id`) → `copied_items`
- Inherit `project_name`, `customer`, `class_material`, `annotations` dari source BOM (kalau field kosong)
- Response tambah `source_bom_no`, `copied_items_count`
- Log action `bom_register_manual` includes `source_bom_id` + `copied_items`

**Backend** (`GET /bom/lookup`):
- Return `items_count` (untuk badge di UI) + `project_dwg` + `customer`
- Search field diperluas: `bom_no`, `so_no`, `project_name`, `project_dwg`, `customer`

**Frontend** (`DrawingForm`):
- Section amber "COPY ITEMS DARI BOM EXISTING (OPSIONAL)" — muncul setelah `repeatDrawing` dipilih
- Search input `sourceBomQ` pre-fill dengan `repeatDrawing.drawing_no` — surface BOM yang relevan
- Badge per opsi: nomor BOM (font-mono) + `{items_count} items` + SO/project/drawing
- Selected state: card "✓ Items akan di-copy dari BOM: BOMxxx · N items · SO"
- Toast sukses: `"Repeat Order tercatat — BOM xxx (dari drawing yyy) · N item di-copy dari BOM src"`
- Tombol "Batal" untuk unselect source BOM

**Verified via curl**:
- Create BOM dengan `source_bom_id` → response `bom_no: BOM006-07-2026`, `source_bom_no: BOM004-07-2026`, `copied_items_count: 2` ✓
- Item pertama: Plate A36 5mm Rev · qty 3 pcs ✓

### 2. Auto-Status Drawing: Draft → Issued
**Rule**: Ketika Drawing PDF di-upload untuk drawing yang status-nya `Draft`, sistem otomatis promote ke `Issued`.

**Backend** (`/app/backend/routers/drawing_register.py` — `POST /drawings/{id}/upload`):
- Setelah upload sukses, cek `existing.status`. Kalau lowercase == "draft" → set:
  - `status = "Issued"`
  - `status_auto_promoted_at = now`
  - `status_auto_promoted_by = username`
- Response include `status` + `status_auto_promoted` boolean
- Log action `drawing_upload` include `status_auto_promoted`

**Frontend** (`DrawingForm`):
- Label field Status: *"Status (auto: Draft → Issued saat Drawing PDF di-upload)"*
- Hint di bawah Status (register mode): *"Biarkan Draft — sistem otomatis ganti ke Issued setelah upload Drawing PDF."*
- Manual override tetap tersedia (user bisa pilih Issued/Draft/Cancelled sendiri kapan saja)

**Verified via curl**:
- POST `/drawings` new drawing → `status: Draft` ✓
- POST `/drawings/{id}/upload` mini.pdf → response `status: Issued, status_auto_promoted: true` ✓
- GET `/drawings?q=ZZ` → `status: Issued, file_id: ..., status_auto_promoted_at: 2026-07-29T00:43:45` ✓


## 2026-07-29 — BOM Counter Fix + Register Drawing Inline Upload Panel

### 1. Bug Fix: Nomor BOM Melompat (contoh: existing 005 → suggestion 008)
**Root cause**: `_next_bom_no()` menggunakan `db.counters.find_one_and_update({"$inc":{"value":1}})` yang increment counter setiap dipanggil — termasuk saat register gagal (validation error, collision) atau saat BOM dihapus. Counter dan actual max BOM di DB jadi tidak sinkron.

**Fix** (`/app/backend/routers/bom.py`):
- Buat helper `_current_max_bom_seq(mm, yyyy)`: scan actual `db.boms` docs matching pattern `^BOM(\d{3})-MM-YYYY$` (aktif, tidak deleted), return max seq.
- `_next_bom_no()`: idempotent — return `max_seq + 1` dari helper. **Tidak lagi update counter**.
- `preview_next_bom_no` (`/api/bom/next-number`): pakai helper yang sama. `last_bom_no_this_month` sekarang konsisten (dari max seq, bukan sort by `uploaded_at`).
- `register_bom_manual`: race-safety retry — kalau `_next_bom_no()` return nomor yang ternyata sudah dipakai (concurrent create), naikkan seq lagi sampai unique (max 20 iterasi).
- Counter `bom_seq_2026_07` dihapus dari DB (tidak dipakai lagi).

**Verified**: Existing BOM tertinggi = BOM005 → preview `/api/bom/next-number` = **BOM006** ✓ (sebelumnya lompat ke BOM008/009 karena counter drift)

### 2. Register Drawing Baru — Inline File Upload Panel
**Sebelum**: User harus klik Register → dialog tutup → cari drawing di list → klik Upload PDF → dialog upload terpisah. UX ribet.

**Sesudah**: Setelah klik Register, dialog **tetap terbuka** dan menampilkan panel `DrawingAttachmentsPanel` yang aktif. User bisa langsung upload semua file (Drawing PDF, Customer Ref, Nesting, Costing) dalam 1 flow.

**Frontend** (`DrawingForm`):
- State baru `justRegistered` — set setelah `POST /drawings` sukses. Tidak langsung call `onSaved` (yang akan tutup dialog).
- Computed `activeDrawing = initial?.id ? initial : justRegistered` + `isPostRegister = !initial && !!justRegistered`
- UI baru saat `isPostRegister`:
  - Banner hijau "✓ Drawing Berhasil Diregister" — tampilkan drawing_no
  - Panel Attachments aktif (identik dgn mode Edit)
  - Footer button: `Batal + Register` → **`✓ Selesai`** (hijau) — panggil `onSaved` → tutup dialog + reload list
- `handleRegistered` di parent dibersihkan: tidak lagi auto-open UploadDialog terpisah (redundant)

**DrawingAttachmentsPanel** refactor:
- Ganti `window.location.reload()` (destructive) dgn state `localDrawing` yang di-patch in-place setelah upload sukses
- Prop baru `onDrawingUpdated` → callback ke parent (DrawingForm) untuk sync `justRegistered` state
- Semua reference `drawing.*` diganti `activeDwg.*` supaya UI reactive tanpa reload
- Toast auto-status: kalau `data.status_auto_promoted` → "Drawing PDF ter-upload — status otomatis Issued"

**Test verified (screenshot)**:
- Ketik initial "QQ" → drawing_no `DWG.26.07.08_MKS.QQ.A.00` + BOM preview `BOM006-07-2026` ✓
- Klik Register → dialog tetap terbuka + banner hijau + Attachments panel visible ✓
- Tombol footer berubah jadi `✓ Selesai` ✓
- Klik Selesai → dialog tutup + drawing muncul di list dgn BOM006-07-2026 ✓


## 2026-07-29 — Multi-Feature Batch: Fiana Access + Pipe Schedule DB + Auto-Weight All Categories + BOM Read-Only Attachments + SO Required Autocomplete

### 1. Fiana (Purchasing) Access ke Engineering + Material Costing
- **LandingPage.jsx**: Card Engineering roles ditambahi `"purchasing"` — sekarang Fiana lihat 2 kartu (Engineering + Purchasing)
- **AppShell.jsx**: Nav shortcut *"Material Costing"* muncul saat `isPurchasing || isFinanceOnly` (bukan hanya isLanding false)
- Password `fiana` di-reset ke `admin123`
- Backend `_can_edit()` sudah include `purchasing` role — Fiana bisa full CRUD Material Costing

### 2. Pipe Schedule DB (ASME B36.10M / B36.19M)
- **New file** `/app/frontend/src/lib/pipeScheduleDB.js`:
  - `PIPE_NPS_TO_OD_MM` — 30 NPS entries (1/8" → 36")
  - `PIPE_SCH_WALL_MM` — wall thickness per NPS × Schedule (STD/XS/XXS/5S/10/10S/20/30/40/40S/60/80/80S/100/120/140/160)
  - `lookupPipeSchedule(nps, sch, density)` → return `{od_mm, wall_mm, weight_per_meter_kg}`
  - Formula: **W/m = π × (OD − t) × t × ρ / 1e6**
- **UI**: `PipeScheduleSelector` panel violet — muncul otomatis saat `material_type` contains "PIPE". User pilih NPS + Schedule → auto-tampil OD, wall, kg/m, total kg (berdasarkan panjang). Klik "↓ Isi ke Form" → auto-fill `outer_diameter_mm`, `wall_thickness_mm`, `length_mm`, `size_description`
- **Verified**: 8" SCH 40 → OD 219.1mm, wall 8.18mm, 42.549 kg/m ✓ (sesuai standar ASME)

### 3. Auto-Weight untuk Semua Kategori Raw Material
**Sebelum**: Hanya Plate/Sheet yang auto-calc. Pipe, Round Bar, Square Bar, Angle, H-Beam, Channel, Hollow Section semuanya manual.

**Sesudah** (`MaterialCostingPage.jsx` useEffect compute):
- **Plate / Sheet**: `L × W × T × density / 1000`
- **Pipe** (hollow cylinder): `π/4 × (OD² − ID²) × L × density / 1000`
- **Round Bar** (solid cylinder): `π/4 × OD² × L × density / 1000`
- **Square Bar** (solid): `side² × L × density / 1000`
- **Hollow Square (SHS)**: `(W² − inner²) × L × density / 1000` (inner = W − 2t)
- **Hollow Rect (RHS)**: outer − inner
- **Angle L**: `(2 × leg × t − t²) × L × density / 1000`
- **Channel U** (approx): flange + web
- **H-Beam / WF / IWF** (approx I-beam): 2 flange + web
- **Wire Mesh**: fallback plate-like
- Semua pakai satuan mm → cm³ → kg konsisten. Dependency di useEffect ditambah `outer_diameter_mm`, `wall_thickness_mm` supaya re-compute saat user isi.

### 4. BOM Attachments — Read-Only View (Auto Pull from Master Drawing)
**Sebelum**: BOM page punya panel upload sendiri (Drawing PDF, Nesting PDF, Costing Excel) — duplikat dengan Master List Drawing. Risiko: upload ganda, duplikasi file, versi tidak sinkron.

**Sesudah**:
- **Deleted** `/app/frontend/src/components/BomAttachments.jsx` (versi lama dengan upload)
- **New** `/app/frontend/src/components/BomAttachmentsReadOnly.jsx`:
  - Fetch linked drawing (via `bom.drawing_id`) → tampilkan MKS Drawing PDF + Customer Drawing Reference
  - Fetch bom_attachments → tampilkan Nesting PDF + Costing Excel
  - Semua **read-only**: hanya button Preview (Eye icon), tidak ada Upload/Delete
  - Header: *"Kelola file di menu Master List Drawing"* dengan link ke drawing
  - Preview inline via iframe (PDF/image) + info card (Excel)
- **BOMPage.jsx**: import diganti ke `BomAttachmentsReadOnly`
- Semua upload sekarang exclusive di Master List Drawing (Edit dialog → panel Attachments)

### 5. SO No Required + Autocomplete (Register Drawing)
- **Label**: dari `"SO No (opsional)"` → `"SO No *"` (wajib)
- **Component baru** `SOAutocompleteInput`:
  - Fetch `/api/sales-orders/autocomplete?q=...&limit=20` (endpoint sudah ada)
  - Debounced 200ms, dropdown responsif dengan keyboard nav (↑↓ Enter Esc)
  - Menampilkan: SO No (mono bold), Customer, Description, SO Date
  - Badge hijau `✓ {customer}` bila exact match; badge amber `⚠ Tidak ada di Master SO` bila mismatch
  - Input styling: border rose kalau kosong (required indicator)
- **Validation** di `save()`: `if (!f.so_no.trim()) toast.error("SO No wajib diisi")` sebelum submit
- **Verified**: 17 SO ter-load di autocomplete dari database ✓

### Test Credentials Update
- `fiana` / `admin123` (purchasing — Full CRUD Material Costing + Engineering access)


## 2026-07-29 — Smart Paste + Complete Structural Section Parser

### 1. Smart Paste — Ketik/Paste 1 Baris, Auto-Detect Semua
User keluh sebelumnya: harus pilih Jenis manual dulu, baru ketik ukuran. Sekarang: **paste 1 baris deskripsi lengkap, sistem auto-fill Grade + Jenis + Ukuran + Berat**.

**Format:** `GRADE | JENIS | UKURAN` (separator `|` opsional — regex juga deteksi grade di awal)

**Frontend** (`MaterialCostingPage.jsx` — `RawMaterialFields.smartParse()`):
- Split by `|` → gradePart + descPart
- Fallback: regex `^((?:ASTM|API|AISI|JIS|DIN|EN)?\s*[A-Z][A-Z0-9]+(?:\s+Gr\.?\s*[A-Z0-9.]+)?)` untuk deteksi grade
- Deteksi Jenis via keyword patterns (11 tipe: H-Beam, WF, IWF, Angle L / Siku, SHS / Hollow Square, RHS / Hollow Rect, Channel / UNP / CNP, Seamless Pipe / Pipe, Plate Strip / MS Plate / Plate, Sheet, Round Bar, Square Bar, Wire Mesh)
- **Pipe SCH detection**: regex `(\d+(?:[-/]\d+)?)"?\s*(?:SCH|Sch|sch|S)\s*(\d+[A-Za-z]*)` → panggil `lookupPipeSchedule(nps, sch)` untuk auto OD + wall + weight/m
- Length detection: `x N M` / `N Mtr` / `N Meter`
- Sisanya di-delegate ke `parseAndCompute(dimText, jenis)` dengan **overrideType** untuk hindari race condition state update

**UI** (panel hijau paling atas RawMaterialFields):
- Legend jelas: **"📋 Urutan Input: GRADE | JENIS | UKURAN"** dengan 3 kolom penjelasan
- Contoh diberi: `S275JR | H Beam 125 x 125 x 6.5 x 9mm x 6M Lg` + `API5L Gr. B Seamless Pipe 10" S80 x 6 Mtr`
- Tombol `⚡ Parse` + Enter key handler
- Manual dropdowns Jenis + Grade + Pipe Schedule Selector tetap tersedia (boleh auto boleh manual — user's request)

### 2. parseAndCompute Refactor
- Accept optional `overrideType` argument → derive `_isPlate`, `_isPipe`, ... locally instead of closure
- Fix bug: `isRound` block missing `if (nums.length >= 2)` guard → syntax error fixed
- Renamed `isSquare` → `isSquareBar` throughout (proper convention)
- Add support for `isSHS`, `isRHS`, `isAngle`, `isHBeam`, `isChannel`, `isStructural`

### 3. Manual Dim Override Fields per Type
Detail dropdown expanded — sekarang setiap kategori punya field label yang tepat:
- **SHS**: Sisi + Wall + Panjang
- **RHS**: Width + Height + Wall + Panjang
- **Angle L**: Leg + Tebal + Panjang
- **H-Beam / Channel**: H + B + tw + tf + Panjang (5 fields)
- **Live dimension summary** di preview area juga di-update per type

### 4. Test Results (verified via smoke test)
| Input | Detected Jenis | Dimensi + Berat |
|---|---|---|
| `S275JR \| H Beam 125x125x6.5x9mm x 6M Lg` | H-Beam ✓ | H=125 B=125 tw=6.5 tf=9 L=6000mm → auto calc |
| `S275JR \| Angle L - 65x65x6 x 6M Lg` | Angle L ✓ | leg=65 t=6 L=6000mm |
| `S275JR \| SHS 100x100x4.5mm x 6M Lg` | Hollow Square ✓ | side=100 wall=4.5 L=6000mm |
| `S275JR \| Channel 200x80x7.5x11mm x 6M Lg` | Channel U ✓ | H=200 B=80 tw=7.5 tf=11 L=6000mm |
| `S275JR \| MS Plate 4'x8'x4mm Thk` | Plate ✓ | L=2438.4 W=1219.2 T=4 |
| `S275JR \| MS Round Bar Dia. 16mm x 6M Lg` | Round Bar ✓ | Ø=16 L=6000mm |
| `API5L Gr. B Seamless Pipe 10" S80 x 6 Mtr` | Pipe ✓ | **ASME lookup: OD 273.1 · wall 15.09 · 96.016 kg/m · Total 576.098 kg** |


## 2026-07-29 — Master Drawing UX Consolidation + Compact Cards + Excel Preview

### 1. Master Drawing List — Simplified Row Interaction
- **Customer Ref column DIHAPUS** dari list utama (11 kolom sisa: Drawing No | Title | Rev | Discipline | SO | BOM | Project | Prepared By | Status | File MKS | Aksi)
- **Row clickable**: klik row (kecuali kolom Aksi) → buka Edit dialog dengan panel Attachments (upload/preview/delete di 1 tempat)
- **File MKS clickable**: klik nama file → langsung preview PDF (`Eye` icon inline, underline violet, `stopPropagation` supaya tidak trigger row click ke edit)
- **Aksi cell disederhanakan**: hanya Edit (pencil), Preview (Eye — kalau ada file), Delete (Trash)
- Tombol "Upload PDF" terpisah dihilangkan → upload/replace/delete file sekarang dari edit dialog attachments panel

### 2. Delete Endpoint untuk Drawing PDF (backend)
- **New** `DELETE /api/drawings/{drawing_id}/file` — hapus GridFS file + clear file metadata (file_id, filename, uploaded_at, pdf_match_status), drawing record tetap ada
- `_can_edit` guard (super_admin/admin/purchasing/eng_head)
- Frontend: Trash icon di Slot untuk `drawing_pdf` + `customer_ref` (sebelumnya hanya Nesting/Costing)

### 3. Compact Cards (visual polish)
- **CategoryCard** (Semua/Raw/StdParts/Consumable/Subcon/Paint): dari p-4 dengan desc → px-3 py-1.5 hanya icon+label (compact chips)
- **PriceAveragesBar**: grid dari 6 kolom → 10 kolom (lebih dense), padding p-2 → py-1, buang min-max range dari card body (tetap accessible via tooltip)

### 4. Excel Preview — Excel-Like Rendering with A4 View Toggle
- **Backend** `_excel_to_html` (openpyxl, no LibreOffice):
  - Baca `ws.column_dimensions[letter].width` → emit `<colgroup>` dengan explicit widths (7px per Excel unit)
  - Baca `ws.merged_cells.ranges` → apply `rowspan`/`colspan` di HTML, skip cells yang tersembunyi karena merge
  - Preserve row heights via `ws.row_dimensions`
  - Preserve alignment (`cell.alignment.horizontal`) + auto-right-align untuk number
  - Bold detection via `cell.font.bold`
  - Numbers: format `1,000` (comma thousand sep) — since Excel is English style
- **View toolbar** (sticky top):
  - 🖥 **Fit** — full workspace width
  - 🖨 **A4 Portrait** — 210mm wide (untuk print portrait)
  - 🖨 **A4 Landscape** — 297mm wide (untuk print landscape)
- **Multi-sheet tabs** dengan active state indicator (emerald bar bottom)
- **iframe rendering** — no download, tampil inline seperti spreadsheet

### 5. Additional Features (batch)
- **Compact Smart Paste**: Panduan format sekarang collapsible (`ℹ Panduan` toggle) — default hidden, hanya 1 baris input aktif
- **PriceInput component**: auto-format 1500000 → 1.500.000 (Indonesian `.` thousand sep, `,` decimal). Empty pada zero value (leading zero fix)
- **SupplierAutocompleteInput**: dropdown dari `/api/material-costing/suppliers` (distinct + count), keyboard nav ↑↓ Enter
- **Tanggal Update Harga field**: auto-fill hari ini (`YYYY-MM-DD`), user bisa override untuk backdate


## 2026-07-29 — BOM Costing Report Popup + PDF Mismatch Prominent Warning

### 1. BOM Costing Excel — Structured Report Popup
User: *"begitu klik data, bukan preview excel, tp melainkan sebuah popup yg berisi format tabel yg udh rapi dan tinggal lihat angka yg di ambil dr excel. yang ditampilkan bagian report aja. paling bawah klu mau download/preview full data excel silahkan"*

**Backend** (`/app/backend/routers/bom_attachments.py`):
- `_extract_costing_report(xlsx_bytes)`: 
  - Load workbook, cari sheet `REPORT` (fallback to first sheet)
  - Build label→(row,col) map dari semua cell text
  - `find_number_near(label)` — scan up to +6 cols right / +3 rows down untuk numeric value
  - Extract: header (project_name, client, qty, date, drawing_ref, prepared/checked/approved by), direct_cost (7 items: Raw Steel, Raw Other, Std Parts, Direct Labour, Consumables, Subcontractor, Mobilization), indirect_cost (11 items: Indirect Labour, Engineering, QA/QC, Maintenance, Paperwork, Facilities, Overhead, Contingency, Profit Margin, Marketing, Fee for Customer), totals (grand_total, all_total, selling_price_per_pc)
- `GET /api/bom/{bom_id}/attachments/{attach_id}/costing-summary` — return structured JSON

**Frontend** (`BomAttachmentsReadOnly.jsx` — `CostingReportDialog`):
- Klik preview costing → langsung popup rangkuman (bukan Excel raw)
- Header card: Project · Client · Qty · Drawing Ref
- Section A: Direct Cost — list dgn subtotal hijau
- Section B: Indirect Cost — list dgn subtotal sky-blue
- Grand Total card amber: Total Cost, Selling Price All Qty, **Selling Price / Pc** (largest text)
- Footer button "Lihat Full Excel" → fallback ke ReadOnlyPreviewDialog kalau user perlu detail
- Note text di bawah tentang sheet yang diekstrak (biasanya `REPORT`)

### 2. Drawing PDF Mismatch — Prominent Warning
User: *"kenapa sy upload drawing, nomor pasti beda, kenapa gk auto muncul warning bahwa PDF ini nomor drawing didlm file gk sama dgn register, lalu suruh upload ulang"*

**Sebelum**: `pdf_match_status=warning` tercatat di DB, tapi UI hanya text kecil "isi PDF tidak match" di list.

**Sesudah**:
- **Toast merah `toast.error`** saat upload dgn mismatch: shows extracted candidate numbers + registered no + hint "Klik Replace atau Hapus"
- **Banner merah prominent** di dalam Attachments panel (`data-testid="dw-mismatch-warn"`):
  - "⚠ NOMOR DRAWING PDF TIDAK MATCH!" bold
  - Registered: `DWG.xxx` (font-mono)
  - PDF berisi: extracted candidates
  - Note pesan detail dari backend
  - Instruksi: "Replace file dengan PDF yang benar, atau Hapus lalu upload ulang"
- Tampil terus-menerus sampai file diganti (permanent visual reminder)


## 2026-07-29 — Costing Report Real Structure + BOM Drawing Attachments Fix + Isi Data BOM Button

### 1. Costing Report Excel — Real Structure Match (Sesuai Sheet REPORT)
**Sebelum**: Extract label saya salah — sections A-E hanya generic Direct/Indirect Cost.
**Sesudah** (`_extract_costing_report`): Sesuai struktur real dari file F-ENG-007 (screenshot Bapak):

- **A. Procurement All Materials**: Raw Material Steel · Raw Material Other · Scrap Return · Std Parts/Mechanical
- **B. Direct Cost**: Direct Labour · Consumables
- **C. In-Direct Cost**: Indirect Labour · Design/DRW/Engineering
- **D. Subcontractor**: Cutting/Sawing/Shearing/Laser · Rolling/Bending
- **E. Miscellaneous**: Mob & Demob
- **F. Total Cost (A+B+C+D+E)** + adjustments (G. Safety Margin · H. Profit · I. Marketing Fee · J. Fee for Customer)
- **K. Total All Cost / Selling Price for All Qty**
- **L. Selling Price per Pc**

**Frontend** `CostingReportDialog`: render 5 sections dengan color accent berbeda (emerald/sky/violet/amber/slate) + adjustments card + Grand Total amber card. Verified via curl: Section B = 15.578.500 (Direct Labour 13.440.000 + Consumables 2.138.500), Section E = 300.000 (Mob & Demob) ✓

### 2. BOM Attachments — Drawing PDF & Customer Ref Fix
**Root cause**: `BomAttachmentsReadOnly` fetch drawing pakai `q=bom.drawing_id` (UUID) tapi endpoint search hanya match drawing_no/project_name.
**Fix**: 
- Query pakai `bom.drawing_no || bom.project_dwg || bom.drawing_id`
- Fallback: kalau tidak ketemu, fetch broader list (`limit=500`) dan filter by ID
- Sekarang MKS Drawing PDF + Customer Reference PDF muncul di BOM read-only

### 3. Tombol "➕ Isi Data BOM" di Panel Attachments Drawing
User: *"stlah input dokumen, mestinya ad menu utk isi BOM"*
- Tombol amber "**➕ Isi Data BOM (BOM007-07-2026)**" muncul di header panel Attachments kalau drawing punya `bom_id`
- Klik → buka `/bom?open={bom_id}` di tab baru → user langsung ke halaman BOM detail untuk isi items
- Tercatat via `data-testid="dw-goto-bom"`

### 4. Deferred (next session)
- Multi-upload untuk Drawing PDF (case: >1 dokumen drawing untuk 1 nomor) — perlu backend model change dari single `file_id` ke `files: [{id, filename, ...}]` array. Impact besar, dikerjakan terpisah supaya tidak break yang ada.



---

## Iter 35 (Feb 2026) — BOM Grid Entry + Engineering Approval Workflow + Multi-Drawing per SO

### Master Drawing Register Form (Iter 35.0)
- ✅ Dialog title: **"Register Drawing Baru + Order Baru"**
- ✅ Kolom **Title / Description DIHAPUS** (redundant — sudah ada Project Name)
- ✅ Kolom **Class of Material DITAMBAH** (input + datalist saran): `RAW MATERIAL FOR QTY 1 PCS`, `1 LOT`, `1 + 1 + 8 PCS`, dst — bisa custom bebas
- ✅ Backend `DrawingIn` schema tambah field `class_material`

### Multi-Drawing per SO (Iter 35.1) — Auto-Link BOM
- **Alur eksisting dikonfirmasi**: 1 SO bisa 2-3 drawing, tapi share 1 BOM. Items dicampur di BOM.
- ✅ **Auto-detect existing BOM by SO** saat register drawing baru:
  - Set `bom_link_mode = "existing"` + preselect BOM
  - Banner biru: "🔗 SO XXX sudah punya BOM YYY — drawing baru akan otomatis di-link"
- ✅ Engineering Master List page tampilkan kolom "Drawing(s) Terkait" per BOM

### BOM Grid Entry (Excel-like) + Approval Workflow (Iter 35.2 · P0 DELIVERED)

**Workflow status**: `draft` → `pending_review` (submit) → `approved` (Riskinova/eng_head approve, auto-muncul di BOM Utama). Legacy BOM upload = default `approved` (backward compat).

**Backend endpoints baru** (`/app/backend/routers/bom.py`):
- `POST /api/bom/{bom_id}/items-bulk` — replace all items sekaligus (Excel-like grid save)
- `POST /api/bom/{bom_id}/submit-review` — draft → pending_review + stamp signatures.prepared_by
- `POST /api/bom/{bom_id}/approve-review` — pending_review → approved + stamp signatures.checked_by (eng_head/admin only)
- `POST /api/bom/{bom_id}/reject-review` — pending_review → draft (alasan wajib)
- `POST /api/bom/{bom_id}/sign` — TT stage `acknowledged_by` (Purchasing) atau `approved_by` (Admin) setelah BOM approved
- `GET /api/bom?engineering_status=active|draft|pending_review|approved|all` — filter (default `approved` + legacy)

**BOM schema tambahan**:
- `engineering_status`: draft | pending_review | approved
- `signatures`: {prepared_by, checked_by, acknowledged_by, approved_by} — masing-masing {name, user_id, username, role, at}
- `review_rejection_reason`, `review_rejected_by`, `review_rejected_at`, `submitted_at`, `approved_at`
- `BOMItem` + `BOMItemIn` tambah field `purchase_due_date`

**Frontend page baru**:
- **`BomEntryGridPage.jsx`** (route `/engineering/bom-entry/:bomId`) — Full-screen Excel-like grid:
  - Kolom: `Item No (auto)` | `Item Specification*` | `Qty` | `Uom` (dropdown) | `Material` | `Weight (Kg)` | `Purchase Due Date` | `Remarks`
  - Navigation: **Enter = pindah kolom** → di kolom terakhir Enter = tambah baris baru + focus. **↑/↓ = pindah baris**. Baris kosong otomatis diabaikan saat save.
  - Block Tanda Tangan Berjenjang (4 kartu): Prepared By (user auto) · Checked By (Riskinova) · Acknowledged By (Susanto) · Approved By (Erwin) — filled = emerald ✓, unfilled = dashed "Menunggu ..."
  - Sticky action bar: Simpan Draft · Submit untuk Review · Approve/Reject (eng_head) · TT Acknowledge/Approve (stages)
  - Reject dialog inline dgn textarea alasan
- **`EngineeringMasterListPage.jsx`** (route `/engineering/master-list`) — Halaman utama Engineering:
  - Stat cards clickable: Total · Draft · Menunggu Review · Approved
  - Filter dropdown + search
  - Tabel list BOM dgn kolom Drawing(s) Terkait (up to 3 tampil + counter)
  - Tombol aksi contextual: "Isi Data" (draft) / "Review" (pending_review) / "Lihat" (approved)

**Bug fix routing (P0)**:
- ✅ Tombol "Isi Data BOM" di Master Drawing detail sekarang route ke `/engineering/bom-entry/{bom_id}` (fix pesan #695 user)

**Engineering Portal**:
- ✅ Kartu baru **"Engineering Master List — BOM"** (emerald) — entry point utama untuk workflow BOM Engineering
- ✅ Kartu lama "BOM" di-relabel "**BOM Utama**" (untuk Purchasing) dgn deskripsi hanya BOM approved

**Testing**: Backend curl e2e verified — draft register → items-bulk → submit-review → approve-review → visible di BOM Utama. Frontend screenshot smoke test PASS (Master List rendered draft BOM; Grid Entry page rendered semua kolom + signatures + action bar; Register Drawing form dgn Class of Material dan tanpa Title/Description).

**Files**:
- Backend: `routers/bom.py`, `routers/drawing_register.py`
- Frontend NEW: `pages/BomEntryGridPage.jsx`, `pages/EngineeringMasterListPage.jsx`
- Frontend UBAH: `pages/MasterDrawingPage.jsx`, `pages/EngineeringPortalPage.jsx`, `App.js`


---

## Iter 36 (Feb 2026) — Unified Engineering Work Order Page + Revision Cycle + Riski Role Rename

### A. Role Rename: eng_head → eng_leader (Riski = "Engineering Leader")
- ✅ Added `eng_leader` as new canonical role for Engineering Leader
- ✅ `eng_head` kept as legacy alias — same permissions (both in `ENGINEERING_HEAD_ROLES`)
- ✅ `deps.py`, `auth.py`, `bom.py` (approve/reject/revision endpoints), `material_costing.py`, `drawing_register.py` semua accept both
- ✅ **Direct DB migration**: `users.riski.role: eng_head → eng_leader` (idempotent startup migration in `server.py`)
- ✅ Frontend: all role arrays extended `["eng_leader", "eng_head", ...]` (backward compat)
- ✅ UI labels: "Eng Head" / "Engineering Head" → **"Engineering Leader"** everywhere (AdminPage, SalesPage)
- ✅ Zul tetap `eng_head` (only Riski migrated ke eng_leader)

### B. Unified Engineering Work Order Page (P0 delivered)
User: *"kenapa gk di 1 menu aja ? register drawing > upload pdf drawing, upload customer reference, upload nesting, upload costing sebelumnya lalu input BOM. hbs itu kirim ke RISKI utk review ENG LEADER"*

**Page**: `BomEntryGridPage.jsx` (route tetap `/engineering/bom-entry/:bomId`) — dirombak jadi **`EngineeringWorkOrderPage`** dengan 5 section berurutan:

1. **Info Drawing / Order** — BOM No, SO, Customer, Project, Class of Material, Delivery Date + list "Drawing(s) Terkait" (semua drawing yang link ke BOM ini via `so_no`)
2. **Attachments (Upload File Pendukung)** — 4 slot terkategori warna-warni:
   - Violet: **Drawing PDF (MKS)** — `.pdf`
   - Sky: **Customer Reference** — `.pdf, .jpg, .png`
   - Amber: **Nesting** — `.pdf, .xlsx, .xls`
   - Rose: **Costing Sebelumnya** — `.xlsx, .xls, .pdf`
   - Each slot support upload/preview/delete inline
3. **Grid Data BOM (Excel-like)** — Enter=pindah kolom, Enter di kolom terakhir=tambah baris. Kolom lengkap: Item No | Item Spec | Qty | Uom | Material | Weight | Purchase Due Date | Remarks
4. **Revision History dari Engineering Leader** — panel orange dgn timeline notes (kind: `note` / `reject`) + attachment revisi. Muncul otomatis kalau ada notes; Engineering Leader bisa tambah note baru saat `pending_review`
5. **Tanda Tangan Berjenjang** — 4 kartu: Prepared By (auto user) · Checked By (Riski/Engineering Leader) · Acknowledged By (Susanto/Purchasing) · Approved By (Erwin/Admin)

**Sticky action bar** bawah: `Simpan Draft` · `Submit ke Engineering Leader` · `Approve/Reject` (Riski) · `TT Acknowledge/Approve` (stage lanjutan) · `Buka di BOM Utama →` (setelah approved)

### C. Revision Cycle (Upload File + Komentar)
**Backend endpoint baru**: `POST /api/bom/{bom_id}/revision-note` — Engineering Leader tambah `{comment, attachment_ids[]}` ke `revision_notes[]`

**Reject-review dimodifikasi**: kini juga auto-append revision note dengan `kind: "reject"` — jadi semua feedback (comment + reject reason + attachments) terkonsolidasi di `revision_notes[]` timeline.

**Frontend dialog** (`RevisionNoteDialog`):
- Mode `note`: komentar saja atau + file (opsional)
- Mode `reject`: alasan reject wajib + optional attachment
- Upload file revisi langsung ke `bom_attachments` dengan category `revision`

**Attachment categories baru** (`bom_attachments.py`): tambah `customer_ref`, `costing_prev`, `revision` di `VALID_CATEGORIES`.

**Alur revisi (verified via curl):**
1. Engineer submit → status `pending_review`
2. Riski (eng_leader) add revision note → `revision_notes[]` grow
3. Riski reject dengan alasan + file → status back to `draft` + revision_notes[] append
4. Engineer lihat semua notes/attachments di RevisionPanel → perbaiki BOM
5. Submit ulang → cycle repeats sampai approved

### D. Master Drawing "Register" → Auto-Redirect ke Work Order
Setelah user save drawing baru (yang punya `bom_id`), otomatis redirect ke `/engineering/bom-entry/{bom_id}?just_created=1` — user langsung masuk 1-page unified flow, tidak perlu klik "Isi Data BOM" lagi.

### E. Backend fixes (pre-existing bugs found)
- `material_costing.py`: missing `import re` (F821) + duplicate `$ne` dict key (F601) — fixed ke `$nin: [None, ""]`

### Files affected
- Backend: `deps.py`, `routers/auth.py`, `server.py` (startup migration), `seed_data.py`, `routers/bom.py` (revision-note endpoint, reject-review with attachments, role checks), `routers/bom_attachments.py` (new categories + flat items array in list endpoint), `routers/material_costing.py` (role check + re import fix), `routers/drawing_register.py` (role check)
- Frontend: `pages/BomEntryGridPage.jsx` (**full rewrite** → unified Work Order page dengan 5 sections + attachment slots + revision panel + note dialog), `pages/MasterDrawingPage.jsx` (auto-redirect after register), `pages/AdminPage.jsx` (label rename), `pages/SalesPage.jsx` (label rename), `components/AppShell.jsx`, `pages/BOMPage.jsx`, `pages/EngineeringMasterListPage.jsx`, `pages/LandingPage.jsx`, `pages/MaterialCostingPage.jsx`, `App.js` (all add `eng_leader` ke role arrays)
- `/app/memory/test_credentials.md`: updated riski role to `eng_leader`

### Testing status
- Backend curl e2e full workflow: register → items-bulk → submit-review → revision-note (comment) → reject-review (with reason) → verify revision_notes[] grows correctly → cleanup ✅
- Frontend smoke test: unified Work Order page renders 5 sections properly (Info Drawing + Drawing Terkait + 4 attachment slots + Grid + action bar) ✅
- Engineering Portal shows "Engineering Master List — BOM" as main card ✅


---

## Iter 37 (Feb 2026) — Notifications + Drawing Multi-File + Portal Rebranding + SO-First Order Flow

### A. BOM Approval Notifications (P0 delivered)
Untuk melengkapi workflow Iter 36 — Riski (Engineering Leader) sekarang dapat notif otomatis saat ada BOM menunggu review; engineer dapat notif kalau BOM di-return dengan revision note.

**Backend endpoint update** (`routers/notifications.py`):
- Kategori baru **`bom_pending_review`** (severity: critical) — visible untuk `eng_leader`/`eng_head`/admin. List BOM dgn `engineering_status=pending_review` sorted by `submitted_at` desc.
- Kategori baru **`bom_revision_needed`** (severity: warn) — visible untuk eng roles. Show BOM yg di-return ke draft dengan `revision_notes[]`. Untuk `eng_staff` filtered ke `signatures.prepared_by.user_id === current_user_id` (hanya BOM yg mereka prepare).
- Kedua kategori punya `link → /engineering/bom-entry/{id}` — klik langsung buka Work Order page.

**Testing**: curl e2e verified — Riski melihat pending_review, Madian melihat revision_needed setelah reject.

### B. Drawing Multi-File Attachment (P1 delivered)
User request Pesan #673: "kadang dokumen drawing lebih dari 1 file"

**Backend** (`routers/drawing_register.py`):
- New field `additional_files: []` array di drawing document — array of {id, file_id, filename, label, ext, size, content_type, uploaded_at, uploaded_by}
- 3 endpoint baru: `POST /drawings/{id}/extras`, `GET /drawings/{id}/extras/{extra_id}/preview`, `DELETE /drawings/{id}/extras/{extra_id}`
- Allowed extensions: `.pdf, .jpg, .jpeg, .png, .dwg, .dxf, .xlsx, .xls, .zip`
- Max 100 MB per file

**Frontend** (`MasterDrawingPage.jsx`):
- New panel "File Tambahan Drawing (N)" di attachment section — full-width panel
- Multi-file upload, preview, delete inline
- Description: "Untuk kasus 1 drawing = beberapa file (mis. rev-1, rev-2, detail view, foto)"

### C. Legacy BOM Auto-Heal + Empty-Approved Grace Path
**Problem**: BOM yang dibuat pre-Iter35 tidak punya `engineering_status` field → frontend anggap "approved" → user tidak bisa edit.

**Fix**:
1. **Startup migration** (`server.py`): BOM tanpa `engineering_status` + 0 items → auto-set ke `draft`. Idempotent, safe to re-run.
2. **On-read auto-heal** (`GET /bom/{id}`): Kalau BOM legacy dibuka, otomatis set status ke draft.
3. **Items-bulk endpoint**: Allow save when items count = 0 (grace path), even if status is `approved`. Auto-reset status ke draft on save.
4. **Frontend edit rule**: `canEditItems = true` when BOM is approved BUT empty (0 items) — user can fill legacy empty BOMs.
5. **7 legacy BOMs** (BOM001-008-07-2026 + test) sudah dimigrasi ke draft.

### D. Bug Fix: DrawingIn Schema Missing `class_material`
- Field `class_material` di-reference di payload but not declared di `DrawingIn` model → AttributeError saat POST /drawings
- Fix: added `class_material: str = ""` ke schema

### E. Portal Rebranding & Reorder Cards
User feedback: "Engineering Master List — BOM" bikin bingung (seolah ada 2 BOM). Rename + reorder:
1. **Costing (Inquiry Sales)** — Wrench icon
2. **Engineering Masterlist Material Price** (renamed dari "Material Costing Database") — CurrencyCircleDollar icon
3. **Master List Drawing** — FileText icon
4. **BOM Preparation & Approval** (renamed dari "Engineering Master List — BOM") — ClipboardText icon · desc: "Ruang kerja Engineering untuk siapkan & review BOM sebelum masuk ke Purchasing"
5. **Bill of Material (BOM)** — Package icon · untuk Purchasing (hanya approved)

Page title `EngineeringMasterListPage.jsx` juga di-update jadi "BOM Preparation & Approval".

### F. Unified Register Drawing → Work Order Page (P0 UX rework)
User: "kenapa gk pas klik register drawing, langsung arahkan ke Work Order aja"

**Alur baru**:
- Klik "Register Drawing Baru" di Master Drawing → **langsung navigate ke `/engineering/bom-entry/new`** (no modal)
- Halaman `EngineeringWorkOrderPage` sekarang punya 2 mode:
  - **`new` mode** — render `<NewOrderForm />` (3-step wizard)
  - **existing `{bomId}` mode** — render full 5-section work order view

**NewOrderForm 3-step wizard** (sesuai alur user):
1. **Jenis Order** (New/Repeat cards)
2. **Step 1 — Cari/Pilih Nomor SO** ⭐ (di paling atas — semua field lain baru unlock setelah SO dipilih)
   - Autocomplete dari `/api/sales-orders?q=`
   - Auto-fill Customer field saat pilih
   - **SO tidak ditemukan** (≥3 chars typed) → Banner merah + tombol "Buka Master SO → (buat SO baru)" + hint "hubungi admin/sales via WhatsApp/Telegram"
   - Confirmed state: input jadi disabled, tombol "Ganti SO" tersedia
   - Auto-detect existing BOM per SO (untuk multi-drawing per SO scenario) → banner biru
3. **Step 2 — Nomor Drawing (Auto-Generate)** (hanya muncul setelah SO confirmed)
   - Customer Code · Project Initial · Drawing Type · Override manual (opsional)
   - Live preview `next_number` dari `/drawings/next-number`
4. **Step 3 — Detail Order** (hanya muncul setelah SO confirmed)
   - Project Name · Class of Material (dgn datalist saran)

**Submit** → POST `/drawings` (create Drawing + BOM sekaligus) → redirect ke `/engineering/bom-entry/{new_bom_id}?just_created=1` → user lanjut upload files + isi grid BOM.

**New BOM defaults** (drawing_register.py `create_drawing`): sekarang set `engineering_status: "draft"` + `signatures: {}` untuk workflow yg konsisten.

### Files affected
- Backend: `routers/notifications.py` (2 kategori baru), `routers/drawing_register.py` (multi-file endpoints + class_material schema + engineering_status default), `routers/bom.py` (items-bulk grace path + submit-review grace + get_bom auto-heal), `server.py` (BOM auto-heal migration)
- Frontend: `pages/BomEntryGridPage.jsx` (NewOrderForm 3-step wizard, SO-first flow, WorkOrderView split), `pages/MasterDrawingPage.jsx` (multi-file drawing panel, "Register Drawing Baru" → Link ke new work order), `pages/EngineeringMasterListPage.jsx` (rename title), `pages/EngineeringPortalPage.jsx` (reorder + rename cards)

### Testing
- Backend curl e2e (Iter 35 flow + notifications + drawing extras): ✅ All passed
- Frontend screenshots: ✅
  - Portal reorder (Costing → Material Price → Drawing → BOM Prep → BOM)
  - NewOrderForm dgn autocomplete + SO not-found banner + Master SO redirect
  - Multi-file drawing panel di Master Drawing edit dialog
- Legacy BOM008 sekarang muncul sebagai DRAFT & bisa diedit ✅


---

## Iter 38 (Feb 2026) — SO Request Workflow + Reset OrderType + Repeat Order Auto-Copy

### A. SO Request from Engineering to Admin/Sales/Purchasing (P0)
User feedback: "mestinya jgn buat SO sendiri (Engineering bukan yang buat SO), bagusnya ksh notif ke admin/sales/Purchasing utk buat SO ini"

**New backend module** `routers/so_requests.py`:
- Collection `so_requests` dengan status: `pending | fulfilled | rejected`
- `POST /api/so-requests` — create request {requested_so_no, customer_hint, project_hint, notes}. Anti-duplicate (per SO), anti-double-book (kalau SO sudah exist di Master SO).
- `GET /api/so-requests?status=pending` — engineer sees own; admin/sales/purchasing sees all
- `POST /api/so-requests/{id}/fulfill` — admin/sales mark as done (auto-called saat SO benar-benar dibuat di master, atau manual)
- `POST /api/so-requests/{id}/reject` — dengan alasan

**Notification** (notifications.py): kategori baru **`so_requests`** untuk admin/sales/purchasing/supervisor — daftar pending SO requests dari Engineering. Link → `/so-master` (buat SO baru di situ).

**Frontend** (`BomEntryGridPage.jsx` — `SORequestPanel` new component):
- Menggantikan tombol "Buka Master SO" pada SO not-found state.
- Cek dulu apakah sudah ada pending request untuk SO no ini — kalau ada, tampilkan "sudah dikirim sebelumnya" (amber).
- Kalau belum: form kecil (Customer hint, Notes) + tombol **"Kirim Permintaan ke Admin/Sales"** (rose).
- Setelah kirim: state emerald "Permintaan SO terkirim — admin/sales/purchasing sudah dapat notifikasi. Setelah SO dibuat, kembali ke halaman ini dan pilih SO."

### B. Bug Fix: Reset Form saat Switch OrderType
User: "pas klik new order, lalu klik repeat order, mestinya kosong, kenapa kyk di copy"

**Fix**: New helper `changeOrderType(t)` yang reset seluruh state form:
- `f` state → default (customer_code=MKS, semua lain kosong)
- `soLookup`, `soOpen`, `soConfirmed`, `soSearchExecuted`, `existingBom` → reset
- `repeatSrc`, `repeatQ`, `repeatOpts` → reset
Radio button `onChange` sekarang panggil `changeOrderType` bukan `setOrderType` langsung.

### C. Repeat Order Flow — Auto-Copy Items + Attachments (P1)
User: "utk repeater order... tarik data BOM sebelumnya... drawing, BOM, nesting dan costing price sblmnya. lalu input SO dan BOM baru krn utk repeat order artinya so baru dan nomor BOM baru. BOM baru udh terisi dr data lama"

**Backend** (`drawing_register.py`):
- `DrawingIn` tambah field `source_bom_id: str = ""`
- Di `create_new` BOM mode: kalau `source_bom_id` diberikan → validate source exists → copy semua items (reset item_no & purchase_due_date) ke BOM baru
- Class of Material fallback dari source_bom kalau user tidak input
- BOM doc set `source`, `source_bom_id`, `source_bom_no`, `is_repeat`
- **Attachment reference-copy**: query `bom_attachments` dari source (kategori: drawing, customer_ref, nesting, costing, costing_prev) → insert copies dengan `bom_id` baru + `copied_from` reference. Costing lama otomatis berubah kategori ke **`costing_prev`** di BOM baru (jadi referensi harga historis).

**Frontend** (Repeat Order UI di NewOrderForm):
- Kalau `orderType === "repeat"`: muncul **Step 0 — Pilih BOM Sumber**
  - Autocomplete search: SO no / BOM no / Drawing no dari `/api/bom/lookup?q=`
  - Dropdown hasil menampilkan: bom_no, so_no, customer, project_name, items count, bom_date
  - Kalau tidak ada match (query ≥3 chars) → hint amber: "Buat sebagai New Order lalu upload manual"
  - Setelah pilih: preview card emerald dengan info source BOM + notif "Setelah submit, semua data ini akan tersalin ke BOM baru dan bisa Anda edit"
- SO Section (Step 1) hanya muncul setelah source BOM dipilih — dgn label khusus "Nomor SO BARU (repeat order = SO baru)"
- Submit payload: kirim `source_bom_id` ke backend `POST /drawings`

### Testing (curl e2e)
- Register repeat order dari source BOM dengan 2 items:
  - ✅ New drawing created (DWG.26.07.12_MKS.RPT01.A.00)
  - ✅ New BOM (BOM010) dgn `is_repeat: true`, `source_bom_no: BOM004`
  - ✅ 2 items ter-copy ke BOM baru
- SO request flow via curl: create → notification appears for admin ✅

### Files affected
- Backend NEW: `routers/so_requests.py`
- Backend: `server.py` (mount so_requests router), `routers/notifications.py` (so_requests category), `routers/drawing_register.py` (source_bom_id + copy items + copy attachments)
- Frontend: `pages/BomEntryGridPage.jsx` (SORequestPanel, changeOrderType, Repeat Order Step 0)


---

## Iter 39 (Feb 2026) — Riski Auto-Approve + Editable Info Drawing + BOM Reopen Workflow

### A. Riski Auto-Approve (P0)
User: "riski roles jg bs buat semua tanpa approval, krn dia jg bs keputusan final"

**Backend** (`bom.py` `submit-review`): Kalau user role = `eng_leader` (Riski), submit-review langsung set status ke `approved` (skip `pending_review`), stamp signatures.prepared_by DAN signatures.checked_by dengan nama Riski, plus flag `auto_approved_by_leader: True`.

### B. Master List Drawing → Click Row = Buka Work Order (P0)
User: "begitu klik item, popup kyk menu Engineering Work Order"

**Frontend** (`MasterDrawingPage.jsx`): Row `onClick` sekarang navigate ke `/engineering/bom-entry/{bom_id}` kalau drawing punya BOM linked. Kalau tidak ada BOM → fallback ke edit dialog (behavior lama).

### C. Editable Info Drawing di Section 1 (P0)
User: "kenapa semua menu ini diatas gk editable? sp tau Class of Material mau ubah, tanggal bom, tgl delivery"

**Backend endpoint baru** `PATCH /api/bom/{bom_id}/meta`: update field `class_material`, `bom_date`, `delivery_date`, `project_name`, `customer`, `so_no`. Hanya allowed saat status `draft`/`pending_review`. Log via `bom_meta_update`.

**Frontend** (`InfoDrawingSection` component): 
- Default view = read-only MetaCell display
- Tombol violet "✏️ Edit Info" muncul kalau `canEditItems` true
- Klik → semua field jadi editable Input (SO, Customer, Project, Class of Material, Tgl BOM, Tgl Delivery) + tombol "Simpan"/"Batal"

### D. BOM Reopen Workflow (P0) — Edit setelah Approved
User: "edit berlaku hny blm di setujui oleh eng leader. klu udh dan mau edit, mesti konfirmasi ke leader bahwa mau edit, klu setuju, br dibuka oleh riski. Klu revisi BOM, artinya otomatis harus ad revisi dan ad history perubahan dan alasan perubahan"

**Backend endpoints baru** (`bom.py`):
- `POST /api/bom/{id}/request-reopen` — engineer request izin edit ulang BOM approved (reason wajib min 8 char, cek anti-duplicate)
- `GET /api/bom/_/reopen-requests?status=pending` — list requests (eng_leader/admin lihat semua; engineer lihat sendiri). Path pakai `_/` prefix untuk hindari konflik dengan `/{bom_id}` catch-all.
- `POST /api/bom/_/reopen-requests/{req_id}/approve` — eng_leader approve → BOM back to draft, buat revision entry di array `revisions[]` (rev_no auto-increment, reason, requested_by, approved_by, timestamp, items_before snapshot, signatures_before snapshot)
- `POST /api/bom/_/reopen-requests/{req_id}/reject` — dengan alasan

**Collection baru** `bom_reopen_requests` — {bom_id, reason, status: pending/approved/rejected, requested_by, ...timestamps}

**BOM doc fields tambahan**: `current_rev_no`, `revisions: []` (array snapshot per revisi), `reopened_at`, `reopened_by`

**Notification** (notifications.py): kategori `bom_reopen_requests` untuk eng_leader/admin — count + list pending reopen requests dengan link ke Work Order.

**Frontend** (`ReopenRequestButton` component):
- Kalau BOM approved + user bukan eng_leader: tombol orange "🔓 Minta Izin Edit Ulang" → buka dialog isi alasan (min 8 char)
- Kalau sudah ada pending request + user bukan eng_leader: badge amber "⏳ Menunggu izin Riski"
- Kalau user eng_leader + ada pending request: tombol orange "✅ Approve Reopen (nama_pemohon)" — approve dengan konfirmasi dialog

**Revision History Panel** (`wo-bom-revisions`): indigo box menampilkan semua revisi historis — Rev.N, reason, requested_by, approved_by, timestamp, items count sebelum revisi. Muncul di Work Order page kalau BOM punya `revisions[]`.

### Testing (curl e2e full flow)
1. Madian create BOM + items + submit → status pending_review ✅
2. Riski approve → status approved ✅
3. Madian PATCH meta → **REJECTED 409** ✅
4. Madian request reopen dgn reason → tersimpan ✅
5. Riski approve reopen → status draft + rev_no=1 + revisions[1 entry] ✅
6. Madian PATCH meta → SUCCESS (class_material updated) ✅

### Files affected
- Backend: `routers/bom.py` (PATCH meta + reopen endpoints + submit-review auto-approve), `routers/notifications.py` (bom_reopen_requests category)
- Frontend: `pages/BomEntryGridPage.jsx` (InfoDrawingSection, ReopenRequestButton, BOM revisions history panel), `pages/MasterDrawingPage.jsx` (row click → Work Order)


---

## Iter 10 — PDF Drawing Content Validation + Global Table Pagination (2026-07-29)

### 1) Validasi Konten PDF Drawing saat Upload
**Endpoint**: `POST /api/bom/{bom_id}/attachments` (category=`drawing` + .pdf)

**Backend** — `/app/backend/routers/bom_attachments.py`
- Fungsi baru `_validate_drawing_pdf(target_dno, pdf_bytes)` → status: `match | mismatch | no_text | pdf_error | no_target`
- Scan per halaman (max 15 halaman, stop di first match) pakai `pypdf`
- Compare dengan `_normalize_dno(target_dno)` — case/space/dash insensitive
- Return **HTTP 400** dengan `detail = {message, target, candidates[], hint, validation}` bila mismatch atau pdf_error
- Return **200 + warning** untuk `no_text` (PDF scan tanpa text layer diizinkan)
- Simpan `pdf_validation` field ke dokumen attachment untuk audit trail

**Frontend** — `/app/frontend/src/pages/BomEntryGridPage.jsx`
- `upload()` handler tangkap `error.response.data.detail` (object) → toast merah dengan pesan + kandidat + hint
- On match: toast hijau ✓ "OK — Nomor drawing cocok (hal X)"
- On warning: toast oranye 8s "Terupload — [warning]"

**Testing**: 6/6 pytest scenarios lulus (match / mismatch 400 / no-text warning / kategori non-drawing skip)

### 2) Global Table Pagination (Compact + Dropdown Per-Page)
**Komponen baru**: `/app/frontend/src/components/PaginationBar.jsx`
- Named export `usePagination(data, defaultPerPage=20)` → `{page, setPage, perPage, setPerPage, pageCount, pagedData, total}`
- Default export `<PaginationBar />` — style compact: `‹ [input] / N ›` + dropdown 10/20/50/100
- Auto-reset ke page 1 saat data length shrink
- `data-testid` pattern: `{prefix}-bar`, `-per-page`, `-page-input`, `-prev`, `-next`

**Halaman diaplikasikan (14 pages)**:
| Page | testIdPrefix |
|---|---|
| BOMPage | `bom-list-pag` |
| EngineeringMasterListPage | `eml-pag` |
| MasterDrawingPage | `dw-pag` |
| MaterialCostingPage (refactor dari PAGE_SIZE=15 hardcode) | `mc-pag` |
| MasterItemsPage | `items-pag` |
| CustomerMasterPage | `cust-pag` |
| SOMasterPage | `so-pag` |
| SalesPage | `sales-pag` |
| DeliveryPage | `del-pag` |
| QCPage | `qc-pag` |
| StoreStockPage | `stock-pag` |
| IncomingReportPage | `ig-pag` |
| FormTemplatesPage | `templates-pag` |
| QuotationPage | `quo-pag` |

**Testing**: 14/14 pagination bar rendered after fixes (initial 12/14 — CustomerMasterPage missing import + IncomingReportPage missing `pag` decl — dua-duanya sudah dibetulkan).

### Files affected
- Backend: `routers/bom_attachments.py` (`+65 lines` validator + validation block + response fields)
- Frontend: `components/PaginationBar.jsx` (new), 14 pages patched
- Tests: `/app/backend/tests/test_iter10_pdf_pagination.py` (regression coverage)


---

## Iter 11 — MKS-F-ENG-005 Rebrand + Customer Code Master + Request-By Field (2026-07-30)

### 1) Rebrand "Master List Drawing" → "MKS-F-ENG-005 Drawing Master List"
Diaplikasikan di semua tempat: MasterDrawingPage (h1 + list header), EngineeringPortalPage (menu label), BomAttachmentsReadOnly (source label + hint), BOMPage (comment), drawing_register.py (docstring).

### 2) Request By (Sales) Field
- **Model**: `DrawingIn.request_by_sales: str = ""` (opsional)
- **Frontend Form**: Dropdown roster sales (Asiong / Nicholas / Kiki / Riska / Feggie / Fiana), data-testid=`dw-f-request-by`
- **Frontend List**: Kolom baru "Request By (Sales)" — muncul sebagai badge sky

### 3) Customer Code Master (Sub-Section di Drawing Master List)
**Backend** (`sales.py`):
- Field `customer_code` ditambahkan ke `CustomerCreate` + `CustomerUpdate`
- `PATCH /api/customers/{cid}/customer-code` — endpoint khusus engineering/admin set code
- `POST /api/customers/upsert-by-name` — util upsert by name + code
- Validasi code: 1–10 karakter alfanumerik/dash

**Backend** (`drawing_register.py`):
- `DrawingIn.customer_name: str = ""` field baru
- Auto-save code back: saat `POST/PUT /api/drawings`, jika `customer_name + customer_code` diisi, sistem auto-update `customer.customer_code` (case-insensitive match), atau create new customer bila belum ada

**Frontend** (`MasterDrawingPage.jsx`):
- `<CustomerCodeMasterPanel />` — inline-editable code input per customer, indigo header, "BELUM ADA KODE" badge, tombol SIMPAN dirty-detection, pagination 20/hal
- `<CustomerAutoComplete />` — dropdown customer di DrawingForm dengan preview code, klik → auto-fill nama + code
- Constant `SALES_NAMES` untuk request-by dropdown

**Flow lengkap**:
1. Sales buat customer di Master Customer (nama saja, code kosong)
2. Auto-muncul di sub-section Customer Code Master di halaman Drawing Master List
3. Engineer ketik code di input inline → auto-simpan (Enter/blur/tombol SIMPAN)
4. Saat register drawing → pilih customer dari autocomplete → customer_code auto-fill
5. Manual override code → otomatis ter-persist ke customer master saat create/update drawing

### Files affected
- Backend: `sales.py` (CustomerCreate/Update models + 2 new endpoints), `drawing_register.py` (DrawingIn.customer_name + request_by_sales + auto-upsert customer di create + update)
- Frontend: `MasterDrawingPage.jsx` (+220 baris), `EngineeringPortalPage.jsx`, `BomAttachmentsReadOnly.jsx`, `BOMPage.jsx`

### Test evidence (curl e2e)
- ✅ Create customer via sales → customer_code=""
- ✅ PATCH customer-code → tersimpan + `customer_code_updated_by="Riski"`
- ✅ Register drawing dgn `request_by_sales="Asiong"` + customer_name + manual code="NEW" → drawing_no ter-generate; semua field tersimpan
- ✅ Customer master code otomatis update (TST → NEW) sesuai manual input di drawing register

---

## Iter 12 — Inquiry Customer-Link + Step 2 Reorder + Class of Material Move + Stok Habis (2026-07-30)

### 1) Form Buat Inquiry Costing — Customer Wajib dari Master
**Frontend** — `SalesPage.jsx` (`CreateInquiryDialog`):
- Customer input diganti autocomplete dgn dropdown suggestion dari `/api/customers`
- Bila user ketik nama yg tidak ada match exact → banner amber "belum terdaftar" + tombol `+ Daftarkan Customer Baru`
- Klik → `<QuickRegisterCustomerDialog />` terbuka dgn nama pre-filled (field wajib: **Nama + Alamat**; PIC/Phone opsional)
- Simpan → `POST /customers` → auto-select di form Inquiry + badge hijau "✓ terkonfirmasi"
- Guard di `doSave`: kalau user paksa submit tanpa confirmed → tolak & buka register dialog

### 2) BomEntry Step 2 — Field Reorder + Auto-Fill Customer Code
**Frontend** — `BomEntryGridPage.jsx` (`NewOrderForm`):
- `pickSo()` sekarang async: setelah pilih SO, lookup `/api/customers?q={so.customer}` (exact/case-insensitive match) → auto-fill `customer_code` dari master
- Urutan field Step 2: **1) Customer Code, 2) Project Name, 3) Project Initial, 4) Drawing Type** (semua label numbered)
- Badge "✓ auto" muncul di sebelah label Customer Code kalau ter-populate dari master
- **Step 3 (Class of Material) DIHAPUS** dari `NewOrderForm` — pindah ke section BOM Grid
- Note kecil di bawah Step 2: "📌 Class of Material diisi nanti di halaman Work Order"

### 3) Class of Material — Inline di Section BOM Grid
**Frontend** — `BomEntryGridPage.jsx` (`WorkOrderView`):
- Komponen baru `<BomClassOfMaterialInline />` di atas Grid BOM (Section 3)
- Input dgn `<datalist>` prefill (RAW MATERIAL FOR QTY 1 PCS, 1 LOT, dll)
- Auto-save on blur / Enter via `PATCH /api/bom/{id}/meta` — Toast "Class of Material tersimpan"
- Amber accent border saat dirty, "✓ tersimpan" indicator saat sync
- Disabled saat `canEdit=false` (BOM sudah approved tanpa reopen)

### 4) Stok Saat Ini — Item Habis Tetap Muncul di Bawah
**Backend** — `store.py` `/store/stock`:
- Hilangkan filter `qty_remaining > 0` di aggregation → semua item yg pernah masuk store tetap muncul (termasuk qty=0)
- Sum tetap benar karena aggregasi $sum qty_remaining

**Frontend** — `StoreStockPage.jsx`:
- `sortedFiltered` sekarang memisahkan `inStock` (qty>0, di atas) & `outOfStock` (qty=0, di bawah), keduanya di-sort sesuai user sort selection
- Row habis: bg-slate-50, opacity-70, badge `<span>HABIS</span>` abu-abu di depan nama item, qty warna text-slate-400

### Test Evidence
- **Backend pytest**: 6/6 lulus — `/app/backend/tests/test_iter29_features.py`
  - store/stock qty=0 included (admin+store role)
  - PATCH bom/{id}/meta class_material (draft OK, approved 409)
  - POST customers quick-register (sales role, PIC+Phone optional)
- **Frontend browser automation**: 4/4 flows lulus (inquiry not-found banner + register dialog, BOM step 2 order + auto-fill, class-material inline save, stok habis di halaman terakhir)

### Files affected
- Backend: `store.py` (aggregation), `bom.py` (existing meta endpoint reused), `sales.py` (existing customer endpoint reused)
- Frontend: `SalesPage.jsx` (+90 lines CreateInquiryDialog customer autocomplete + QuickRegisterCustomerDialog), `BomEntryGridPage.jsx` (+~50 lines pickSo async / Step 2 reorder / BomClassOfMaterialInline), `StoreStockPage.jsx` (sortedFiltered logic + row styling)

### Debt / Code review notes
- `BomEntryGridPage.jsx` sekarang **1689 baris** — sudah waktunya di-split ke NewOrderForm.jsx / WorkOrderView.jsx / BomClassOfMaterialInline.jsx (backlog refactor)
- `PATCH /bom/{id}/meta` allow-list masih include `so_no` — bisa break Master SO linkage. Rekomendasi: read-only setelah first save atau admin-only guard (P2)


---

## Iter 13 — Export BOM ke Excel (Template MKS) setelah Release (2026-07-30)

### Fitur
Setelah BOM `engineering_status="approved"` (released), user bisa download file .xlsx dengan layout **persis** template MKS (BOM042-07-2026 - CLOSING PLATE... sample).

### Backend — `bom.py` endpoint baru
`GET /api/bom/{bom_id}/export/xlsx`
- Guard: 404 kalau BOM tidak ada, **409 kalau `engineering_status != "approved"`**
- Generate via `openpyxl` dengan struktur persis template sample:
  - Row 2 (merged 1-18): "BILL OF MATERIAL (BOM)" title bold 16pt center
  - Row 4-5: TO/DATE + BOM.NO/REV.NO
  - Row 7 (labels, header_fill light blue): PROJECT | ENG. DRW. PROJECT NO. | CUSTOMER | CLASS OF MATERIAL | PT MKS SO.NO. | DELIVERY DATE
  - Row 8: values (project_name, drawing_no, customer, class_material, so_no, delivery_date)
  - Row 9 (bordered header): ITEM NO | ITEM NAME | ITEM SPECIFICATION (merged 3-7) | QTY. | UOM (merged 9-10) | MATERIAL | WEIGHT (KG) (merged 12-13) | AVAILABLE STOCK | QTY PURCHASE | PURCHASE DUE DATE | REMARK (merged 17-18)
  - Row 10+: item data (spec/uom/weight/remark merged sesuai template)
  - Minimum 10 baris item row (kosong bila item < 10, mirip template kertas)
  - Footer: `NOTES : ...` (5 baris kosong extra) + `TOTAL WEIGHT: [SUM]`
- Auto-fill rules per instruksi user:
  - `TO: PUR` fixed
  - `DATE`: tanggal approved (dari `approved_at` → format DD/MM/YYYY)
  - `AVAILABLE STOCK` & `QTY PURCHASE`: KOSONG (diisi manual di kertas + di sistem purchasing)
  - `PURCHASE DUE DATE`: dari item.purchase_due_date kalau ada, else kosong
  - `WEIGHT`: dari item.weight_kg / weight kalau ada, else kosong
  - `TOTAL WEIGHT`: auto SUM weight yang terisi, else kosong
- Print setup: A4 landscape, fitToWidth=1, margins 0.4-0.5
- Filename: `{bom_no} - {project_name}.xlsx`
- Log action `export_bom_xlsx`

### Frontend
**BomEntryGridPage.jsx** (Work Order):
- Tombol **📥 Export & Print (Excel)** hijau, muncul di action bar bersamaan dgn "Print Browser" & "Buka di BOM Utama"
- Hanya muncul kalau BOM `engineering_status == "approved"` (via existing conditional block)
- Download via axios `responseType: "blob"` → create anchor → click → revokeObjectURL

**BOMPage.jsx** (Purchasing / BOM Utama detail view):
- Tombol yang sama di header action bar detail BOM
- Explicit guard: `bom.engineering_status === "approved"` → tombol muncul, else tidak

### Testing (curl e2e)
- ✅ Approved BOM → HTTP 200, Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, file 6.6 KB valid xlsx
- ✅ Open dgn openpyxl: sheet name "REV 0", dim A2:R26, title/meta/header/items rendered sesuai template
- ✅ Draft BOM → HTTP 409 "BOM belum dirilis"
- ✅ Non-existent BOM → HTTP 404
- ✅ Frontend screenshot: tombol Export muncul di UI Work Order approved

### Files affected
- Backend: `bom.py` (+245 lines endpoint `/export/xlsx`)
- Frontend: `BomEntryGridPage.jsx` (+25 lines tombol Export di action bar), `BOMPage.jsx` (+28 lines tombol Export di detail view)

### Catatan
- Logo/kop surat MKS **belum di-embed** — sample .xls user hanya berisi text "BILL OF MATERIAL (BOM)" tanpa image asset. Kalau user mau tempel logo, bisa share file logo (.png) → tinggal `wb.add_image()` di baris 1 sebelah kiri.


---

## Iter 14 — BOM Template Editable via Admin → Template Formulir (2026-07-30)

### Fitur
User (super_admin/admin) bisa desain sendiri template Excel BOM di menu **Admin → Template Formulir → section Excel Template**, upload ke sistem, dan sistem otomatis pakai template itu saat Export BOM.

### Flow
1. Login admin → menu **Template Formulir** → scroll ke section "Excel Template"
2. Dropdown pilih kode `BOM: Bill of Material (BOM Release)`
3. Klik **"📥 Download Starter"** → dapat file `.xlsx` template lengkap dgn placeholders + sheet **Panduan_Placeholder**
4. Buka di Excel, edit sesuka hati (tambah logo, ubah warna/font/border, geser kolom) — **jangan hapus text `{{...}}`**
5. Simpan → kembali ke sistem → **Upload** file → langsung aktif
6. Klik **📥 Export & Print (Excel)** di Work Order/BOM Detail → sistem load template Anda + fill placeholders → download

### Backend
**`excel_templates.py`**:
- Tambahkan entry `BOM` di dict `FORM_CODES` dgn:
  - `fields`: company_name, bom_no, revision, approved_date, project_name, drawing_no, customer, class_material, so_no, delivery_date, notes, total_weight, print_date, printed_by
  - `table_key`: items, `table_fields`: __index__, item_no, item_name, specification, qty, uom, material, weight_kg, available_stock, qty_purchase, purchase_due_date, remark
- Add BOM starter layout di `download_starter()` — landscape A4, 11 kolom, replika template sample BOM042 dgn placeholders `{{...}}`:
  - Row 1: logo + company_name + BILL OF MATERIAL (BOM) title
  - Row 4-5: TO/BOM.NO + DATE/REV.NO
  - Row 7-8: 6 meta labels + values (blue fill)
  - Row 9: table header 11 kolom (bordered medium)
  - Row 10: template baris item (marker `{{items.__index__}}` dst)
  - Row 22: NOTES + TOTAL WEIGHT
  - Print titles rows 1-9 (repeat header di setiap halaman untuk multi-page)

**`bom.py` `/{bom_id}/export/xlsx`**:
- Prefer **user template** via `get_active_xlsx_bytes("BOM")` → kalau ada, pakai `render_excel_template()` dgn data context (auto-fill placeholder + duplicate baris item)
- Fallback: default hardcoded layout kalau belum ada template user
- `available_stock` & `qty_purchase` selalu kosong (diisi manual saat print)
- `total_weight` = autosum weight items yang terisi

### Overflow / Multi-page
- Excel `fitToPage: fitToWidth=1, fitToHeight=0` → 1 halaman lebar, unlimited halaman tinggi
- Print titles rows 1-9 → header table repeat di setiap halaman
- Row items ter-duplikasi dinamis pakai `render_excel_template` (mengikuti styling row 10 template)
- Jadi user gak perlu bikin 2 versi (portrait squeezed / multi-page) — sistem handle otomatis

### Testing (curl e2e)
- ✅ `/api/excel-templates/codes` sekarang list 4 codes: MCL, MIF, MII, **BOM**
- ✅ `/api/excel-templates/starter/BOM` → download 7.5 KB xlsx dgn 24 placeholders + Panduan sheet
- ✅ Upload starter as active → `is_active: true`
- ✅ Export BOM approved → 884 KB xlsx dgn semua placeholder ter-fill (bom_no, dates, meta 6 field, item rows, headers)
- ✅ Delete active template → fallback ke default layout (verified)

### Files affected
- Backend: `excel_templates.py` (+2 entries: FORM_CODES.BOM + BOM starter block ~90 lines), `bom.py` `/export/xlsx` refactored (data-context first, then delegate ke user template atau fallback)
- Frontend: TIDAK PERLU DIUBAH — `ExcelTemplateSection` di FormTemplatesPage.jsx auto-load semua codes dari backend, jadi BOM langsung muncul di dropdown

### Catatan
- Untuk embed logo custom: upload logo `.png` di path `/app/backend/assets/logo.png` (server-side) → placeholder `{{IMAGE:company_logo}}` akan otomatis fit ke cell posisi logo
- Multi template (variant Landscape / Portrait Squeezed) belum diimplementasikan — bisa nyusul kalau user butuh: cukup extend upload endpoint untuk simpan multiple per code + tambah query param `?variant=` di export



---

## Iter 15 — Signature Placeholders + Shape/TextBox Support (2026-07-30)

### Issue user
Kolom tanda tangan (Prepared By / Checked By / Acknowledge By / Approved By) yg dibuat via Insert Shape (text box) di Excel tidak ke-fill sistem — placeholder `{{printed_by}}` di dalam Shape tidak diganti.

### Fix
**1. Extend placeholder replacer untuk Shape/TextBox** (`excel_templates.py`):
- Fungsi baru `_replace_placeholders_in_drawings(xlsx_bytes, data)` — post-process zip xlsx, edit XML `xl/drawings/*.xml` untuk cari & replace placeholder di Shape
- Fungsi baru `_merge_split_placeholders(xml_text)` — Excel kadang split placeholder ke multiple `<a:t>` runs (autocorrect / format berubah); logic ini menggabungkan run berdekatan sebelum regex replace
- Coverage tested: triple-split boundary, mid-split, dgn `<a:rPr>` di antara

**2. Dedicated signature placeholders untuk BOM** (`bom.py` + `excel_templates.py`):
- Data export sekarang expose 4 field baru dari `bom.signatures[k].name`:
  - `{{prepared_by}}` — pembuat BOM (fallback: `bom.prepared_by` / `created_by_name`)
  - `{{checked_by}}` — engineering leader
  - `{{acknowledged_by}}` — purchasing
  - `{{approved_by}}` — admin
- FORM_CODES.BOM.fields diperluas → Panduan_Placeholder sheet auto-include

### Cara user pakai
1. Re-download starter dari Admin → Template Formulir → dropdown BOM
2. Di Shape kolom TTD, ganti text:
   - `"Prepared By, ( ... )"` → `"Prepared By, ({{prepared_by}})"`
   - `"Checked By, (...)"` → `"Checked By, ({{checked_by}})"`
   - `"Acknowledge By, (...)"` → `"Acknowledge By, ({{acknowledged_by}})"`
   - `"Approved By, (...)"` → `"Approved By, ({{approved_by}})"`
3. Upload kembali → nama otomatis muncul di shape saat export

### Catatan
Kalau file user ada `_weight}}` (partial), berarti `{{total` di depannya kehapus manual. Fix: edit kembali di Excel jadi `{{total_weight}}` full → upload ulang.

### Files affected
- Backend: `excel_templates.py` (+95 lines helper + 4 field di FORM_CODES.BOM.fields), `bom.py` (+8 lines signature name extraction di export data)
- Frontend: TIDAK PERLU UBAH

---

## Iter 16 — Digital Approval Workflow untuk Drawing (Fase 1) (2026-07-30)

### Scope
Fase 1 dari 6-fitur Document Control besar: **sequential digital approval untuk drawing** (menggantikan print-signscan-manual).

### Backend

**Model** (`drawing_register.py`):
- Field baru di `drawings` collection:
  - `approval_status`: `"draft"` | `"pending_eng_head"` | `"pending_qc"` | `"pending_sales"` | `"approved"` (Fase 2 nanti: `"controlled"`, `"released"`)
  - `approvals`: array `[{stage, name, user_id, username, role, at, notes}]` — full audit trail
  - `submitted_at`, `submitted_by`, `approved_at`, `rejected_at`, `rejected_stage`, `reject_notes`

**Role baru** (`deps.py` + `auth.py`):
- `DOC_CONTROL_ROLES = ("doc_control", "document_control")`
- `is_doc_control(user)` helper
- Ditambahkan ke `VALID_ROLES` di auth

**Endpoints baru**:
- `POST /api/drawings/{id}/submit-for-approval` — engineer submit dari `draft` → `pending_eng_head`. Guard: file_id wajib (harus upload PDF dulu)
- `POST /api/drawings/{id}/approve/{stage}` — approve stage `eng_head`|`qc`|`sales`. Sequential enforcement (409 kalau skip); role check (403 kalau salah role); catat approval stamp dengan name+role+timestamp+notes. Stage `sales` final → status jadi `approved`
- `POST /api/drawings/{id}/reject/{stage}` — reject dgn wajib notes (min 5 char) → status kembali ke `draft`
- `GET /api/drawings/pending-my-approval` — list drawing yg butuh approval dari user login (auto filter by role)

### Frontend

**MasterDrawingPage.jsx**:
- Kolom baru "Approval" di list dgn `<DrawingApprovalBadge>`:
  - Badge warna sesuai status (draft=abu, pending_eng_head=amber, pending_qc=biru, pending_sales=ungu, approved=hijau)
  - Tombol **▶ Submit** biru muncul untuk role engineering kalau status=draft & file uploaded
  - Tombol **✓ Approve** hijau + **✕ Reject** merah muncul untuk role yg sesuai stage aktif
  - Klik badge → dialog `<ApprovalHistoryDialog>` menampilkan audit trail lengkap (siapa, kapan, notes)

**User baru**:
- `salma / salma123` role `doc_control` (untuk Fase 2 DC Stamp)
- Password reset via admin: nicholas/sales12345, qc01/qc12345

### Test Evidence (curl e2e)

- ✅ Create drawing → default `approval_status="draft"`
- ✅ Submit tanpa PDF → HTTP 400 "Upload PDF drawing terlebih dahulu"
- ✅ Submit dgn PDF → `pending_eng_head`
- ✅ Wrong role approve (madian try QC) → HTTP 409 "status sedang di pending_eng_head, tidak bisa approve stage qc"
- ✅ Skip stage (approve sales sebelum QC) → HTTP 409
- ✅ Full sequential: madian submit → Riski (eng_leader) approve eng_head → QC (qc01) approve qc → Sales (nicholas) approve sales → **approved**
- ✅ 4 approvals tersimpan di array dgn name+role+timestamp+notes

### Files affected
- Backend: `drawing_register.py` (+165 lines: 4 endpoints + helpers + STAGE_ORDER config), `deps.py` (+3 lines: DOC_CONTROL_ROLES + is_doc_control), `auth.py` (+1 line: doc_control di VALID_ROLES)
- Frontend: `MasterDrawingPage.jsx` (+185 lines: DrawingApprovalBadge + ApprovalHistoryDialog components + column)
- Docs: `test_credentials.md` (+3 credentials: salma, nicholas password, qc01 password)

### Fase Berikutnya (masih backlog)
- **Fase 2**: Document Control Stamp (menu Document Distribution Record, endpoint /stamp-controlled, digital stamp overlay ke PDF)
- **Fase 3**: Watermark saat Print (Controlled Copy vs Uncontrolled Copy per role)
- **Fase 4**: Drawing Record / Controlled Drawing Database (search terpusat)
- **Fase 5**: PDF Preview page dengan zoom in/out (upgrade dari current preview modal)


---

## Iter 17 — Fase 2: Document Control Stamp + Digital Signatures on PDF (2026-07-30)

### Fitur
1. **DC Stamp** (Salma only) — cap merah kotak "MKS / [tgl] / DOCUMENT CONTROL" pojok kanan atas PDF, meniru cap tinta manual
2. **Digital Approval Signatures** — 4 kotak APPROVED hijau (Submitted / Eng Head Review / QC Check / Sales Approval) di strip bawah PDF, otomatis dari `drawings.approvals[]`
3. **UNCONTROLLED COPY watermark** — diagonal abu-abu di tengah untuk user non-DC saat PDF sudah controlled
4. **Print footer** — "Printed by: [nama user] | tgl | jam" di setiap halaman untuk audit trail

### Backend

**Utility baru** `/app/backend/utils/pdf_stamper.py`:
- `apply_stamps(pdf_bytes, approvals, dc_stamp, watermark_uncontrolled, printed_by) → bytes`
- `_draw_dc_stamp()` — kotak merah 130x100pt double-frame, "MKS" 24pt + tanggal + "DOCUMENT CONTROL", info audit kecil di bawah
- `_draw_approval_strip()` — 4 kotak sig hijau (110x55 masing-masing) di strip bawah page 1
- `_draw_watermark()` — text 50pt diagonal 30° abu-abu transparan center page
- `_draw_print_footer()` — text kecil kiri bawah setiap halaman

**Endpoint baru** (`drawing_register.py`):
- `POST /api/drawings/{id}/stamp-controlled` — Salma only, status `approved` → `controlled`, save `dc_stamp` record
- `GET /api/drawings/{id}/pdf-stamped` — return PDF dengan semua stamps overlaid on-the-fly. Watermark UNCONTROLLED aktif kalau: status=`controlled` DAN user bukan doc_control/admin
- `GET /api/drawings/pending-dc-stamp` — list drawing yg approved tapi belum di-stamp (untuk halaman DC nanti)

### Frontend

**MasterDrawingPage.jsx** — 2 tombol baru di `DrawingApprovalBadge`:
- **🔴 DC STAMP** (merah, animate-pulse) — muncul untuk role doc_control saat status=approved
- **👁 Preview Stamped** (abu-abu) — muncul untuk semua user saat status ≥ approved, buka PDF di tab baru

### Test evidence (visual + curl)
- ✅ Endpoint backend running, 3 endpoint baru terdaftar
- ✅ Visual test dgn sample PDF DWG.26.07.56 user:
  - Cap merah MKS DC di pojok kanan atas persis mirip cap manual
  - 4 kotak digital sig (Madian/Riski/QC/Nicholas) hijau di bawah dgn nama+tanggal+time
  - Watermark "UNCONTROLLED COPY WHEN PRINTED" diagonal muncul untuk user non-DC
  - Print footer "Printed by: Salma | 30 July 2026 | 05:05" di bawah kiri
- ✅ Original PDF di GridFS tidak diubah — stamped version generated on-the-fly

### Files affected
- Backend: `pdf_stamper.py` (baru, 195 lines), `drawing_register.py` (+95 lines: 3 endpoints)
- Frontend: `MasterDrawingPage.jsx` (+40 lines: DC stamp + preview-stamped buttons di DrawingApprovalBadge)

### Fase Berikutnya
- **Fase 3**: Sudah cover watermark di endpoint pdf-stamped. Print-friendly page (biar bisa Ctrl+P dari browser) — TBD
- **Fase 4**: Menu terpisah "Document Distribution Record" (dashboard Salma) — TBD
- **Fase 5**: Menu "Controlled Drawing Database" (search terpusat) — TBD
- **Fase 6**: PDF viewer inline dgn zoom in/out (upgrade preview modal) — TBD


---

## Iter 18 — Fase 3-6: Portal Cards + Distribution Record + Controlled Database + Interactive Stamp Position (2026-07-30)

### Fitur baru

**1. Portal Cards untuk Salma (LandingPage.jsx)**:
- Kartu "Document Control" (merah) → `/document-control/distribution`
- Kartu "Controlled Drawing Database" (indigo) → `/drawings/controlled`
- Role gating: DC card khusus doc_control/admin, DB card semua user

**2. Document Distribution Record page** (`/document-control/distribution`) — Fase 4:
- Dashboard 2-tab: **🕐 Menunggu Stamp DC** (approved) + **✓ Controlled Documents**
- Search by drawing_no / project / customer
- Tombol per row: **View PDF** + **Pilih Posisi Stamp** (khusus doc_control)
- Guard: user non-DC lihat halaman "Akses Ditolak"

**3. Controlled Drawing Database page** (`/drawings/controlled`) — Fase 5:
- Repository semua drawing yang sudah controlled/released
- Search terpusat: drawing_no / project / customer / SO / part / title
- Tombol "Preview & Print" per row → buka `<PdfViewerModal>` (iframe fullscreen)
- Semua user login boleh akses (watermark UNCONTROLLED otomatis untuk non-DC via endpoint)

**4. Interactive Stamp Position Picker** — jawaban permintaan user:
- Salma klik "Pilih Posisi Stamp" → buka modal fullscreen dengan PDF preview
- **Klik area PDF** → marker stamp merah (MKS / [tgl] / DOCUMENT CONTROL) muncul di posisi klik dengan animate-pulse
- Bisa klik-ulang untuk pindah posisi sebelum konfirmasi
- Klik "✓ Konfirmasi & Stamp" → simpan koordinat + apply
- Backend `POST /drawings/{id}/stamp-controlled` accepts optional `stamp_x`, `stamp_y` (0..1 relative). Default: pojok kanan atas
- `_draw_dc_stamp` di `pdf_stamper.py` render stamp di posisi custom kalau ada, else default corner

**5. PDF Viewer Modal** — Fase 6:
- Iframe fullscreen `#toolbar=0&navpanes=0` untuk viewer minimalis
- Browser-native PDF zoom controls (Ctrl+scroll / pinch)
- Tombol "Buka di Tab Baru" untuk print via browser

### Files
- Backend: `drawing_register.py` DCStampIn model (+2 fields stamp_x/stamp_y), stamp handler pakai coords; `pdf_stamper.py` `_draw_dc_stamp` support custom position
- Frontend baru: `DocumentDistributionRecordPage.jsx` (+230 lines), `ControlledDrawingDatabasePage.jsx` (+100 lines)
- Frontend edit: `App.js` (+3 routes), `LandingPage.jsx` (2 new portal cards, replace "coming soon" DC card)

### Cara pakai (end-to-end):
1. Engineer submit drawing → 3 stage approval → status `approved`
2. Salma login → langsung lihat 2 kartu di home
3. Klik "Document Control" → tab "Menunggu Stamp DC" → klik **Pilih Posisi Stamp** pada drawing
4. Modal terbuka dengan PDF → Salma **klik di area putih drawing** → marker MKS merah muncul di titik klik
5. Klik "✓ Konfirmasi & Stamp" → stamp tersimpan di posisi yg dipilih, status → `controlled`
6. Drawing muncul di tab "Controlled Documents" + juga di **Controlled Drawing Database** untuk semua user
7. Print oleh Salma → clean; Print oleh Madian → watermark diagonal UNCONTROLLED

### Test evidence
- ✅ Login salma/salma123 sukses, 2 kartu portal terlihat
- ✅ Backend endpoint accept coords, `pdf_stamper` clamp ke area valid
- ✅ Visual: marker stamp preview render dengan pulse


---

## Iter 22 — Prepared By TTD Digital + Admin Bypass Fix (30 Jul 2026)

### Bug 1: Admin bisa TTD atas nama semua stage (FIXED)
- Sebelumnya `is_admin_like(current)` bypass di endpoint `approve/{stage}` dan `reject/{stage}` — admin biasa bisa TTD atas nama Eng Head / QC / Sales
- Effect: QC01 & Nicholas tidak lihat drawing di dashboard karena stage "sudah dilewati" admin
- **Fix**: Ganti ke `is_super_admin_user(current)` — hanya Susanto yang bisa emergency override
- Frontend: `STAGE_ROLE_MAP` di `MasterDrawingPage.jsx` juga dibersihkan — tombol "TTD & Approve" cuma muncul untuk role yang tepat
- Endpoint `pending-my-approval` juga di-limit — admin biasa tidak lagi lihat semua pending drawing

### Bug 2: Prepared By tidak TTD di PDF Drawing (FIXED)
- Sebelumnya `POST /drawings/{id}/submit-for-approval` cuma catat metadata tanpa koordinat TTD
- Sekarang endpoint terima payload `ApprovalActionIn` (stamp_x, stamp_y, stamp_page, stamp_size)
- `SignaturePlacementModal` sekarang support stage="submit" — Prepared By pick posisi di PDF sama seperti approver lain
- `MasterDrawingPage` tombol berganti dari "▶ Submit" → "▶ TTD & Submit" — buka modal signature placement dulu
- PDF stamper otomatis render stamp submit di posisi yg dipilih (label: "SUBMITTED / Prepared By")
- Kalau Riski buat drawing sendiri, dia TTD 2x: Prepared By (submit) + Checked By (eng_head approve)

### End-to-end verified via curl (30 Jul 2026):
- Submit as Riski → status pending_eng_head, TTD saved dengan x=0.60, y=0.85
- Approve eng_head as Riski → status pending_qc, TTD saved x=0.75
- Approve qc as QC01 → status pending_sales, TTD saved x=0.85
- Approve sales as Nicholas → status approved, TTD saved x=0.95 + so_stamp_draft filled
- Admin biasa (cekcek) tries approve sales → 403 "Role admin tidak boleh approve stage 'sales'"

### Files changed
- `backend/routers/drawing_register.py` — is_admin_like → is_super_admin_user (approve/reject); submit endpoint accept ApprovalActionIn + save koordinat stamp
- `frontend/src/components/SignaturePlacementModal.jsx` — support stage "submit" dengan endpoint switch
- `frontend/src/pages/MasterDrawingPage.jsx` — STAGE_ROLE_MAP dibersihkan; submit button buka SignaturePlacementModal

### Materi Presentasi
- `/app/PRESENTASI_ERP_MKS.pptx` — 15 slide siap presentasi (widescreen 16:9, palet navy+emerald+amber)
- Download via GET `/api/presentation/erp-pptx` (public, no auth)
- Endpoint markdown: GET `/api/presentation/erp-md`
