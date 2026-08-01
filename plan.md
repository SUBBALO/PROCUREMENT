# Development Plan — ERP/Procurement (FARM) — Engineering Workflow Consolidation + Document Security + Revision Loop

## Objectives
- ✅ **Selesai verifikasi Legacy Import multi-DWG**
  - Status: **COMPLETED**
  - Bukti: **Iteration 8** — backend **9/9** pass, frontend **10/10** pass.
- ✅ **Redesign MKS-F-ENG-005 Drawing Master List**
  - Status: **COMPLETED**
  - Deliverables:
    - Kolom **Status & TTD** (ringkas: status dokumen + DC stamp indicator + chip TTD)
    - **4 inline preview tiles** per baris: **DWG MKS**, **Customer**, **BOM**, **Nesting**
    - Preview DWG MKS/Customer menampilkan **DC-stamped** namun **tanpa SO stamp** (via `hide_so=1`)
    - Tombol **Print** hanya untuk **Engineering + Admin/SuperAdmin**
    - Footer **Printed by [nama]** ter-overlay dari backend stamping
  - Bukti: **Iteration 9** — backend **100% (11/11)** pass, frontend **95% (17/18)**.
- ✅ **Ekspor Master Drawing List ke Excel/PDF untuk arsip Engineering**
  - Status: **COMPLETED**
  - Deliverables:
    - Endpoint export: `GET /api/drawings/export?format=xlsx|pdf` mengikuti filter (q/discipline/status/so_no)
    - Tombol UI export (Excel/PDF) gated oleh `canPrintDrawing(role)`
  - Bukti: uji curl menghasilkan file valid (magic header XLSX/PDF) + verifikasi isi worksheet.
- ✅ **Repeat Order: Preview dokumen sebelum submit/tarik + Auto-detect nomor DWG saat upload manual**
  - Status: **COMPLETED**
  - Deliverables:
    - Di DRF Work (repeat order), chip dokumen di **Daftar Drawing** dan **Hasil Pencarian (Repeat Pull)** bisa diklik untuk preview (`PdfPreviewModal`).
    - Saat upload PDF MKS (manual repeat), sistem **auto-baca nomor DWG dari isi PDF** (format MKS) dan **auto-rename drawing_no**.
    - Fallback: editor manual **Ubah manual** No. DWG untuk koreksi bila detect salah/tidak kebaca.
  - Bukti: uji UI end-to-end: upload PDF → nomor berubah otomatis (tanpa mismatch warning), edit manual sukses, mismatch warning muncul bila nomor manual ≠ isi PDF.
- ✅ **Phase 1 DRF — NEW Order inline upload + tombol Simpan/Kirim**
  - Status: **COMPLETED**
  - Deliverables:
    - `DrawingRequestFormDialog.jsx`: area lampiran tampil langsung untuk **NEW Order** dan mendukung **multi-file** (click/drag-drop).
    - Tombol footer: **Batal · Simpan (draft) · Kirim Ke Engineering (submit)**.
    - Untuk DRF baru: file di-*queue* lokal → otomatis terupload saat Simpan/Kirim.
    - Upload lampiran bersifat **opsional**.
  - Bukti: uji end-to-end (buat DRF + attach + submit) berhasil; data uji dibersihkan.

---

## Phase 1 — Core POC (Isolation): “Preview DC-stamped tanpa SO stamp”
**Core paling riskan:** kemampuan backend+viewer menampilkan **stamped=1** sambil **hide SO stamp** untuk Master Drawing List.

### User Stories (POC)
1. Sebagai Engineer, saya ingin preview DWG MKS versi DC-stamped tanpa SO stamp agar Master List tetap “bersih”.
2. Sebagai Doc Control, saya ingin tetap bisa melihat stamp DC pada preview untuk validasi controlled document.
3. Sebagai Admin, saya ingin memastikan `hide_so` tidak mempengaruhi endpoint `pdf-stamped` normal yang dipakai download.
4. Sebagai QC/Produksi, saya ingin preview tetap mengikuti watermark/preview-only rule (tidak berubah).
5. Sebagai Engineer, saya ingin tombol print menghasilkan output dengan footer “Printed by …” (tanpa harus download).

### Implementation Steps (POC) — COMPLETED
1. ✅ **Backend** (`/app/backend/routers/drawing_register.py`)
   - Menambahkan query param `hide_so: bool = False` pada:
     - `GET /drawings/{id}/page-image`
   - Update `_build_stamped_for_target(..., hide_so=False)`:
     - Jika `target=="mks"` dan `hide_so==True` → `so_stamp=None` saat memanggil `_apply_pdf_stamps(...)`.
2. ✅ **Frontend viewer** (`/app/frontend/src/components/PdfPreviewModal.jsx`)
   - Menambahkan prop `hideSo` → mengirim `hide_so=1` pada URL `page-image`.
3. ✅ **Quick verification**
   - `page-image?stamped=1&hide_so=1` → PNG 200.
   - Untuk drawing yang punya `so_stamp`, output berbeda saat `hide_so=1` (SO stamp hilang).

### Fix Until Works — COMPLETED
- ✅ `page-image?stamped=1&hide_so=1` sukses untuk target `mks`.
- ✅ Default behavior tidak berubah bila `hide_so` tidak dikirim.

---

## Phase 2 — V1 App Development: Redesign Master Drawing List UI

### User Stories (V1)
1. Sebagai user, saya ingin melihat kolom Status yang ringkas agar cepat tahu dokumen sudah controlled atau belum.
2. Sebagai user, saya ingin melihat 4 tile preview per drawing (MKS, Customer, BOM, Nesting) agar tidak perlu buka modal berulang.
3. Sebagai user, saya ingin klik tile preview untuk membuka viewer universal (image-based) agar bisa scroll/zoom.
4. Sebagai Engineer/Admin, saya ingin tombol Print tersedia dari Master List agar cepat mencetak tanpa download file.
5. Sebagai QC/Store/Produksi/Doc Control, saya ingin tidak ada tombol download di viewer (preview-only) agar sesuai kebijakan dokumen.

### Implementation Steps (V1) — COMPLETED
1. ✅ **Frontend RBAC helper** (`/app/frontend/src/lib/rbac.js`)
   - Ditambahkan:
     - `isEngineeringRole(role)`
     - `canPrintDrawing(role)` — allow list: engineering + admin/super_admin.
2. ✅ **Refactor UI row** (`/app/frontend/src/pages/MasterDrawingPage.jsx`)
   - Render baris dipisah menjadi `DrawingMasterRow`.
   - Kolom baru **Status & TTD**:
     - Status badge (Issued/Draft/etc)
     - DC stamp indicator: `DC: [nama]` bila `dc_stamp.name` ada, fallback Controlled/Belum DC
     - Ringkasan TTD dari `approvals[]` sebagai chips; fallback “Belum ada TTD”.
   - **4 inline preview tiles** per baris:
     - **DWG MKS** → `PdfPreviewModal` mode drawing: `stamped=1`, `hideSo=true`
     - **Customer** → `PdfPreviewModal` mode drawing target `customer_ref`, `stamped=1`
     - **BOM** & **Nesting** → lazy-fetch attachments via `/bom/{bom_id}/attachments`, viewer generic (`page-meta` + `page-image`).
   - Caching attachments sederhana per `bom_id` untuk mengurangi request.
3. ✅ **Print button**
   - Tombol **Print** hanya muncul untuk role `canPrintDrawing(role)`.
   - `PdfPreviewModal` ditambah prop `autoPrint` untuk auto-trigger `window.print()`.
   - Footer “Printed by …” dipenuhi backend stamping.
4. ✅ **Konservasi fitur existing**
   - Workflow `DrawingApprovalBadge` tetap tersedia di kolom Aksi.

### Testing (end of Phase 2) — COMPLETED
- ✅ Screenshot memastikan:
  - Kolom Status & TTD muncul
  - 4 preview tile muncul
  - Print button muncul untuk super_admin
- ✅ Viewer:
  - Klik tile DWG MKS membuka `PdfPreviewModal` dan render image-based pages.
  - Footer “Printed by …” terlihat.
- ✅ Automated tests:
  - Iteration 9 backend **100%** pass
  - Iteration 9 frontend **95%** pass

---

## Phase 3 — Hardening & Regression Testing

### User Stories (Hardening)
1. Sebagai user, saya ingin halaman tetap cepat walau data banyak (pagination + lazy fetch attachments).
2. Sebagai user, saya ingin jika attachment tidak ada, tile menampilkan state disabled yang jelas.
3. Sebagai user, saya ingin bila preview gagal (404/422), muncul error state yang informatif di viewer.
4. Sebagai admin, saya ingin memastikan perubahan tidak merusak download/stamping existing (pdf-stamped default tetap sama).
5. Sebagai doc control, saya ingin memastikan controlled workflow (stamp-controlled) tetap jalan setelah perubahan `hide_so`.

### Implementation Steps — STATUS: MOSTLY COMPLETED
1. ✅ Caching attachments per `bom_id` untuk mengurangi fetch.
2. ✅ Tile UI menampilkan enabled/disabled state.
3. ✅ Error handling viewer ada (PdfPreviewModal error + retry).
4. ✅ Regression test `pdf-stamped` berjalan.
5. ⏳ **RBAC negative-case verification (Doc Control / QC / Store / Produksi)**
   - Catatan: perlu uji manual dengan kredensial preview-only yang valid pada environment target.
   - Secara kode: `noDownload` tersedia di viewer, namun wiring per-role perlu dipastikan konsisten di semua halaman preview.

---

## Phase 4 — Export Master Drawing List (Excel/PDF)

### User Stories (Export)
1. Sebagai Engineering/Admin, saya ingin ekspor daftar Master Drawing mengikuti filter agar bisa diarsipkan offline.
2. Sebagai user, saya ingin ekspor ke **Excel** untuk rekap dan sorting.
3. Sebagai user, saya ingin ekspor ke **PDF** untuk lampiran dokumen.

### Implementation Steps (Export) — COMPLETED
1. ✅ **Backend** (`/app/backend/routers/drawing_register.py`)
   - Endpoint baru: `GET /drawings/export?format=xlsx|pdf`
   - Output:
     - XLSX via **openpyxl** (judul, meta line, freeze panes, header styling)
     - PDF via **reportlab** (A3 landscape table, repeat header)
   - Ikut filter: `q`, `discipline`, `status`, `so_no`.
   - Limit untuk safety: max 5000 rows.
   - Logging action: `drawing_export`.
2. ✅ **Frontend**
   - `frontend/src/lib/api.js`: helper `downloadFile(path, params, filename)` (cookie-based fetch).
   - `MasterDrawingPage.jsx`: tombol **Ekspor Excel/PDF** (gated `canPrintDrawing`), ikut filter aktif.
3. ✅ **Testing**
   - Curl menghasilkan XLSX/PDF valid, format invalid → 400.
   - Workbook diverifikasi: judul, meta line, header, jumlah baris.

---

## Phase 5 — Repeat Order: Preview sebelum Submit/Tarik + Auto-detect Nomor DWG saat Upload Manual

### User Stories (Repeat Order)
1. Sebagai Engineering, saya ingin bisa **preview** dokumen (MKS/Cust/Nesting/Extra/Costing) dari daftar hasil repeat order sebelum menarik data lama.
2. Sebagai Engineering, bila drawing lama tidak ada, saya ingin **upload manual** lalu sistem **auto-baca nomor DWG dari isi PDF**.
3. Sebagai Engineering, jika auto-detect gagal atau salah, saya ingin bisa **ketik manual nomor DWG**.
4. Sebagai user, jika nomor manual ≠ isi PDF, sistem memberi **warning mismatch** agar dokumen tidak salah.

### Implementation Steps (Repeat Order) — COMPLETED
1. ✅ **Clickable preview chips di DRF Work** (`/app/frontend/src/pages/EngineeringDrfWorkPage.jsx`)
   - **Daftar Drawing**: chip MKS/Cust/Nesting-Extra menjadi button preview (jika tersedia).
   - **Hasil Pencarian Repeat Pull**: chip MKS/Cust/Nesting/Costing previewable:
     - MKS/Cust: viewer drawing target `mks`/`customer_ref`
     - Nesting/Costing: lazy-fetch `/bom/{bom_id}/attachments` lalu viewer generic.
   - Viewer: `PdfPreviewModal`.
2. ✅ **Auto-detect nomor DWG saat upload (repeat/manual)**
   - Backend (`drawing_register.py`):
     - `_extract_pdf_text` diperbaiki pakai **PyMuPDF (fitz)**.
     - OCR fallback via **pytesseract** bila PDF scanned.
     - Upload response menambahkan: `detected_no`, `current_drawing_no`.
     - Simpan ke DB: `pdf_detected_no`.
   - Endpoint baru: `POST /drawings/{id}/rename`.
   - Frontend: auto-rename + editor manual.
3. ✅ **Testing**
   - Verified UI end-to-end.
   - Data uji dibersihkan.

---

## Phase 6 — Engineering Workflow Consolidation (NEW)
Fokus: ringkas portal Engineering untuk Eng Leader, perketat keamanan dokumen QC (tanpa download/print), dan memastikan revision loop benar-benar siap produksi.

### 6A — Dashboard Engineering: Panel Konsolidasi “Antrian DRF”

#### User Stories
1. Sebagai **Eng Leader**, saya ingin melihat ringkasan antrian DRF (submitted/accepted/in_progress) dalam satu panel ringkas agar cepat mengambil keputusan.
2. Sebagai **Eng Leader**, saya ingin melihat mini-list DRF terbaru (submitted + butuh assign) agar bisa langsung klik ke inbox/work order.
3. Sebagai **Engineer**, saya ingin melihat tugas saya (assigned to me) dan statusnya tanpa harus buka beberapa menu.

#### Implementation Steps — STATUS: PLANNED
1. ⏳ **Tambah slot `children` pada `DeptPortal`** (`/app/frontend/src/components/DeptPortal.jsx`)
   - Izinkan `DeptPortal` merender blok opsional di atas grid cards (mis. panel ringkas).
2. ⏳ **Buat komponen `EngineeringQueuePanel`** (`/app/frontend/src/components/EngineeringQueuePanel.jsx`)
   - Menampilkan:
     - Stat tiles: DRF pending for engineering (`/drawing-requests/pending-count-for-engineering`), pending approval Eng Head (`/drawings/pending-my-approval`), dan my assignments (`/drawings/my-assignments`).
     - Mini list DRF terbaru (ambil dari `/drawing-requests?scope=for_engineering` lalu filter `submitted/accepted/in_progress`).
     - CTA cepat: tombol ke `/engineering/drawing-request-inbox` dan `/engineering/work-orders`.
3. ⏳ **Integrasi ke Engineering portal** (`/app/frontend/src/pages/EngineeringPortalPage.jsx`)
   - Render `EngineeringQueuePanel` sebagai anak (children) di `DeptPortal`.
4. ⏳ **Testing**
   - Screenshot portal Engineering sebelum/sesudah.
   - Verifikasi angka konsisten dengan list.

### 6B — QC Tanpa Download (View-only + TTD)

#### User Stories
1. Sebagai **QC**, saya ingin preview drawing (image-based) untuk inspeksi tetapi **tanpa tombol Download** agar file asli tidak tersebar.
2. Sebagai **QC**, saya (opsional) tidak boleh print dari sistem preview bila kebijakan dokumen melarang cetak.

#### Implementation Steps — STATUS: PARTIALLY IMPLEMENTED
1. ✅ `PdfPreviewModal` sudah memiliki prop `noDownload` (sudah ada), namun belum konsisten dipakai.
2. ⏳ **Wire `noDownload` untuk role QC** di `PendingApprovalDrawingsPage.jsx`
   - Saat membuka `PdfPreviewModal`, set `noDownload={user.role === "qc"}` (atau helper RBAC `isDrawingPreviewOnly(role)`).
3. ⏳ **Tambahkan prop `noPrint` pada `PdfPreviewModal`**
   - Sembunyikan tombol Print bila `noPrint=true`.
   - Aktifkan `noPrint` untuk QC (dan role preview-only lain bila diperlukan).
4. ⏳ **Regression check**
   - Pastikan Engineering/Admin tetap bisa Print/Download sesuai RBAC.
   - Pastikan halaman lain yang memakai viewer tidak berubah perilakunya.

### 6C — Phase 3 Revision Loop (Reject + Notes + Files) — Verification

#### Status Temuan
- ✅ Backend sudah ada:
  - `POST /drawings/{id}/reject-with-files/{stage}`
  - `GET /drawings/{id}/revisions`
  - `GET /drawings/{id}/revision-files/{file_id}/download`
  - `GET /drawings/{id}/revision-files/{file_id}/page-meta` + `page-image`
- ✅ Frontend sudah ada:
  - `RejectDrawingModal.jsx` (notes wajib + multi file)
  - `EngineeringWorkOrderPage.jsx` menampilkan `RevisionNotesPanel` (catatan + preview/download file revisi)

#### Verification Steps — STATUS: PLANNED
1. ⏳ **E2E flow**
   - Eng Head approve → QC preview (no download) → QC reject dengan notes+files → status drawing kembali `draft`.
   - Engineer membuka Work Order → panel revisi muncul → preview file revisi → perbaiki dokumen → submit ulang.
2. ⏳ **Audit trail**
   - Pastikan `approvals[]` mencatat stage `reject_qc`/`reject_sales` dst.
   - Pastikan `revisions[]` terisi lengkap (rejected_by, at, notes, file meta).
3. ⏳ **Testing output**
   - Screenshot panel revisi di Work Order.
   - Screenshot modal reject dan hasil perubahan status.

---

## Next Actions (Immediate)
1. ⏳ Implement **Phase 6A** (EngineeringQueuePanel + slot children pada DeptPortal).
2. ⏳ Implement **Phase 6B** (QC noDownload + noPrint di viewer) dan lakukan uji regresi.
3. ⏳ Jalankan verifikasi **Phase 6C** (Revision loop) via testing agent dan dokumentasikan hasil.

---

## Success Criteria
- ✅ Master Drawing List menampilkan **kolom Status & TTD** + **4 preview tile** per row tanpa crash.
- ✅ Preview **DWG MKS** menampilkan **DC-stamped** dan **tanpa SO stamp** (`hide_so=1`).
- ✅ Tombol **Print** hanya untuk **Engineering + Admin/SuperAdmin**.
- ✅ Ekspor Master Drawing List ke **Excel/PDF** berhasil dan mengikuti filter.
- ✅ Repeat Order: dokumen bisa dipreview sebelum submit/tarik; upload manual auto-detect nomor DWG dari isi PDF; tersedia koreksi manual.
- ✅ DRF New Order: upload lampiran inline (multi-file) + tombol **Simpan**/**Kirim** sesuai workflow.
- ⏳ Engineering Portal menampilkan **panel ringkas antrian DRF** (angka + mini list) untuk Eng Leader.
- ⏳ QC preview bersifat **view-only**: **tanpa Download** dan (bila diaktifkan) **tanpa Print**, namun tetap bisa TTD/Approve/Reject.
- ⏳ Revision loop: reject dengan notes+files → kembali ke engineer → perbaikan → submit ulang berjalan tanpa kehilangan audit trail.
