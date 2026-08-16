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

**Hotfix included (Feb 2026)**
- Fixed duplicate function definition `update_job_progress` that prevented saving PIC/remarks via `PUT /production/job-progress/{so_id}`.

---

## Phase 13: QC Ownership Fix — Relocate "Release Note Menunggu Persetujuan" to QC Portal (Status: COMPLETED)
User feedback terbaru (governing):
- "QC — Release Note Menunggu Persetujuan" **harus berada di menu/portal QC**, bukan di halaman/portal Produksi.
- Produksi hanya membuat Draft + Submit ke QC.
- QC menerima notifikasi di kartu QC, review, dan **TTD approve**/reject di area QC.

Implemented:
- Backend: QC-only authorization untuk pending/release/reject; fields `qc_comment`, `qc_signature` (optional), `ready_for_delivery`.
- Notifications: `frn_pending_qc` untuk QC, `fg_ready_delivery` untuk Store/admin-like.
- Frontend: halaman QC `/qc/release-notes` + card portal QC; Production FGRN read-only setelah submit; card QC di Production portal dihapus.
- Agent-tested: flow Draft→Submit→QC Release/Reject PASS; role access PASS; temp records cleaned.

---

## Phase 14: Usability — Panel "Hari Ini" + Quick Wins Produksi (Status: COMPLETED)
Tujuan: mempermudah akses harian agar user rajin pakai.
- Backend (`production.py`): `GET /production/today-summary` + `GET /production/present-operators?date=` (guard Produksi/Admin).
- Frontend Panel "Hari Ini" di atas Job Progress (portal Produksi): tile status + tombol aksi cepat via deep-link.
- Absensi: tombol **"Tandai Semua Hadir"** + deep-link auto-buka.
- Daily Report: tombol **"Isi Operator Hadir"** + deep-link auto-buka.
- Verifikasi: esbuild clean; API smoke OK (produksi 200, sales 403).

---

## Phase 15: Attendance sticky header fix + SO Progress/TV production reflect + Full Testing (Status: COMPLETED)
- Fix: header Nama/Bagian di grid Absensi tetap menempel saat scroll (thead sticky top) — screenshot-verified.
- SO Progress & TV: stage "Produksi" kini mencerminkan Daily Production Report (in_progress + hari kerja) & Finished Goods Release Note.
- Comprehensive testing (Sales→Produksi→QC) via testing agent: **28/30 backend API pass (93.3%)**, alur kritikal QC Release Note PASS. Dua temuan minor = false negative & path BOM salah tebak. Temp users/data dibersihkan.

---

## Phase 16: Cross-Module Governance Backlog (Audit/Security/Engineering/QC Assets/Tools) (Status: UPDATED)
Governing request: user mengunci backlog final dan meminta coding sesuai urutan default.

### Backlog (Confirmed by user)
- **Tahap 1 (fondasi)**: Audit Trail → Login Log & Sesi Aktif → Recycle Bin (**Status: COMPLETED**)
- **Tahap 2 (akses & navigasi)**: Manajemen Hak Akses Detail (per user per menu) → Pencarian Global di header (**Status: COMPLETED / ALREADY EXISTED**)
- **Tahap 3 (engineering/doccon)**: Reminder Drawing Belum Release → Revisi Drawing Berantai (notif ke Produksi “pakai revisi terbaru”) (**Status: NOT STARTED — NEXT**)
- **Tahap 4 (QC)**: Masterlist Alat Ukur + input sertifikat kalibrasi pihak ke-3 + reminder H-30 & overdue merah (**Status: COMPLETED**)
- **Tahap 5 (produksi)**: Peminjaman Alat/Tools (inventory alat + status pinjam/kembali/hilang) (**Status: COMPLETED**)
- **Tahap 5b (produksi)**: **Stok Opname Alat Produksi** (cek fisik berkala, finalisasi tandai hilang) (**Status: COMPLETED**)
- **Tahap 6 (data)**: Backup & Restore database (**Status: NEEDS CONFIRMATION**; full backup code+data already exists in Phase 5)

> Catatan konsistensi: sistem sudah punya Full Backup/Restore (code+data) (Phase 5). Tahap 6 hanya dikerjakan bila user butuh versi **data-only** yang lebih operasional (retensi/scheduling/collection selection/anonymize).

---

### Phase 16.1 — Tahap 1 (Fondasi) (Status: COMPLETED)
Tahap ini diselesaikan dengan pendekatan **non-regresif** (token lama tetap valid, data produksi tidak ikut rusak karena soft-delete filter belum dipasang di query lama).

#### 16.1.1 Audit Trail (Status: COMPLETED / ALREADY EXISTED)
Discovery (sudah ada):
- Collection: `activity_logs`.
- Helper: `deps.log_action()`.
- Admin UI: tab **Log Aktivitas** (`GET /api/logs`).
- Pemakaian sudah luas (termasuk produksi/orders/drawing_requests, dll).

Scope tambahan yang dipastikan:
- Delete lembur produksi sekarang juga menghasilkan log (`delete_overtime`).

#### 16.1.2 Login Log & Sesi Aktif (Status: COMPLETED)
**Goal** tercapai: catat setiap login (sukses & gagal) + tampilkan sesi aktif + admin bisa akhiri sesi.

**Backend (implemented)**
- `security.py`:
  - `create_access_token(..., sid=...)` dan `create_refresh_token(..., sid=...)`.
- `routers/auth.py`:
  - Login: insert `login_logs` (success/fail, IP via `X-Forwarded-For`/`X-Real-IP`, user-agent), create `active_sessions`.
  - Logout: hapus sesi (sid).
  - Refresh: bawa sid + tolak bila sesi sudah revoked.
  - Admin endpoints:
    - `GET /admin/login-logs` (filter username/status/tanggal, paging)
    - `GET /admin/active-sessions` (online = last_seen ≤ 5 menit, cleanup sesi > 8 jam)
    - `POST /admin/sessions/{sid}/revoke` (super_admin; tidak bisa revoke sesi sendiri)
- `deps.py get_current_user`:
  - Update `last_seen` per request jika token membawa `sid`.
  - Jika sesi revoked → 401 (token lama tanpa sid tetap lolos).
- `server.py`:
  - Added indexes: `login_logs(ts, username)`, `active_sessions(last_seen, user_id)`.

**Frontend (implemented)**
- AdminPanel tab baru: **Sesi & Login**
  - Sesi aktif: Online/Idle, IP, perangkat (UA parsed), tombol “Akhiri Sesi”.
  - Riwayat login: filter username + status + paging.

**Verification**
- Smoke test: login gagal & sukses tercatat; sesi online muncul; revoke → user jadi 401; logout menghapus sesi.
- Screenshot tab Sesi & Login OK.

#### 16.1.3 Recycle Bin (Status: COMPLETED)
Discovery (sudah ada):
- `routers/trash.py` + `services/soft_delete.py` + Admin UI tab **Recycle Bin**.
- Soft-delete berbasis field untuk 11 koleksi (transactions, sales_orders, store_*, deliveries, boms, inquiries, quotations, customers, users).

**New (implemented): Recycle Bin untuk modul Produksi (snapshot-based)**
Motivasi: modul produksi banyak query lama belum memakai `NOT_DELETED_FILTER`, jadi soft-delete field-based berisiko dokumen terhapus masih muncul.

- `services/soft_delete.py`:
  - `SNAPSHOT_COLLECTIONS = [production_reports, fg_release_notes, production_overtime]`
  - `trash_snapshots` as storage (doc + metadata deleted_at/by)
  - helpers: `snapshot_delete`, `snapshot_restore`, `snapshot_purge`, `snapshot_summary`, `snapshot_purge_expired`
- `routers/trash.py`:
  - summary/list/restore/purge mendukung snapshot collections via `trash_snapshots`.
- `routers/production.py`:
  - delete report/FRN/overtime → `snapshot_delete(...)` (dan lembur sekarang log_action).
- `server.py`:
  - indexes `trash_snapshots(collection, deleted_at)`.
- `frontend AdminPage TrashTab`:
  - menambah label koleksi baru:
    - `production_reports`: Laporan Produksi
    - `fg_release_notes`: Release Note (FGRN)
    - `production_overtime`: Lembur Produksi

**Verification**
- Smoke test: delete report → hilang dari source → muncul di Recycle Bin → restore → kembali → purge → hilang.
- Screenshot Recycle Bin OK.

---

### Phase 16.2 — Tahap 2 (Akses & Navigasi) (Status: COMPLETED / ALREADY EXISTED)
#### 16.2.1 Manajemen Hak Akses Detail (per user per menu) (Status: COMPLETED)
- Sudah dibangun pada Phase 1–3 (granular access matrix + backend enforcement middleware + UI AccessMatrix).

#### 16.2.2 Pencarian Global di Header (Status: COMPLETED / ALREADY EXISTED)
- Backend: `GET /api/search/global?q=` sudah ada.
- Frontend: `frontend/src/components/GlobalSearch.jsx` terpasang di `AppShell` (header search).

> Follow-up opsional (bila user minta): perluasan coverage hasil search ke modul Produksi/QC terbaru (Daily Report/FGRN/QC Release Notes) dan/atau filter berbasis role.

---

### Phase 16.3 — Tahap 3 (Engineering/DocCon) (Status: NOT STARTED — NEXT)
#### 16.3.1 Reminder Drawing Belum Release
**Goal**: bila SO sudah mulai jalan (ada aktivitas produksi / masuk progress) tapi drawing belum release/stamp, tampil warning.

Revised approach (align dengan sistem sekarang):
- Tentukan “SO sudah jalan” dari sinyal berikut (any):
  - Production daily reports exists
  - Job progress started
  - FGRN exists
- Tentukan “drawing belum release” dari status di modul drawing register/controlled documents (source of truth yang dipakai DocCon).
- Output:
  - Notifikasi ke Doc Control / Engineering Leader.
  - Badge/flag di SO progress / timeline.

Implementation steps (planned):
- Backend:
  - Endpoint “watchlist” (mis. `/doc-control/drawing-release-watchlist`) atau integrasi ke notifications.
  - Notification category baru: `drawing_not_released`.
- Frontend:
  - Card/Badge di portal DocCon/Engineering.
  - Link ke SO timeline / drawing register.

Acceptance:
- Minimal 1 SO yang sudah jalan tapi drawing belum release muncul warning.

#### 16.3.2 Revisi Drawing Berantai
**Goal**: kalau drawing direvisi, Produksi otomatis dapat notif “pakai revisi terbaru”.

Implementation steps (planned):
- Backend:
  - Hook ke event revisi drawing (upload/approve revisi di DocCon).
  - Buat notification ke role produksi + admin-like.
  - Tambah mekanisme “ack revisi” per SO/revisi (opsional) supaya jelas sudah dibaca.
- Frontend:
  - Notif panel produksi + link langsung ke drawing revision.

Acceptance:
- Saat revisi dibuat, Produksi menerima notifikasi dan dapat membuka revisi terbaru.

---

### Phase 16.4 — Tahap 4 (QC) — Masterlist Alat Ukur + Kalibrasi (Status: COMPLETED)
(see existing plan details; implemented in `backend/routers/tools.py`, `frontend/src/pages/QcMeasuringToolsPage.jsx`, QC portal badge `tool_calibration_due`)

---

### Phase 16.5 — Tahap 5 (Produksi) — Peminjaman Alat/Tools (Status: COMPLETED)
(see existing plan details; implemented in `backend/routers/tools.py`, `frontend/src/pages/ProductionToolsPage.jsx`)

---

### Phase 16.5b — Stok Opname Alat Produksi (Status: COMPLETED)
Extension dari Phase 16.5 untuk cek fisik berkala inventory tools.

**Backend (implemented)**
- `tool_opnames` collection + endpoints:
  - `POST/GET/PUT/DELETE /production/tools-opname`
  - `POST /production/tools-opname/{sid}/finalize` confirm `OPNAME-FINAL`.
- Finalisasi:
  - `not_found` → alat jadi `missing` (loan aktif ikut `missing` dengan catatan nomor opname)
  - `found` atas alat `missing` → kembali `available`
  - sesi finalized terkunci.

**Frontend (implemented)**
- Page: `frontend/src/pages/ProductionToolsOpnamePage.jsx` route `/produksi/tools/opname`.
- Button: di `ProductionToolsPage` header: **Stok Opname**.

---

### Phase 16.6 — Tahap 6 (Data) — Backup & Restore Database (Status: NEEDS CONFIRMATION)
**Current state**
- Full backup/restore code+data sudah ada (Phase 5).

If user still needs Tahap 6:
- Tambahkan **data-only** export/import (lebih cepat & operasional) dengan:
  - pilihan koleksi
  - opsi anonymize (optional)
  - safety confirm phrase
  - audit log event untuk backup/restore
  - optional retention/scheduling (jika environment memungkinkan)

---

## Phase 17 — Code Quality Review Fixes (Status: COMPLETED)
External code review report diterima; diterapkan secara pragmatis (fix kritis & aman, hindari refactor masif berisiko pada app yang sudah berjalan).

### FIXED
1) **XSS (kritis)** — `frontend/src/pages/ProductionOvertimePage.jsx` (doPrint)
- Semua data user (name, so_no, customer, ot_start, ot_end) **di-escape HTML** (`esc()` helper).
- `document.write()` dihapus → diganti **Blob URL + window.open**.

2) **Security: Dynamic import** — `backend/tests/test_iter9.py`
- `__import__('uuid')` → `import uuid` statis.

3) **Empty catch blocks** (minimal log) — sekarang `console.warn/error` dengan konteks
- `frontend/src/pages/TransferRequestPage.jsx` (loadNextNo)
- `frontend/src/pages/StoreIssuePage.jsx` (loadRecent)
- `frontend/src/pages/StockHistoryPrintPage.jsx` (company setting, load history, window.print)

4) **Array index keys** (read-only lists dengan data stabil)
- `WorkOrderEngineeringPage.jsx` riwayat TTD → `key={h.id || `${drawing_no}-${stage}-${signed_at}`}`
- `StoreStockPage.jsx` riwayat stok → `key={r.id || `${kind}-${date}-${ref}-${idx}`}`

### VERIFIED AS FALSE POSITIVE / NOT CHANGED
- **Backend undefined variables**: pyflakes scan seluruh `/app/backend` = **0 undefined name**.
- **`is` vs `==` literal**: AST scan pada `utils/pdf_stamper.py`, `utils/render_cache.py`, `utils/office_render.py` = **0 pelanggaran**. Yang ada adalah `is None`/`is not None` (benar) dan beberapa `is True/False` tri-state yang disengaja.
- **localStorage security**: `frontend/src/lib/tableResize.js` hanya simpan **lebar kolom (angka)**; auth token sudah httpOnly cookie; tidak ada data sensitif.
- **Hook deps warnings** (contoh diverifikasi):
  - `TvSoProgressPage.jsx` deps benar (imports & setter stabil).
  - `WorkOrderEngineeringPage.jsx` hooks sudah memakai dependency arrays yang benar.

### DEFERRED (by design; to avoid regression)
- Mass-fix “382 hook deps” (banyak false-positive; risiko infinite loop/regresi).
- Ganti index keys pada form arrays dinamis (Sales/SO items) butuh refactor state/handler agar punya `row_id` stabil.
- Refactor besar untuk split komponen (AppShell, DrawingRequestFormDialog, dll) + turunkan kompleksitas fungsi backend (parse_po, full_restore, dll) + tingkatkan type hints.

### Verification
- Frontend esbuild clean.
- Backend+frontend services running.
- Overtime page load OK (screenshot) dan printing flow tidak memakai `document.write` lagi.
- Temp user testing dibersihkan.

---

## Notes / Current GitHub Safety
- Perubahan terbaru masih **modified** dan belum di-commit/push.
- Untracked report QA: `test_reports/iteration_43.json` (boleh di-commit atau di-.gitignore sesuai kebijakan).
- Disarankan commit bertahap (agar jelas dan mudah rollback):
  1) `Phase 17 code-quality fixes (XSS print OT + empty catches + test import + stable keys)`
  2) (existing recommended sequence from plan) `Store role helpers`, `Stock Opname`, `Temp Transactions`, `QC move`, `Tahap 1 fondasi`, `Tahap 4-5 tools`, `Tahap 5b tools opname`.
- Reminder: GitHub hanya backup **kode**; untuk **data** gunakan Full Backup (tar.gz) dan/atau Tahap 6 data-only backup bila sudah dibuat.
