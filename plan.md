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
  - `POST /temp-transactions/{tid}/commit` → masuk sistem persis Bulk Transaksi (memanggil `bulk_direct_create()`), lalu hapus draft + hapus foto bila orphan.
  - `POST /temp-transactions/{tid}/retry` → ulangi pembacaan AI untuk draft `failed`.
  - `DELETE /temp-transactions/{tid}` → buang draft + hapus foto jika orphan.
- Keamanan/akses:
  - Semua endpoint write memakai `require_write` (Purchasing/admin-like), sehingga Finance/Store/Engineering/Sales tidak bisa write.

### Phase 9.2 AI / OCR Engine (Status: COMPLETED)
- SDK: `google-genai` dipasang di backend.
- Key: `GEMINI_API_KEY` disimpan di `backend/.env` (user punya sendiri).
- Mode:
  - Default `GEMINI_MODE=developer` (Gemini Developer API / AI Studio).
  - Jangan set `vertexai=True` kecuali benar-benar pakai key Vertex (bukan AI Studio).
- Model default: `gemini-flash-latest`.
- Prompt output JSON terstruktur: vendor, date, invoice_no, line_items; melarang subtotal/ppn/total di `line_items`.

### Phase 9.3 Frontend (Status: COMPLETED)
- Halaman baru:
  - `frontend/src/pages/TempUploadPage.jsx` route `/purchasing/temp-upload` (UI ramah HP, multi upload, preview)
  - `frontend/src/pages/TempTransactionsPage.jsx` route `/purchasing/temp-transactions` (tabel mirip Bulk Transaksi, edit inline auto-save, polling processing, dialog foto, commit per baris)
- Navigasi:
  - Menu Purchasing ditambah item: **"Transaksi Sementara (Foto Nota)"**.
  - Finance diblokir dari route baru lewat `blockedForFinance` di `App.js`.

### Phase 9.4 Verification (Status: COMPLETED)
- End-to-end terbukti:
  - 1 foto nota → AI memecah menjadi beberapa baris item dengan vendor/tanggal/no nota/qty/harga benar.
  - Commit 1 baris → transaksi tersimpan + stok masuk sesuai pilihan `stock_mode`.
  - Foto otomatis terhapus setelah semua baris yang memakai foto tersebut sudah commit/discard.

---

## Phase 10: Purchasing — Transaksi Sementara Enhancements + QA Purchasing/Store (Status: COMPLETED)
Tujuan: mempercepat kerja Purchasing (commit massal) dan merapikan data pembelian (kategori otomatis + normalisasi supplier), serta memastikan tidak ada bug/regresi.

### Phase 10.1 — Alias link upload singkat (Status: COMPLETED)
- Rute alias: **`/upload`** → sama dengan halaman upload nota (tetap ProtectedRoute, harus login).
- Rute lama `/purchasing/temp-upload` tetap berjalan.

### Phase 10.2 — Kategori Otomatis (AI) + Kolom Kategori di Draft (Status: COMPLETED)
- Backend (`temp_transactions.py`):
  - AI menebak `category` per line item.
  - Prompt diberi daftar kategori existing dari DB: `db.transactions.distinct('category')` sebagai preferensi pilihan AI.
  - Field `category` disimpan di draft, bisa diedit via PUT, dan ikut dikirim saat commit.
- Commit (`temp_transactions.py` → `_commit_one()`):
  - `category` diteruskan ke `bulk_direct_create` (default `Uncategorized` jika kosong).
- Frontend (`TempTransactionsPage.jsx`):
  - Kolom **Kategori** + autocomplete dari `/master/categories`.

### Phase 10.3 — Commit Semua Sekaligus (Status: COMPLETED)
- Backend (`temp_transactions.py`):
  - Endpoint: `POST /temp-transactions/commit-batch` body `{ids:[...]}`.
  - Refactor: helper `_validate_commit_doc()` + `_commit_one()`.
  - Per-baris gagal dilaporkan tanpa menggagalkan baris lain.
- Frontend (`TempTransactionsPage.jsx`):
  - Checkbox per baris **ready + valid** + select-all.
  - Tombol **"Masuk Sistem (N Baris)"**.

### Phase 10.4 — Normalisasi Supplier + Auto-Koreksi Vendor Terdaftar (Status: COMPLETED)
User goal: memudahkan search nama perusahaan (bukan mulai dari "PT").
- Backend (`temp_transactions.py`):
  - `_flip_entity_name()`:
    - contoh: `PT. INTERNATIONAL HARDWARE INDO` → `INTERNATIONAL HARDWARE INDO, PT`
    - prefix: PT/CV/UD/PD/FA/TB
  - `_resolve_vendor()`:
    - jika vendor sudah pernah ada di database, auto-koreksi ke penulisan vendor yang sudah terdaftar.
    - pencocokan memakai `vendor_key` (lowercase, buang tanda baca, buang token badan usaha).
  - Dipakai di:
    - hasil AI (vendor_name otomatis dinormalisasi)
    - PUT edit draft (vendor_name dinormalisasi + dikoreksi)

### Phase 10.5 — BUG FIX (Regresi kritis) bulk-direct insert_many kosong (Status: COMPLETED)
- Masalah: `insert_many([])` crash bila semua baris `stock_mode='none'`.
- Perbaikan (`backend/routers/transactions.py`): guard `if tx_docs: insert_many(...)` dan `if receipt_docs: insert_many(...)`.

### Phase 10.6 — QA Automation (Testing Agent) Purchasing + Store (Status: COMPLETED)
- Report: `/app/test_reports/iteration_43.json`
- Hasil:
  - Backend: **100% (22/22)**
  - Frontend critical page loads: **100% (11/11)**
- Verifikasi khusus:
  - Regresi `bulk-direct` all-none fixed ✅
  - Tombol `Tambah Pengiriman` terlihat dan POST /deliveries by super_admin works ✅
  - /upload route OK ✅
  - Stock Opname endpoints OK ✅
- Cleanup:
  - Semua data tes `zz_`/`ZZ*` bersih (0 sisa).
  - **CATATAN LIVE DATA**: user `susanto` sudah memakai draft temp_transactions; **JANGAN** pernah commit/edit/delete saat testing.

---

## Phase 11: Purchasing — Transaksi Sementara Polish (live feedback) (Status: COMPLETED)
Tujuan: menghilangkan kebutuhan geser horizontal dan membuat nama barang/supplier panjang terbaca penuh, plus fitur kerja Purchasing tambahan.

### Phase 11.1 — Tabel lebih compact (Status: COMPLETED)
- `TempTransactionsPage.jsx`: table-fixed, kolom dirampingkan, tombol aksi dipadatkan, overflow horizontal di layar 1366px dihilangkan.
- Root cause overflow sebelumnya: konten kolom Aksi (tombol + ikon) membuat scroll 6px.

### Phase 11.2 — Nama barang/supplier auto-wrap ke bawah (Status: COMPLETED)
- `TempTransactionsPage.jsx`:
  - Kolom Supplier & Nama Barang memakai `AutoGrowArea` (textarea auto-tinggi mengikuti isi).
  - Nama panjang bisa dibaca penuh tanpa melebar ke samping.
  - Trade-off: input supplier/barang tidak memakai datalist browser; namun autocomplete untuk SO dan kategori tetap.

### Phase 11.3 — SO menampilkan Customer (Status: COMPLETED)
- `TempTransactionsPage.jsx`:
  - `GET /sales-orders` dimuat sebagai `{so_no, customer}`.
  - Datalist option menampilkan **customer** sebagai label.
  - Jika `project_no` cocok dengan SO, nama customer tampil kecil di bawah input SO.
- Catatan data: pada environment ini koleksi `sales_orders` bisa kosong; saat Sales membuat SO, fitur otomatis aktif.

### Phase 11.4 — Export Excel sebelum commit (Status: COMPLETED)
- Backend (`temp_transactions.py`): `GET /temp-transactions/export/xlsx` menghasilkan Excel (17 kolom) untuk semua draft yang belum masuk sistem.
- Frontend (`TempTransactionsPage.jsx`): tombol **Export Excel** download blob.
- Teruji read-only dengan draft asli user (tanpa mengubah/menghapus).

### Phase 11.5 — Portal Purchasing card (Status: COMPLETED)
- `PurchasingPortalPage.jsx`: card **Transaksi Sementara (Foto Nota)** ditambahkan agar mudah ditemukan dari portal.

---

## Phase 12: Production — Daily Report / Attendance / Overtime / Job Progress / FGRN (Status: IN PROGRESS)
Ringkasan keputusan besar yang sudah berjalan di modul Produksi:
- Daily Production Report: date-first, multi-row, spreadsheet-like, operator dari master produksi, blok input bila operator absent.
- Attendance: calendar grid, Sunday + holiday marker merah, sticky Nama/Bagian, Night Shift = Shift 2 truth.
- Overtime: rule tier 1.5x/2x weekdays+Sat, Sunday/holiday 2x; recap bulanan grid; export excel; print OT request signature blocks.
- Job Progress: satu line per SO, finished otomatis dari FGRN (released saja), target working days exclude Sundays+holiday.
- FGRN: multi-item per SO, balance per item, Draft→Submit QC→Release/Reject.

Catatan status UI terakhir:
- Ringkasan Kerja SO: kolom Operator sudah dihapus dari list view (detail tetap ada). (Belum user-confirm, tapi build lulus.)

---

## Phase 15: Attendance sticky header fix + SO Progress/TV production reflect + Full Testing (Status: COMPLETED)
- Fix: header Nama/Bagian di grid Absensi tetap menempel saat scroll (thead sticky top) — screenshot-verified.
- SO Progress & TV: stage "Produksi" kini mencerminkan Daily Production Report (in_progress + hari kerja) & Finished Goods Release Note (progress X/Y pcs; done bila qty rilis >= qty SO). Dashboard & public/TV pakai data sama.
- Comprehensive testing (Sales->Produksi) via testing agent: 90% overall, semua alur kritikal QC Release Note PASS. Tidak ada bug nyata (2 temuan minor = false negative & path BOM salah tebak). Temp users/data dibersihkan.

## Phase 14: Usability — Panel "Hari Ini" + Quick Wins Produksi (Status: COMPLETED)
Tujuan: mempermudah akses harian agar user rajin pakai.
- Backend (`production.py`): `GET /production/today-summary` (belum absen X/Y, laporan hari ini, Release Note ditolak QC) + `GET /production/present-operators?date=` (operator hadir, default hadir bila belum diabsen). Keduanya guard Produksi/Admin.
- Frontend Panel "Hari Ini" di atas Job Progress (portal Produksi): 3 tile status + tombol aksi cepat (Isi Absensi / Input Produksi / Ajukan Ulang) via deep-link.
- Quick win Absensi: tombol **"Tandai Semua Hadir"** di modal; deep-link `?input=today` auto-buka Input Presensi.
- Quick win Daily Report: tombol **"Isi Operator Hadir"** (auto-tambah baris operator yang hadir); deep-link `?input=today` auto-buka Input.
- Catatan: dropdown SO sudah menampilkan customer & auto-fill (sudah ada sebelumnya).
- Verifikasi: esbuild clean; API smoke — today-summary 200 (78 emp, 0 absen/laporan), present-operators 200 (78), sales 403. Screenshot portal belum diambil (butuh login role Produksi).

## Phase 13: QC Ownership Fix — Relocate "Release Note Menunggu Persetujuan" to QC Portal (Status: COMPLETED)
User feedback terbaru (governing):
- "QC — Release Note Menunggu Persetujuan" **harus berada di menu/portal QC**, bukan di halaman/portal Produksi.
- Produksi hanya membuat Draft + Submit ke QC.
- QC menerima notifikasi di kartu QC, review, dan **TTD approve**/reject di area QC.

Confirmed user decisions:
- Approvers: **QC Staff & QC Head** (role `qc`) + **admin-like** (server-side enforced).
- Signature model: **nama approver + timestamp otomatis**, plus **optional upload gambar tanda tangan** (base64 / string) untuk disimpan di record.
- Produksi tetap bisa lihat status (Menunggu QC / Released / Ditolak QC) **read-only** di list FGRN.
- Saat QC Release: tandai **ready_for_delivery=True** dan buat notifikasi untuk **Store**.
- Halaman/card QC yang ada di portal Produksi: **hapus total**, pindah sepenuhnya ke QC.

### Phase 13.1 — Backend: Access control + fields + workflow hooks (Status: NOT STARTED)
Target files: `backend/routers/production.py`, `backend/routers/notifications.py`.

1) **Role helper**
- `production.py`: import `is_qc` dari `deps`.
- Tambah helper:
  - `_can_prod(user)` (existing `_can_view` tetap untuk produksi/admin-like)
  - `_can_qc(user)` → `is_qc(user) or is_admin_like(user)`

2) **Restrict QC actions server-side**
- `POST /production/frn/{id}/release` dan `/reject`:
  - Ganti guard dari `_can_view` → `_can_qc`.
  - Terima optional body: `{ qc_comment?: str, qc_signature?: str }`.
  - Set fields:
    - `qc_by`, `qc_at` (existing)
    - `qc_comment` (QC-owned)
    - `qc_signature` (optional)
    - `ready_for_delivery=True` saat released.

3) **Submitted queues and counters**
- `GET /production/frn/pending-qc`:
  - Harus bisa diakses oleh **QC/admin-like** (untuk layar QC).
- `GET /production/frn/qc-pending-count`:
  - Diperluas agar dapat diakses oleh **QC + Production + admin-like** (badge untuk QC portal; produksi opsional untuk badge read-only bila masih dipakai).

4) **Serialization extensions**
- `_serialize_frn` tambahkan:
  - `qc_signature`
  - `ready_for_delivery`
  - `delivered` (bila sudah ada/akan dipakai oleh Store/Delivery)

5) **Store integration flags (minimal)**
- Jika belum ada, tambahkan field `delivered=False` default saat create.
- Ke depan, Store/Delivery module bisa set `delivered=True` saat barang benar-benar keluar.

### Phase 13.2 — Backend: Notifications (QC inbox + Store ready-delivery) (Status: NOT STARTED)
Target file: `backend/routers/notifications.py`.

1) **QC notification category**
- Untuk role `qc` (+ admin-like):
  - Category key: `frn_pending_qc`
  - Count: jumlah `fg_release_notes` dengan `status='submitted'`
  - Items: ringkas top 20/30 (RN no, SO no, customer, qty, date) link ke `/qc/release-notes`.

2) **Store notification category**
- Untuk role `store` (+ admin-like bila perlu):
  - Category key: `fg_ready_delivery`
  - Count: jumlah FRN `status='released' AND ready_for_delivery=True AND delivered != True`
  - Items link ke page store/delivery yang sesuai (sementara bisa link ke `/store` portal atau `/deliveries` sampai page khusus tersedia).

### Phase 13.3 — Frontend: QC page + portal card + routing cleanup (Status: NOT STARTED)
Target files: `frontend/src/pages/QCPortalPage.jsx`, `frontend/src/pages/ProductionPortalPage.jsx`, `frontend/src/pages/ProductionFrnPage.jsx`, `frontend/src/App.js`.

1) **New QC page**
- Buat `frontend/src/pages/QcReleaseNotesPage.jsx` (violet theme, QC-owned):
  - Table list: data dari `GET /production/frn/pending-qc`
  - Row action: open dialog untuk review.
  - Dialog:
    - input `qc_comment`
    - optional upload signature image → store as base64 string in payload (`qc_signature`).
    - buttons: Release / Reject.
  - On success: toast + reload list.

2) **QC Portal card**
- `QCPortalPage.jsx`: tambah card "Release Note Menunggu Persetujuan" dengan badge count dari:
  - either `useNotifCount('frn_pending_qc')` (preferred) or a direct endpoint
  - link `href: /qc/release-notes`.

3) **Remove QC approve UI from Production**
- `ProductionPortalPage.jsx`:
  - remove qcPending fetch (`/production/frn/qc-pending-count`) if no longer needed
  - remove the `qc-release` card entirely
  - remove badge on FGRN card if user wants QC-only notification (optional; if kept, badge should represent "menunggu QC" but no action)

4) **Production FGRN becomes submit-only + status read-only**
- `ProductionFrnPage.jsx`:
  - For `submitted` status: remove Release/Tolak buttons → replace with read-only label "Menunggu QC".
  - Keep: Draft → Submit QC, Rejected → Resubmit.
  - Ensure QC comment remains visible read-only.

5) **Routes**
- `App.js`:
  - add route: `/qc/release-notes` → `QcReleaseNotesPage`
  - remove import + route: `/produksi/qc-release` (`ProductionQcReleasePage`)

6) **Delete old page**
- Remove `frontend/src/pages/ProductionQcReleasePage.jsx` (or leave file but unreachable; preferred delete to avoid confusion).

### Phase 13.4 — Verification (no Testing Agent) (Status: NOT STARTED)
Standing instruction: **do not run testing_agent_v3** until user explicitly allows.

Verification steps (lightweight):
- Backend: quick `python -m py_compile` or import check.
- API smoke:
  - Produksi user: can submit, cannot release/reject (403).
  - QC user: can open pending list, release/reject success.
- Notifications:
  - QC sees `frn_pending_qc` count.
  - Store sees `fg_ready_delivery` count after a release.
- Frontend: `yarn build` / esbuild compile.
- Manual preview screenshot: QC portal badge + QC release page works.

---

## Notes / Current GitHub Safety
- Perubahan terbaru masih **modified** dan belum di-commit/push.
- Untracked report QA: `test_reports/iteration_43.json` (boleh di-commit atau di-.gitignore sesuai kebijakan).
- Disarankan commit bertahap (agar jelas dan mudah rollback):
  1) `Store role helpers + pemakaian (admin-like consistency)`
  2) `Stock Opname + Stock history icon` (backend+frontend)
  3) `Temp Transactions base (upload/review/commit per baris + /upload alias)`
  4) `Temp Transactions enhancements (kategori + commit-batch + vendor normalization + bulk-direct guard)`
  5) `Temp Transactions polish (compact table + autogrow + SO customer + export excel + portal card)`
  6) `QC move: Release Notes approval workflow moved to QC portal (backend+frontend+notifications)`
- Reminder: GitHub hanya backup **kode**; untuk **data** gunakan Full Backup (tar.gz).
