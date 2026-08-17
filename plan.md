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
(unchanged)

---

## Phase 9–11: Purchasing — Transaksi Sementara (Status: COMPLETED)
(unchanged)

---

## Phase 12: Production — Daily Report / Attendance / Overtime / Job Progress / FGRN (Status: IN PROGRESS)
(unchanged; includes daily production attendance+qty OK fixes shipped)

---

## Phase 13–15 (QC ownership fix, quick wins, sticky header + SO progress/TV) (Status: COMPLETED)
(unchanged)

---

## Phase 16: Cross-Module Governance Backlog (Audit/Security/Engineering/QC Assets/Tools) (Status: UPDATED)
(unchanged)

---

## Phase 17 — Code Quality Review Fixes (Status: COMPLETED)
(unchanged)

---

## Phase 18 — Bugfix: Daily Production wajib absensi dulu (Status: COMPLETED)
(unchanged)

---

## Phase 19 — Deployment Readiness Health Check (Status: COMPLETED)
(unchanged)

---

## Phase 20 — Engineering Portal Upgrade Batch (Status: COMPLETED)
(unchanged; includes unified Drawing Request, queue KPIs, staff history, unreleased drawing strip, revision notifications)

---

## Phase 21 — Production Daily Report: Qty OK required (Status: COMPLETED)
(unchanged)

---

## Phase 22 — Rekap Engineer: Ongoing + Export Excel (Status: COMPLETED)
(unchanged)

---

## Phase 23 — Audit & Fix KPI Engineering (Status: COMPLETED)
(unchanged)

---

## Phase 24 — Keputusan Bisnis KPI Diterapkan (Status: COMPLETED)
(unchanged)

---

## Phase 25 — Engineering Batch (Multi-item Drawing + Deliverable Checklist + Mini Stats + Priority) + Inquiry Flow Fix + Boss Approval Panel (Status: COMPLETED — shipped, agent-tested; pending user confirmation)
Governing request (user-confirmed): implement in one batch.

### 25.A — Multi-item per Drawing (Work Order: "Item & Qty Drawing") (Status: COMPLETED)
**Business rules (implemented)**
- 1 SO bisa lebih dari 1 item.
- 1 drawing bisa mencakup **lebih dari 1 item**.
- UI: **daftar baris item** (tiap baris: pilih item + qty) + tombol **+ Tambah Item**.
- Stamping/TTD: qty yang dipakai untuk SO stamp = **TOTAL qty**.
- Backward compatibility: drawing lama yg hanya punya 1 item tetap valid → otomatis jadi baris pertama.

**Backend changes (implemented)**
- Router: `backend/routers/drawing_register.py`
- Upgraded endpoint `POST /api/drawings/{drawing_id}/drf-item`
  - Request supports legacy `{item_name, item_qty}` OR new `{items: [{item_name, item_qty}]}`.
  - Persist:
    - `drf_items: [{item_name, item_qty}]` (canonical)
    - `item_qty`: computed **sum(drf_items.item_qty)** (legacy + used by stamp)
    - `item_name`: legacy display = gabungan nama item (join)

**Frontend changes (implemented)**
- Page: `frontend/src/pages/EngineeringWorkOrderPage.jsx`
- `DrfItemPicker` upgraded to editable grid:
  - Rows with select item (from DRF items if available) + qty input.
  - Buttons: `wo-item-add-row`, `wo-item-remove-row-<idx>` (keep ≥1 row)
  - Save calls upgraded `/api/drawings/{id}/drf-item` with `items[]`.
  - Displays computed total qty + hint “Stamp qty = total”.

**Verification (done)**
- Backend smoke test: items[] stored, `item_qty` total, legacy single-item payload still works.
- Visual verification: panel renders, “+ Tambah Item” adds row, total qty shown.

---

### 25.B — Checklist Deliverable per DRF (before submit to Leader) (Status: COMPLETED)
User clarification: **di DRF ada 4 kotak upload** → checklist deliverable mengikuti 4 itu.

**Deliverables enforced in UI (implemented)**
1) PDF Drawing MKS (per-drawing `file_id` exists)
2) Nesting (BOM attachments category `nesting`)
3) AutoCAD/CAD (BOM attachments category `cad`)
4) Costing/Price (BOM attachments category `costing`) — otomatis disembunyikan jika `can_view_costing=false`

**Frontend (implemented)**
- Location: `frontend/src/pages/EngineeringDrfWorkPage.jsx` → `SubmitToLeaderPanel`
- Added compact checklist panel `data-testid="wg-deliv-checklist"`:
  - Auto-read status (OK/missing) untuk 4 deliverable.
  - Confirmation checkbox `wg-deliv-confirm` wajib dicentang.
  - Submit button disabled bila checkbox belum dicentang.
  - Label checkbox berubah sesuai lengkap/tidak.
- BOM deliverables dihitung dari `GET /api/bom/{bom_id}/attachments`.

**Backend hard guard**
- Not implemented as hard guard (UI-based enforcement as per shipped batch). Can be added later if needed.

**Verification (done)**
- Visual verification: 4 baris tampil, checkbox gating bekerja, tombol submit mengikuti gating.

---

### 25.C — Statistik Pribadi Mini (Tugas Saya) (Status: COMPLETED)
Show per-staff monthly self-performance in “Tugas Saya”.

**Backend (implemented)**
- Endpoint: `GET /api/drawing-requests/my-stats?month=YYYY-MM`
- Output:
  - `completed_count` (DRF completed + Inquiry completed di bulan itu)
  - `drf_done`, `inquiry_done`
  - `avg_lead_days`
  - `on_time_count`, `on_time_total`, `on_time_rate`
- On-time rules:
  - DRF: `completed_at` vs `expected_due_date`
  - Inquiry: `completed_at` vs `customer_deadline`
  - Record tanpa deadline tidak masuk `on_time_total`.

**Frontend (implemented)**
- Component: `frontend/src/components/MyJobQueuePanel.jsx`
- Added stats strip `data-testid="myqueue-stats"` di bawah header:
  - Default bulan berjalan; saat view “Riwayat” ikut bulan yang dipilih.

**Verification (done)**
- Backend smoke test (cookie auth): endpoint returns metrics.
- Visual verification: strip tampil.

---

### 25.D — Prioritas Tugas (DRF) (Status: COMPLETED)
Leader sets High/Normal/Low during assignment. Staff queue auto-ordered; High has prominent badge.

**Backend (implemented)**
- `backend/routers/drawing_requests.py`
  - `AcceptAssignIn` extended: `priority: Optional[str] = "normal"` (high|normal|low)
  - Persist on DRF: `priority`, `priority_set_by`, `priority_set_at`
  - Sorting in `GET /api/drawing-requests/my-queue`: priority first (high→normal→low), then `assigned_at`.

**Frontend (implemented)**
- `frontend/src/components/EngineeringQueuePanel.jsx`
  - Added priority select next to inline assign: `eng-queue-prio-select-<form_no>`.
  - Queue rows show badges High/Low.
- `frontend/src/components/DrfDetailModal.jsx`
  - Added priority select `drf-detail-priority-select`.
- `frontend/src/components/MyJobQueuePanel.jsx`
  - High: red badge “Prioritas Tinggi” + rose border accent.

**Verification (done)**
- Backend smoke test: assign 3 DRF priorities → staff queue order high/normal/low.
- Visual verification: badge high tampil dan urutan antri benar.

---

### 25.E — BUGFIX: Inquiry Flow mirrors DRF (assign → Terima → Kerjakan) (Status: COMPLETED)
User complaint: Inquiry history shows `engineering started (auto via assign)` and status jumps.

**Target behavior (implemented)**
- After assign: **Antri (belum diterima)**
- After Terima: **Diterima (belum dikerjakan)**
- After Kerjakan: **Dikerjakan** (status `in_progress`, set `work_started_at`)

**Backend fixes (implemented)** (`backend/routers/sales.py`)
- `POST /api/inquiries/{inq_id}/assign`
  - Removed auto-transition `submitted → in_progress`.
  - Removed history entry `engineering started (auto via assign)`.
  - Re-assign to different engineer:
    - Reset `accepted_at`, `work_started_at`, related fields.
    - Set status back to `submitted`.
    - Push history `re-assign — menunggu diterima oleh <engineer>`.
- `POST /api/inquiries/{inq_id}/start-job`
  - If status `submitted`, set status to `in_progress`.
  - If `accepted_at` missing, set it.

**Frontend fixes (implemented)**
- Status labels derived from timestamps (3-stage), not raw DB status, including legacy data:
  - `work_started_at` → Dikerjakan
  - else if `accepted_at` → Diterima — Belum Dikerjakan
  - else → Antri — Belum Diterima
- `frontend/src/pages/SalesPage.jsx`
  - StatusBadge updated to show derived stage.
  - Added assignee buttons:
    - Terima: `btn-inq-terima` (calls `/api/inquiries/{id}/receive-job`)
    - Mulai Kerjakan: `btn-inq-kerjakan` (calls `/api/inquiries/{id}/start-job`)
  - “Selesai Costing” button now only shown when `status==in_progress` AND `work_started_at` exists.
- `frontend/src/pages/EngineeringInquiryMasterlistPage.jsx`
  - Stage label derived via timestamps.
- `frontend/src/components/EngineeringQueuePanel.jsx`
  - Normalization fixed: inquiry assigned but not accepted treated as “Antri”.

**Verification (done)**
- Backend smoke tests: assign no auto-start, receive/start transitions OK, reassign resets OK.
- Visual verification: status column shows Antri/Diterima/Dikerjakan accordingly.

---

### 25.F — Direktur Landing: “Butuh Approval dari Sales” panel (Status: COMPLETED)
User request: saat login Direktur/Boss (Asiong), di halaman utama tampil panel kebutuhan approval dari Sales, posisinya di ATAS progress SO.

**Frontend (implemented)**
- New component: `frontend/src/components/BossApprovalPanel.jsx`
  - Shows inquiries with status `pending_boss_review`.
  - Button “Review & Approve” → navigates to `/sales/inquiries?open=<id>`.
  - Polling every 60 seconds.
  - Hidden when empty.
- Landing page: `frontend/src/pages/LandingPage.jsx`
  - Rendered only when `role === "sales_head"`.
  - Placed **above** `<SoProgressTracker />`.

**Verification (done)**
- Visual verification: panel appears above progress SO, row displayed, click opens inquiry detail modal.

---

### Phase 25 — Testing & Cleanup (Status: COMPLETED)
- Backend smoke tests (cookie auth) passed (iteration_54).
- Visual verification passed (iteration_54/55/56).
- All temporary test data (ZZ* and zz_*) cleaned from DB.
- Temporary local script `backend_test_engineering_batch.py` removed.
- Note: main-agent screenshot tool environment sometimes shows blank “MEMUAT…” due to cookie `SameSite=None; Partitioned` and automation constraints; **not an app bug** (testing agent validated UI).

---

## Notes / Current GitHub Safety
- `BossApprovalPanel.jsx` is a new tracked file; ensure it is committed.
- `test_reports/iteration_54.json`, `iteration_55.json`, `iteration_56.json` exist (testing artifacts). Keep or remove per repo policy.

---

## Open Items (not requested yet)
- **Category threshold gap** around 70–71% (business rule): decide if boundary should be inclusive at 70 or 71.
- **Export KPI Engineering to Excel** (similar format to recap export).