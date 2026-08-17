# ERP MKS — Granular Permission System (Accurate-style)

## Context
User wants an Accurate-style **compact/dense** permission editor inside the Admin Panel → Edit User dialog.
Confirmed decisions:
- Matrix as a **table inside Edit User dialog** (module rows × action columns).
- Compact/dense UI (small font, short rows, many modules on one screen).
- **Do UI + full backend enforcement in ONE batch.**
- Save `access` per user. Super Admin only controls it.
- Do NOT change existing ERP menus/content.

## Existing foundation
- `/app/backend/permissions.py` — complete REGISTRY (module→activities→prefixes), ACTIONS, path→menu_key + method→action mapping, check_access(). Ready to wire.
- Enforcement rule (non-regressive): only users with an explicit `access` matrix are enforced; super_admin always bypasses; users without `access` keep legacy role behavior.

## Phase 1: Backend (Status: COMPLETED)
- models.py: added `access: Optional[dict]` to UserCreate & UserUpdate
- auth.py: persist/return `access` (login, /auth/me, _sanitize_user, create_user, update_user); added `GET /permissions/registry` (super_admin); `is_super_admin` now honors DB flag too (consistent with backend)
- server.py: added centralized permission-enforcement HTTP middleware using permissions.py

## Phase 2: Frontend compact matrix (Status: COMPLETED)
- New `components/AccessMatrix.jsx` compact dense component (module groups, 6 action columns, row/column/module select-all, search, master full/clear)
- Wired into EditUserDialog; widened dialog (sm:max-w-2xl); load & save `access`; "Atur manual" toggle (off = clear → default role)
- No existing ERP menus/content changed

## Phase 3: Testing (Status: COMPLETED)
- Backend curl: registry gated to super_admin ✅ ; login/me return access ✅ ; PUT save persists+normalizes ✅
- Enforcement verified: GET /quotations 200 (view), POST /quotations 403 (no create), GET /orders 403 (not granted), /auth/me 200 (exempt) ✅
- Legacy non-regression: user without `access` unaffected (404/422 not 403) ✅
- Frontend esbuild compile clean; screenshot shows dense Accurate-style matrix ✅
- Temp test users (zz_perm_tester, zz_enf) removed

---

## Phase 4: UI Density / Compact Accurate-like (Status: COMPLETED)
- Redesigned Input Transaksi Pembelian to dense Accurate look. User approved.
- Applied GLOBAL compact density layer scoped to `<main>` (`.erp-dense` in index.css) → all authenticated pages/forms/tables match Input Transaksi sizing. Verified Store/Master List/Input.
- Sticky table headers + Excel-like resizable columns globally.
- Reduced motion permanently; removed fast/animation toggle.

---

## Phase 5: Backup upgrade + Wipe Improvements (Status: COMPLETED)
- backup.py rewritten self-contained:
  - `GET /full-download`: builds tar.gz = manifest.json + data JSON + code/ (excludes node_modules/.git/etc). super_admin only.
  - `POST /full-restore`: restores DATA to Mongo (merge/replace) + extracts CODE to `/app/_full_restore_<ts>/` staging (never overwrites live code). Confirm phrase `RESTORE-FULL`.
  - `GET /version`: git info (commit/branch/date/message).
- AdminPage BackupTab UI: Version/Build panel, Full Backup download, Full Restore upload.
- Wipe fixed to be dynamic (all collections), preview counts, selective module wipe, double confirmation. Preserve policy remains (users, signatures, TRF, vendor banks, templates).
- Note: Radix dialog inputs (portaled) not fully covered by `.erp-dense` scope — optional follow-up.

---

## Phase 6: Production→QC→Delivery Module (Status: IN PROGRESS — phased)
Confirmed flow after Doc Control stamp (per PT MKS flowchart):
Sales SO → (Produksi lihat SO awal + notif) → Engineering stamp drawing + BOM → **Work Order/SPK** → Produksi kerjakan (tracking) → **QC Final** (OK → upload dimension report) → **Store buat Gate Pass + DO (Surat Jalan)** → kirim → selesai.

User decisions:
- Gate Pass/Surat Jalan **sementara manual**.
- Alur Produksi→QC→Store (otomasi dari QC OK ke Store) **ditunda** menunggu hasil diskusi internal Produksi.

### Phase 6.1 — Produksi lihat SO baru + notifikasi (Status: COMPLETED)
- backend/routers/production.py: GET /production/new-so (scope unack/all, +has_drawing/has_bom flags, unack_count), POST ack, POST unack. Registered.
- notifications.py: kategori "SO Baru — perlu disiapkan Produksi" untuk role produksi + admin_like.
- Frontend: ProductionPortalPage card + ProductionNewSoPage tabel compact + ack/unack.
- Verified via curl + screenshots.

### Phase 6.2 — Work Order / SPK (auto dari drawing ter-stamp + BOM) (Status: NOT STARTED)
### Phase 6.3 — Production tracking (status simpel; detail nunggu diskusi user) (Status: NOT STARTED)
### Phase 6.4 — QC Final (OK → upload dimension report) (Status: NOT STARTED)
### Phase 6.5 — Store Gate Pass + DO (Surat Jalan) setelah QC OK (Status: DEFERRED / MANUAL)

---

## Phase 7: DRF UX Validation (Status: COMPLETED)
- DRF `request_type` validation dibuat lebih ramah:
  - Backend: 400 dengan pesan jelas bila jenis permintaan belum dipilih (bukan 422 pattern error)
  - Frontend: pre-check + formatter error supaya tidak muncul `[object Object]`
- Verified via curl (POST/PUT) + cleanup user/data tes.

---

## Phase 8: Store Department Enhancements (Status: COMPLETED)
Fokus: perbaikan konsistensi role, dan fitur yang user minta untuk Store.

### Phase 8.1 — Fix role consistency (frontend ↔ backend) (Status: COMPLETED)
Temuan: frontend sebelumnya hanya cek `admin`, padahal backend mengizinkan `admin/supervisor/super_admin`.
Perbaikan:
- `frontend/src/lib/auth.jsx`:
  - tambah helper `isAdminLike(user)` (cermin backend `ADMIN_LIKE_ROLES`)
  - tambah helper `canSeeStorePrices(user)` (cermin backend `can_see_prices`)
- Update pemakaian di:
  - `DeliveryPage.jsx` (canWrite)
  - `IncomingReportPage.jsx` (isAdmin)
  - `StoreIssuePage.jsx` & `StoreReportPage.jsx` (canSeePrice)
- Verified via screenshots:
  - Tombol "Tambah Pengiriman" muncul untuk super_admin
  - Kolom harga FIFO tampil untuk admin-like

### Phase 8.2 — Riwayat Item Stok (discoverability improvement) (Status: COMPLETED)
Current state (sebelumnya sudah ada):
- Backend: `GET /store/stock/history` (ledger IN/OUT + running balance).
- Frontend: klik nama item → membuka `StockHistoryDialog` (filter tanggal, print/PDF).

Update baru:
- Menambahkan ikon/tombol **Riwayat** yang selalu terlihat di kolom **Aksi** pada `StoreStockPage` (icon `ClockCounterClockwise`) agar fitur history mudah ditemukan.
- Verified via screenshot: dialog riwayat terbuka dari tombol ikon.

### Phase 8.3 — Stock Opname (session-based) (Status: COMPLETED)
User request: fitur hitung fisik vs sistem + penyesuaian selisih untuk audit gudang berkala.

**Backend implementation**
- File baru: `backend/routers/stock_opname.py` (router didaftarkan di `backend/server.py`).
- Collection: `stock_opnames` (items di-embed pada session untuk simpel).
- Endpoints:
  - `POST /store/opname` → buat sesi draft + snapshot qty sistem per item.
  - `GET /store/opname` → list sesi (paging).
  - `GET /store/opname/{sid}` → detail (items + adjustments + summary).
  - `PUT /store/opname/{sid}` → update physical_qty + note (draft only).
  - `POST /store/opname/{sid}/finalize` → **double confirm** `OPNAME-FINAL`, recompute qty sistem TERBARU saat finalize, lalu buat penyesuaian:
    - diff (+) → receipt masuk: vendor `STOCK OPNAME`, `qty_remaining=diff`, `unit_price` = harga receipt terbaru.
    - diff (−) → FIFO deduct `store_receipts.qty_remaining` + issuance keluar: `taker_name=STOCK OPNAME`.
  - `DELETE /store/opname/{sid}` → hanya draft; finalized terkunci untuk audit.

**Frontend implementation**
- Page baru: `frontend/src/pages/StockOpnamePage.jsx` route `/store/opname`:
  - List sesi + buat sesi baru.
  - Detail sesi: tabel item, input qty fisik, selisih live, kartu statistik (dihitung/cocok/+/-/dilewati).
  - Finalisasi: dialog konfirmasi (harus ketik `OPNAME-FINAL`) + ringkasan.
  - Setelah finalize: tampil summary dan tabel adjustments.
- Store Portal: card "Stock Opname" ditambahkan (`StorePortalPage.jsx`).
- App routes: `/store/opname` ditambahkan di `App.js`.

**Verification**
- Curl tests: create/update/wrong-confirm 400/finalize OK; stok berubah sesuai selisih; history item mencatat `STOCK OPNAME`; sesi finalized tidak bisa diedit/dihapus.
- Screenshot tests: list, detail finalized, draft counting, history dialog, portal card.
- Test data `zz_opname` / item `ZZOPN*` dibersihkan.

---

## Phase 9: Purchasing — Transaksi Sementara (Foto Nota + AI) (Status: COMPLETED)
(unchanged — see previous plan for full details)

---

## Phase 10: Purchasing — Transaksi Sementara Enhancements + QA Purchasing/Store (Status: COMPLETED)
(unchanged — see previous plan for full details)

---

## Phase 11: Purchasing — Transaksi Sementara Polish (live feedback) (Status: COMPLETED)
(unchanged — see previous plan for full details)

---

## Phase 12: Production — Daily Report / Attendance / Overtime / Job Progress / FGRN (Status: IN PROGRESS)
Ringkasan keputusan besar yang sudah berjalan di modul Produksi:
- Daily Production Report: date-first, multi-row, spreadsheet-like, operator dari master produksi, blok input bila operator absent.
- Attendance: calendar grid, Sunday + holiday marker merah, sticky Nama/Bagian, Night Shift = Shift 2 truth.
- Overtime: rule tier 1.5x/2x weekdays+Sat, Sunday/holiday 2x; recap bulanan grid; export excel; print OT request signature blocks.
- Job Progress: satu line per SO, finished otomatis dari FGRN (released saja), target working days exclude Sundays+holiday.
- FGRN: multi-item per SO, balance per item, Draft→Submit QC→Release/Reject.

**Hotfix included (Feb 2026)**
- Fixed duplicate function definition `update_job_progress` that prevented saving PIC/remarks via `PUT /production/job-progress/{so_id}`.

---

## Phase 13: QC Ownership Fix — Relocate "Release Note Menunggu Persetujuan" to QC Portal (Status: COMPLETED)
(unchanged — see previous plan for full details)

---

## Phase 14: Usability — Panel "Hari Ini" + Quick Wins Produksi (Status: COMPLETED)
(unchanged — see previous plan for full details)

---

## Phase 15: Attendance sticky header fix + SO Progress/TV production reflect + Full Testing (Status: COMPLETED)
(unchanged — see previous plan for full details)

---

## Phase 16: Cross-Module Governance Backlog (Audit/Security/Engineering/QC Assets/Tools) (Status: UPDATED)
Governing request: user mengunci backlog final dan meminta coding sesuai urutan default.

### Backlog (Confirmed by user)
- **Tahap 1 (fondasi)**: Audit Trail → Login Log & Sesi Aktif → Recycle Bin (**Status: COMPLETED**)
- **Tahap 2 (akses & navigasi)**: Manajemen Hak Akses Detail (per user per menu) → Pencarian Global di header (**Status: COMPLETED / ALREADY EXISTED**)
- **Tahap 3 (engineering/doccon)**: Reminder Drawing Belum Release → Revisi Drawing Berantai (notif ke Produksi “pakai revisi terbaru”) (**Status: COMPLETED**; see Phase 20)
- **Tahap 4 (QC)**: Masterlist Alat Ukur + input sertifikat kalibrasi pihak ke-3 + reminder H-30 & overdue merah (**Status: COMPLETED**)
- **Tahap 5 (produksi)**: Peminjaman Alat/Tools (inventory alat + status pinjam/kembali/hilang) (**Status: COMPLETED**)
- **Tahap 5b (produksi)**: **Stok Opname Alat Produksi** (cek fisik berkala, finalisasi tandai hilang) (**Status: COMPLETED**)
- **Tahap 6 (data)**: Backup & Restore database (**Status: NEEDS CONFIRMATION**; full backup code+data already exists in Phase 5)

---

## Phase 17 — Code Quality Review Fixes (Status: COMPLETED)
External code review report diterima; diterapkan secara pragmatis.
Key applied fixes:
- XSS: removed `document.write()` printing in Overtime; switched to Blob URL; escaped user-supplied fields.
- Empty catch blocks: added console warn/error in key pages.
- Tests: replaced dynamic `__import__` with static imports.
- Stable keys: replaced index keys in a few high-traffic read-only lists.

---

## Phase 18 — Bugfix: Daily Production wajib absensi dulu (Status: COMPLETED)
- New helper `_check_operator_attendance(op_name, rd)`:
  - Operator in master `production_employees` MUST have attendance record on report date.
  - Block `Tidak Hadir` / `MC-Sakit`.
  - Non-master operator names allowed.
- Verified with smoke tests.

---

## Phase 19 — Deployment Readiness Health Check (Status: COMPLETED)
- **BLOCKER fixed**: `.gitignore` previously ignored `.env`, `.env.*`, `*.env`. Removed those rules.
- Deployment agent re-run: **PASS** (0 blockers, 0 warnings).

---

## Phase 20 — Engineering Portal Upgrade Batch (Status: COMPLETED)
User approved: implement **all** engineering-card recommendations + requested changes:
- Merge DRF tabs (New/Repeat) because staff no longer uses the split.
- Provide staff history (riwayat pekerjaan) and department monthly recap (per engineer).

### 20.A — Merge tab "New Order" + "Repeat Order" → "Drawing Request" (Status: COMPLETED)
**Frontend: `frontend/src/pages/WorkOrderEngineeringPage.jsx`**
- Default tab now `drawing`.
- New unified tab **Drawing Request** (combines New+Repeat) with badge count = total DRF requiring assignment or in-progress visibility.
- Legacy `request_type=repeat_order` still preserved; shown as small badge **Repeat** in the row.

**Frontend: `frontend/src/pages/EngineeringPortalPage.jsx`**
- Updated card description/stats to: **Inquiry · Drawing Request**.

### 20.B — Staff Work History in portal "Tugas Saya" (Status: COMPLETED)
**Backend: `GET /drawing-requests/my-history?month=YYYY-MM`**
- Returns:
  - DRF completed by logged-in engineer (`assigned_engineer_id`)
  - Inquiry completed by logged-in engineer (`assigned_to_id`)
  - Includes `lead_days` (assigned/created → completed)

**Frontend: `frontend/src/components/MyJobQueuePanel.jsx`**
- Toggle view **Aktif | Riwayat**.
- History view:
  - Month filter (input type month)
  - Lists completed DRF + completed Inquiries with completion date and lead time.

### 20.C — Reminder "SO jalan produksi tapi drawing belum release" (Status: COMPLETED)
**Backend:**
- Helper `compute_unreleased_so()`:
  - Finds SO with production activity (`production_reports` or `fg_release_notes`)
  - Flags SO without any drawing `approval_status in (controlled, released)` in Drawing Register.
- Endpoint `GET /engineering/so-unreleased-drawings` (Engineering/DocCon/Produksi/Admin).

**Frontend:**
- New component: `frontend/src/components/UnreleasedDrawingStrip.jsx`.
- Strip appears on Engineering portal; collapsible; refresh 60s.
- Verified with real data: SO `005200` flagged.

**Notifications:**
- New category `so_drawing_not_released` (severity danger) for engineering/doccon/admin.

### 20.D — Revisi Drawing Berantai → notif ke Produksi "pakai revisi terbaru" (Status: COMPLETED)
**Backend:**
- On Drawing Register stamp-controlled (new revision): inserts `drawing_revision_events`.

**Notifications:**
- New category `drawing_new_revision` for produksi/admin (events within last 14 days).

### 20.E — Queue polish (Status: COMPLETED)
**Frontend: `frontend/src/components/EngineeringQueuePanel.jsx`**
- Added KPI bar (from `/engineering/queue-kpis`).
- Added "Umur" column (AgeBadge days since created) to reveal stagnant items.
- Inline assign for DRF `status=submitted`:
  - dropdown `+ Assign engineer` using `/drawing-requests/engineering-users`
  - calls `POST /drawing-requests/{id}/accept-assign`
- Overdue red highlighting already existed and retained.

### 20.F — KPI endpoint for queue (Status: COMPLETED)
**Backend: `GET /engineering/queue-kpis`**
- done_week (DRF completed last 7 days)
- overdue (active rows with expected_due_date < today)
- avg_lead_days for completed DRF in current month

### 20.G — Monthly productivity recap (Status: COMPLETED)
**Backend: `GET /engineering/monthly-recap?month=YYYY-MM`**
- Per engineer:
  - `inquiry_done` (inquiries completed)
  - `drf_done` (DRF completed)
  - `revisi` (drawings with revision_opened_at in month → engineer derived from from_drf_id)
  - `ecn` (activity_logs action `drawing_request_revision_ecn`)
- Guarded to engineering/leader/admin/sales_head. Sales biasa 403.

**Frontend:**
- New page `frontend/src/pages/EngineeringMonthlyRecapPage.jsx`.
- Wired into `EngineeringMonitorPage.jsx` as new tab: **Rekap Bulanan**.

### Verification (Status: COMPLETED)
- Backend smoke tests:
  - `/engineering/queue-kpis`, `/engineering/monthly-recap`, `/drawing-requests/my-history`, `/engineering/so-unreleased-drawings` return 200 for allowed roles; Sales 403.
  - Notifications contain `so_drawing_not_released` for engineering.
- Frontend compile: esbuild clean.
- Screenshots verified:
  - Engineering portal: strip + KPI bar + Umur column + inline assign.
  - Work Orders: merged Drawing Request tab.
  - Monitor: Rekap Bulanan tab.
- Temp test users cleaned (0 `zz_*` remaining).
- Note: KPI/recap counts currently 0 because no DRF has `status=completed` in live data yet; will fill automatically as the team starts completing jobs.

---

## Phase 21 — Production Daily Report: Qty OK required (Status: COMPLETED)
User report: report could be saved even if qty empty.

**Backend: `backend/routers/production.py`**
- Added `_validate_qty(qty_ok, qty_ng)`:
  - qty cannot be negative
  - requires at least one positive qty: OK mandatory (NG optional); special case allowed: OK=0 if NG>0 (reject-all).
- Enforced on:
  - `POST /production/reports`
  - `PUT /production/reports/{id}`

**Frontend: `frontend/src/pages/ProductionDailyReportPage.jsx`**
- Autosave now waits until Qty OK entered (or NG>0 reject-all).
- Header shows Qty OK as required (`*`).

**Verification:**
- Smoke test: empty qty → 400; negative → 400; ok>0 → 200; ok=0/ng>0 → 200.

---

## Notes / Current GitHub Safety
- Perubahan terbaru masih **modified** dan belum di-commit/push.
- Disarankan commit bertahap (agar jelas dan mudah rollback):
  1) `Phase 21 daily production qty validation + UI guard`
  2) `Phase 20 engineering portal upgrade batch`
  3) `Phase 18 daily production attendance required`
  4) `Phase 19 deployment readiness .gitignore env fix`
  5) `Phase 17 code-quality fixes`
- Reminder: GitHub hanya backup **kode**; untuk **data** gunakan Full Backup (tar.gz) dan/atau Tahap 6 data-only backup bila sudah dibuat.
