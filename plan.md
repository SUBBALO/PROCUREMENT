# Development Plan — ERP/Procurement (FARM) — Master Drawing List + Repeat Order Enhancements

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
    - Footer **Printed by [nama]** ter-overlay dari backend stamping.
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
   - Secara kode: `isDrawingPreviewOnly(role)` → viewer `noDownload=true`.

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
     - `_extract_pdf_text` diperbaiki pakai **PyMuPDF (fitz)** (karena `pypdf` tidak terpasang).
     - `_detect_mks_dno` regex format: `DWG.YY.MM.NN_CUST.INIT.TYPE.NN`.
     - Upload response menambahkan: `detected_no`, `current_drawing_no`.
     - Simpan ke DB: `pdf_detected_no`.
   - Endpoint baru: `POST /drawings/{id}/rename`:
     - Cek unik (`drawing_no+revision`)
     - Sync BOM `project_dwg` bila sama dengan nomor lama
     - Re-verify match terhadap isi PDF (update `pdf_match_status`, candidates, note) agar warning tidak stale.
   - Frontend (`MasterDrawingPage.jsx` → `DrawingAttachmentsPanel.uploadDrawingPdf`):
     - Setelah upload: jika `detected_no` beda → **auto rename** tanpa konfirmasi.
     - Jika rename gagal (mis. duplicate): tampilkan error + arahkan pakai **Ubah manual**.
     - UI editor manual No. DWG: tombol **Ubah manual** + input + simpan (panggil `/rename`).
3. ✅ **Testing**
   - Verified UI:
     - Upload PDF valid → nomor berubah otomatis → mismatch warning tidak muncul.
     - Manual edit → berhasil → mismatch warning muncul bila nomor ≠ isi PDF (expected).
   - Data uji dibersihkan.

---

## Next Actions (Immediate)
1. ✅ Tidak ada action blocking untuk fitur yang sudah selesai.
2. ⏳ (Opsional hardening) Jalankan uji manual untuk role preview-only (QC/Store/Produksi/Doc Control):
   - Pastikan tombol **Download** hilang di viewer.
   - Pastikan tombol **Print** tidak tampil.
3. ⏳ (Out of scope sesi ini, tapi disebut user) Sales portal — manual input SO lama + customer untuk repeat apabila data SO lama tidak ditemukan.
4. (Opsional) Tingkatkan auto-detect untuk PDF scan:
   - OCR fallback (jika diperlukan) untuk kasus PDF gambar.

---

## Success Criteria
- ✅ Master Drawing List menampilkan **kolom Status & TTD** + **4 preview tile** per row tanpa crash.
- ✅ Preview **DWG MKS** menampilkan **DC-stamped** dan **tanpa SO stamp** (`hide_so=1`).
- ✅ Tombol **Print** hanya untuk **Engineering + Admin/SuperAdmin**.
- ✅ Ekspor Master Drawing List ke **Excel/PDF** berhasil dan mengikuti filter.
- ✅ Repeat Order: dokumen bisa dipreview sebelum submit/tarik; upload manual auto-detect nomor DWG dari isi PDF; tersedia koreksi manual.
- ✅ Semua endpoint existing tetap kompatibel; regression test lulus (approval/stamping/download).