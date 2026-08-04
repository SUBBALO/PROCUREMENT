# plan.md — Modul NONCONFORMANCE (CAR)

## 1) Objectives
- Menyediakan modul **NONCONFORMANCE (CAR)** untuk QC/Produksi/Sales menerbitkan NC terhadap **Drawing**.
- Menyediakan alur tindak lanjut oleh Engineering Leader: **Open → Assigned → In Progress → Closed** dan menjadi dasar pembuatan **ECN**.
- Mengubah **KPI #1** agar menghitung “Drawing tanpa NC” berdasarkan **record NC** (bulan NC diterbitkan) dengan auditability (numerator/denominator + daftar record).
- Menyediakan masterlist CAR lintas portal (QC/Produksi/Sales/Engineering) dengan hak akses yang jelas.
- Menunda desain UI form detail sampai user mengirim **template NCR** (jangan menebak field).

## 2) Implementation Steps

### Phase 1 — Core Flow POC (Backend saja, minimal tapi end-to-end)
**User stories (POC)**
1. Sebagai user QC/Produksi/Sales, saya bisa membuat NC dan menautkan **1 atau banyak drawing**.
2. Sebagai user, saya bisa melihat daftar NC yang saya buat dan statusnya.
3. Sebagai Eng Leader, saya bisa meng-assign NC ke staff Engineering.
4. Sebagai Eng staff, saya bisa mengubah status NC menjadi In Progress dan menambahkan catatan.
5. Sebagai Eng Leader, saya bisa menutup NC (Closed) dan menyimpan referensi ECN bila sudah terbit.

**Langkah implementasi**
- DB + Model
  - Tambah koleksi `nonconformances`.
  - Buat Pydantic models di `/app/backend/models.py` (atau file model baru jika pola codebase mendukung) untuk:
    - `NonconformanceCreate` (baseline fields minimal)
    - `NonconformanceUpdateStatus/Assign`.
  - Desain baseline field (sementara, bisa diextend setelah template NCR):
    - `id`, `nc_no` (counter per bulan), `issuer_dept` (qc/produksi/sales), `issued_by`, `issued_at`, `status`,
    - `drawing_ids: []`, `drawing_nos: []` (denormalized untuk filter cepat),
    - `description` (ringkas), `attachments: []` (opsional, mengikuti pola GridFS bila diperlukan),
    - `assigned_to` (id+name), `notes[]` (timeline), `ecn_id/ecn_no` (opsional), `closed_at`.
- Router
  - Buat `/app/backend/routers/nonconformance.py`:
    - `POST /api/nonconformance` (QC/Produksi/Sales/Admin)
    - `GET /api/nonconformance` (filter: status, issuer_dept, drawing_no, date range)
    - `GET /api/nonconformance/{id}`
    - `POST /api/nonconformance/{id}/assign` (Eng Leader/Admin)
    - `POST /api/nonconformance/{id}/status` (Assigned/In Progress/Closed; role guard)
    - `POST /api/nonconformance/{id}/note` (tambahkan catatan timeline)
  - Tambahkan router ke `server.py`.
- Indexes
  - Buat index untuk `issued_at`, `status`, `drawing_nos`, `assigned_to.id`, `issuer_dept`.
- POC Testing (backend)
  - Tambah test script/pytest minimal di `/app/backend/tests/`:
    - create NC dengan multi-drawing, assign, update status, close.
    - pastikan RBAC (issuer vs eng_staff vs eng_leader) berjalan.

### Phase 2 — V1 App Development (MVP UI + KPI wiring)
**User stories (V1)**
1. Sebagai QC/Produksi/Sales, saya bisa membuka halaman masterlist CAR dan membuat NC sederhana.
2. Sebagai user, saya bisa mencari NC berdasarkan nomor drawing / status.
3. Sebagai Eng Leader, saya bisa melihat queue NC Open/Assigned dan melakukan assign.
4. Sebagai Eng staff, saya bisa update progress NC tanpa bisa mengubah issuer/issued_at.
5. Sebagai manajemen/engineering, saya bisa melihat KPI #1 yang berubah otomatis berdasarkan data NC bulan berjalan.

**Langkah implementasi**
- KPI #1 (backend)
  - Update `/app/backend/routers/kpi.py`:
    - KPI `drawing_customer_nc`: Denominator = total drawing rilis bulan tsb (tetap) atau disepakati ulang menjadi “total drawings release” di bulan tsb.
    - Numerator = drawings release bulan tsb yang **tidak punya NC yang issued pada bulan tsb** (atau aturan final: NC issued month menjadi basis KPI #1).
    - Endpoint records tetap auditable: return list `ref` (drawing_no) + `ok` + catatan + tanggal + id NC terkait (jika ada).
  - Pastikan performa: query `nonconformances` by `issued_at` month + explode `drawing_nos`.
- Frontend (tanpa final form detail)
  - Tambah halaman:
    - `/app/frontend/src/pages/NonconformanceMasterlistPage.jsx` (tabel + filter + status pill).
  - Tambah “Create NC (Sederhana)” modal sementara:
    - input minimal: daftar drawing (multi-select by drawing_no), deskripsi singkat.
    - copy UI 100% Indonesian.
  - Tambah action sesuai role:
    - Eng Leader: tombol Assign, ubah status.
    - Eng staff: tombol In Progress/Closed (sesuai guard backend).
- Navigasi portal
  - Tambahkan menu/tab ke portal QC/Produksi/Sales/Engineering sesuai pola yang sudah ada.

### Phase 3 — Form NCR sesuai template + Attachments + Hardening
**User stories (Phase 3)**
1. Sebagai issuer, saya bisa mengisi form NC sesuai format perusahaan dan menyimpan field lengkap.
2. Sebagai user, saya bisa upload lampiran bukti (foto/pdf) ke NC dan mempreview tanpa download jika role tertentu dibatasi.
3. Sebagai Eng Leader, saya bisa reject/return (opsional jika diminta) dengan catatan dan lampiran.
4. Sebagai user, saya bisa export/print CAR bila dibutuhkan (opsional, setelah template jelas).
5. Sebagai admin, saya bisa audit semua perubahan status/notes (timeline jelas).

**Langkah implementasi**
- Setelah user mengirim template NCR:
  - Map field template → schema final (extend tanpa breaking: default null/empty).
  - Update UI form lengkap mengikuti urutan/label form asli.
- Attachments untuk NC (bila diminta)
  - Implement GridFS bucket `nonconformance_attachments` mirip `bom_attachments`.
  - Preview via viewer image-based yang sudah ada.
- Observability
  - Log action via `log_action` untuk create/assign/status/close.
- Testing end-to-end
  - Tambah test iterasi baru (backend + frontend smoke).

## 3) Next Actions
1. Implement koleksi + router `nonconformance.py` + include ke `server.py`.
2. Tambah indexes startup (atau migration ringan) untuk `nonconformances`.
3. Buat backend tests untuk core flow (create → assign → in_progress → closed).
4. Wire KPI #1 ke data `nonconformances` (tanpa mengubah KPI lainnya).
5. Buat halaman masterlist minimal + modal create sederhana (sementara).
6. Tunggu user kirim template NCR → finalisasi schema & UI form lengkap.

## 4) Success Criteria
- Backend: NC bisa dibuat oleh QC/Produksi/Sales, bisa link **multi drawing**, status flow berjalan, RBAC benar.
- KPI #1: angka numerator/denominator + records audit **konsisten** dengan data `nonconformances` per bulan.
- Frontend MVP: masterlist tampil, filter berjalan, create NC sederhana berhasil.
- Tidak ada regresi di modul Engineering KPI Dashboard, Excel preview (LibreOffice prewarm), dan portal Engineering yang sudah ada.
