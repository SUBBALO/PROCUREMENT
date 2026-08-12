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
User request:
- Setiap hari ada nota belanja cash → foto dari HP → sistem auto-baca → masuk **list sementara**.
- Tabel mirip Bulk Transaksi.
- **Tidak boleh auto masuk sistem**: harus dicek/koreksi dulu satu per satu → baru commit.
- Upload lewat HP via link, tapi tetap **harus login**.
- Foto nota **tidak perlu disimpan** setelah transaksi masuk sistem (boleh dihapus).

### Phase 9.1 Backend (Status: COMPLETED)
- Router baru: `backend/routers/temp_transactions.py` didaftarkan di `backend/server.py`.
- Storage foto: GridFS bucket `temp_tx_photos`.
- Endpoint:
  - `POST /temp-transactions/upload` (multipart, multi foto) → simpan foto ke GridFS + buat draft baris status `processing` lalu jalankan AI via `BackgroundTasks`.
  - `GET /temp-transactions` → list semua baris draft (processing/ready/failed).
  - `GET /temp-transactions/photo/{photo_id}` → streaming foto untuk pembanding saat koreksi.
  - `PUT /temp-transactions/{tid}` → edit draft (inline correction).
  - `POST /temp-transactions/{tid}/commit` → **masuk sistem persis Bulk Transaksi** dengan memanggil `bulk_direct_create()` dari `routers/transactions.py`; setelah commit hapus draft + hapus foto bila sudah orphan.
  - `POST /temp-transactions/{tid}/retry` → ulangi pembacaan AI untuk draft `failed`.
  - `DELETE /temp-transactions/{tid}` → buang draft + hapus foto jika orphan.
- Keamanan/akses:
  - Semua endpoint write memakai `require_write` (Purchasing/admin-like), sehingga Finance/Store/Engineering/Sales tidak bisa write.

### Phase 9.2 AI / OCR Engine (Status: COMPLETED)
- SDK: `google-genai` dipasang di backend.
- Key: `GEMINI_API_KEY` disimpan di `backend/.env` (user punya sendiri).
- **Penting**: key format baru (termasuk prefix `AQ.`) diperlakukan sebagai **Gemini Developer API**.
  - Default `GEMINI_MODE=developer`.
  - Jangan pakai `vertexai=True` untuk key ini (sebelumnya menyebabkan 403 `aiplatform.googleapis.com`).
- Model default: `gemini-flash-latest`.
  - Catatan: `gemini-2.5-flash` bisa menghasilkan 404 pada beberapa akun baru, sehingga default diganti ke `gemini-flash-latest`.
- Prompt memaksa output JSON terstruktur: vendor, date, invoice_no, line_items; dan melarang memasukkan subtotal/ppn/total ke `line_items`.

### Phase 9.3 Frontend (Status: COMPLETED)
- Halaman baru:
  - `frontend/src/pages/TempUploadPage.jsx` route `/purchasing/temp-upload`
    - UI ramah HP: tombol besar Foto Kamera / Pilih Galeri, multi upload, preview grid, submit.
  - `frontend/src/pages/TempTransactionsPage.jsx` route `/purchasing/temp-transactions`
    - Tabel mirip Bulk Transaksi + kolom Foto/Status/Aksi.
    - Edit inline dan auto-save saat blur.
    - Polling tiap 3 detik saat ada status `processing`.
    - Dialog foto pembanding.
    - Commit **per baris** (dengan konfirmasi). Retry AI untuk failed. Draft failed bisa diisi manual → jadi `ready`.
- Navigasi:
  - Menu Purchasing ditambah item: **"Transaksi Sementara (Foto Nota)"**.
  - Finance diblokir dari route baru lewat `blockedForFinance` di `App.js`.

### Phase 9.4 Verification (Status: COMPLETED)
- End-to-end terbukti:
  - 1 foto nota → AI memecah menjadi beberapa baris item (contoh 3 baris) dengan vendor/tanggal/no nota/qty/harga benar.
  - Commit 1 baris → transaksi tersimpan + stok masuk sesuai pilihan `stock_mode`.
  - Foto otomatis terhapus setelah semua baris yang memakai foto tersebut sudah commit/discard (orphan cleanup).
- Screenshot: halaman review + dialog foto + halaman upload (mobile).
- Test data dibersihkan.

---

## Notes / Current GitHub Safety
- Perubahan terbaru masih **modified** dan belum di-commit/push.
- Disarankan commit bertahap (agar jelas dan mudah rollback):
  1) `DRF validation ramah`
  2) `Store role consistency helpers (isAdminLike/canSeeStorePrices) + pemakaian di pages`
  3) `Stock history icon + Stock Opname (backend+frontend)`
  4) `Temp Transactions (foto nota + AI) + GEMINI_MODEL default update + menu purchasing`
- Reminder: GitHub hanya backup **kode**; untuk **data** gunakan Full Backup (tar.gz).
