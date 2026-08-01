# Engineering Workflow Redesign Plan (MKS ERP)

## 1) Objectives
- ✅ **Phase 1 (New Order) delivered**: 1 DRF dapat berisi **multiple drawings** tetapi **hanya 1 shared BOM**; hanya engineer yang ditunjuk yang bisa mengerjakan.
- ✅ **Riski (Eng Leader) hanya Accept + Assign** engineer; tidak generate/upload. Jika Riski assign dirinya sendiri → langsung masuk Work Group untuk mengerjakan.
- ✅ Engineer dapat **generate nomor DWG lebih dari 1** dalam 1 DRF dan semuanya **share 1 BOM**.
- ✅ Tambah field **Customer DWG No (opsional)** untuk setiap DWG MKS baru, tampil di Master List dan ikut pencarian.
- ✅ Tambah UX verifikasi penomoran: engineer dapat melihat **preview next-number** dan **recent DWG list** untuk memastikan nomor tidak loncat.
- ✅ **Master List Drawing view-only** (tanpa edit/upload) sebagai katalog pencarian; pencarian via **SO** menampilkan DWG MKS + DWG customer terkait.
- ✅ Implement modul **ECR & ECN**:
  - **ECR** = perubahan berasal dari customer
  - **ECN** = perubahan internal MKS oleh engineering
  - Draft → submit → review approve/reject, nomor **ECR-YYMM-### / ECN-YYMM-###**.
- ✅ Portal cleanup: kartu **BOM Preparation & Approval** dihapus; 3 kartu Engineering digabung menjadi **1 kartu role-aware**.
- ✅ Tetap menjaga modul lain berjalan; tidak mengubah env URL.
- ✅ (Tambahan) Document Control stamping multi-page sudah diperbaiki (DC/SO/TTD di semua halaman + picker scrollable).

**Update objektif (terbaru, prioritas user):**
- ⏳ **Universal preview image-based** untuk semua dokumen **tanpa buka tab baru** (menghindari popup blocker/IDM auto-download).
- ⏳ **Preview attachments Sales Inquiry** (PDF + Excel costing) di viewer yang sama (`PdfPreviewModal`).
- ⏳ **Preview Form Template** (ReportLab PDF template + Excel Template PDF) di viewer yang sama (`PdfPreviewModal`).
- ⏳ **Preview Excel costing sebagai halaman gambar** (akurat “sesuai hasil” via LibreOffice), **download tetap file Excel asli**.

---

## 2) Implementation Steps

### Phase 1 — Core Workflow POC (isolation, must pass before full UI)
**Core = “DRF(New Order) → Leader accept+assign → engineer generate N drawings → 1 shared BOM → upload per drawing → TTD per new MKS drawing → submit ke Eng Leader”.**

POC Steps (backend-first, minimal):
1. **Model additions (non-breaking):**
   - ✅ `from_drf_id` pada drawing untuk grouping.
   - ✅ DRF: `assigned_engineer_id/name`, `assigned_by/at`, `shared_bom_id`, `linked_drawing_ids`.
   - ✅ Drawing: `customer_drawing_no` (opsional).
2. **New endpoints (POC scope):**
   - ✅ `GET /drawing-requests/engineering-users` (Eng Leader/Admin): list engineer untuk dropdown.
   - ✅ `POST /drawing-requests/{id}/accept-assign` (Eng Leader/Admin): accept + assign.
   - ✅ `POST /drawing-requests/{id}/generate-drawings` (assignee): create N drawings + shared BOM.
   - ✅ `GET /drawings?from_drf_id=...` filter.
3. **Uploads (reuse existing):**
   - ✅ Per-drawing: `file_id` = MKS drawing; `customer_ref_file_id` = customer drawing; `extras[]` = multi attachment (nesting, costing, dll) dengan preview/replace/delete via Work Order yang sudah ada.
4. **TTD requirement (existing flow):**
   - ✅ TTD per drawing dilakukan via Work Order (SignaturePlacementModal) sebelum submit ke Eng Leader.
5. **POC tests:**
   - ✅ Curl tests + UI tests + testing_agent (backend 94.4% success; UI 0 console errors untuk role leader & staff).

POC Exit: semua endpoints berfungsi, permission enforced, dan tidak ada regresi.

---

### Phase 2 — Repeat Order Auto-Pull + QC View-Only + TTD (DONE ✅)
**Keputusan user (konfirmasi):**
- Sumber pencarian repeat order: **kombinasi SO + Drawing No**.
- Yang di-auto-pull: **Drawing + BOM + Nesting + Costing** → di-copy & auto-attach, autofill di BOM, **editable bila Qty berubah**.
- Bila data lama tidak ketemu: **tampilkan form upload manual** (pakai flow generate/upload yang sudah ada).
- QC: hanya bisa lihat **MKS drawing + Customer drawing** (view-only), lalu **TTD**.

**Implementasi:**
- ✅ Backend: `GET /drawings/repeat-search` dan `POST /drawing-requests/{drf_id}/pull-repeat` (clone drawing + shared BOM + nesting + costing + costing_prev).
- ✅ Frontend: panel Repeat Order di Work Order Engineering.
- ✅ QC view-only modal & TTD flow sudah berfungsi.

---

## Phase 3+ (User pivot) — Stamp per-halaman & Universal PDF/Excel Preview

### Phase A — Stamp per-halaman (SELESAI ✅)
Masalah: stamp hal.1 kiri, hal.2 ingin kanan, tetapi semua halaman ikut satu posisi.
Solusi: dukung `placements[]` (list {page,x,y,size}) di seluruh alur stamp.
- ✅ `utils/pdf_stamper.py`: signature, DC stamp, SO stamp render posisi berbeda per halaman (page -1 = semua halaman). Backward compatible dgn x/y/page lama.
- ✅ Backend endpoints: `ApprovalActionIn`, `DCStampIn`, `SOStampIn` terima `placements[]` + helper `_norm_placements`/`_apply_placement_to_stamp`.
- ✅ `PdfStampCanvas`: render marker per halaman dari `placements`.
- ✅ `SignaturePlacementModal`: klik tiap halaman → posisi sendiri; opsi "Posisi sama di semua halaman"; daftar halaman + hapus.
- ✅ `DocumentDistributionRecordPage` (DC stamp) & `SOStampPage` (SO stamp): per-halaman placements + toggle sama-semua.
- ✅ Verified end-to-end via API: hal.1 x≈70 (kiri), hal.2 x≈487 (kanan).

### Phase B — Universal image-based Preview (PDF + Excel) (IN PROGRESS)
Masalah: preview PDF buka tab baru → kena blok popup / dicegat IDM (auto-download).
Solusi: viewer baca/preview berbasis **GAMBAR** (`PdfPreviewModal`) dengan backend `page-meta`/`page-image`.

**Status saat ini (terbaru):**
- ✅ Universal viewer `PdfPreviewModal` sudah ada & dipakai lintas modul.
- ✅ Sales Inquiry attachment PDF sudah punya endpoint `page-meta`/`page-image` (di `sales.py`) dan frontend sudah routing PDF ke `PdfPreviewModal`.
- ✅ LibreOffice `soffice` sudah terinstall di container untuk konversi Excel→PDF (akurat “sesuai hasil”).
- ⏳ Excel costing (xlsx/xls/xlsm) belum punya `page-meta`/`page-image` untuk viewer (sebagian masih HTML/iframe preview).
- ⏳ Form Template preview (ReportLab PDF) & Excel Template preview masih `window.open(blob)`.

**Keputusan user (konfirmasi terbaru):**
- Preview Excel harus **sesuai hasil** (akurat), tapi **download tetap format Excel asli**.
- Deployment target: Windows Server 2012 R2 lokal; user akan tarik update dari GitHub. (Catatan: Windows host perlu LibreOffice terinstall agar konversi Excel berjalan, konsisten dengan modul `excel_templates`.)

**Implementasi yang akan dikerjakan (berurutan sesuai prioritas user):**

#### B1) Wiring Preview Sales Inquiry + Form Templates ke `PdfPreviewModal`
1) **Sales Inquiry**
- Backend:
  - ⏳ Extend `GET /inquiries/{inq_id}/attachments/{file_id}/page-meta` & `page-image` agar mendukung Excel (`.xlsx/.xls/.xlsm`) selain PDF.
  - Output harus kompatibel dengan `PdfPreviewModal` (`{pages, sizes}` + `image/png`).
- Frontend:
  - ⏳ `SalesPage.jsx`:
    - Buat `.xlsx/.xls` menjadi previewable.
    - Route Excel ke `PdfPreviewModal` (bukan iframe tab baru).
    - Download tetap ke endpoint download (Content-Disposition attachment) supaya format asli.

2) **Form Templates (ReportLab JSON template)**
- Backend:
  - ⏳ Tambah endpoint image-based untuk preview template:
    - `POST /form-templates/{tid}/preview-page-meta`
    - `GET /form-templates/{tid}/preview-page-image?page=...`
    - Sumber PDF dari hasil render preview yang sudah ada (`/preview`) → render ke gambar via `utils/pdf_render.py`.
- Frontend:
  - ⏳ `FormTemplatesPage.jsx` & `FormTemplateEditorPage.jsx`: ganti `window.open(blob)` dengan membuka `PdfPreviewModal` menggunakan endpoint `preview-page-meta` / `preview-page-image`.

3) **Excel Templates (admin upload xlsx template → substitute → PDF)**
- Backend:
  - ⏳ Tambah endpoint image-based untuk preview hasil PDF dari excel template:
    - `POST /excel-templates/{tid}/preview-page-meta`
    - `GET /excel-templates/{tid}/preview-page-image?page=...`
- Frontend:
  - ⏳ `FormTemplatesPage.jsx`: tombol preview excel template → buka `PdfPreviewModal`.

#### B2) Preview Excel Costing sebagai halaman gambar (universal)
Target: Excel costing di:
- BOM attachments (`/bom/{bom_id}/attachments/{attach_id}` kategori `costing`)
- Inquiry attachments (Sales)
- Read-only BOM viewer (`BomAttachmentsReadOnly.jsx`)

Backend:
1) **Shared conversion util**
- ⏳ Buat `backend/utils/office_render.py`:
  - `office_to_pdf(raw, ext)` → LibreOffice headless convert.
  - Cache hasil PDF berdasarkan sha256(raw) + ext (TTL) untuk hemat waktu.
  - Reuse logika pencarian soffice (`_find_soffice`) dari `excel_templates.py` (refactor agar tidak duplikasi).

2) **BOM attachments**
- ⏳ Update `bom_attachments.py`:
  - `GET /bom/{bom_id}/attachments/{attach_id}/page-meta` mendukung `.pdf` dan `.xlsx/.xls/.xlsm`.
  - `GET /bom/{bom_id}/attachments/{attach_id}/page-image` mendukung Excel (convert→PDF→render PNG).
  - Pastikan download tetap endpoint `/download` (asli).

3) **Sales inquiry attachments**
- ⏳ Update `sales.py`:
  - `page-meta` & `page-image` mendukung Excel.

4) **Kompatibilitas Windows Server 2012 R2**
- ⏳ Dokumentasikan requirement: instal LibreOffice (headless) dan/atau set `SOFFICE_BIN` bila path tidak standar.

Frontend:
1) **MasterDrawingPage.jsx (costingList)**
- ⏳ Tambah `viewer` pada costingList sehingga Excel costing bisa dibuka di `PdfPreviewModal`.
- ⏳ Update logic pemilihan modal: jika file Excel punya `viewer.metaUrl`/`pageBase`, tetap buka `PdfPreviewModal` walau bukan PDF.

2) **BomAttachmentsReadOnly.jsx**
- ⏳ Tombol "Lihat Full Excel" dan preview costing diarahkan ke `PdfPreviewModal` image-based (bukan iframe HTML).

3) **(Opsional / fallback)**
- HTML preview (openpyxl→HTML) tetap boleh disimpan sebagai fallback jika LibreOffice tidak tersedia, tapi prioritas utama adalah image-based agar konsisten.

---

### Phase 3 — Revision loop + QC/Sales/Document Control wiring + UX simplification (DONE ✅)
- ✅ Revision loop Eng Leader ↔ engineer staff (reject dengan notes + multi-file upload + resubmit).
- ✅ QC view-only + TTD tanpa tombol download.
- ✅ Perbaikan wiring stamping & universal viewer telah diterapkan lintas modul utama.

Catatan role & watermark:
- ✅ Watermark "UNCONTROLLED" untuk user biasa; `doc_control` (Salma) dan `super_admin` tidak kena watermark namun tetap ada footer "printed by".

---

## 3) Next Actions (Updated)
**P0 (langsung dikerjakan, sesuai prioritas user):**
1) ✅ Verifikasi Sales Inquiry PDF preview (sudah diwire) via test endpoint & UI.
2) ⏳ Integrasi preview **Form Templates** (ReportLab) ke `PdfPreviewModal` (hapus `window.open(blob)`).
3) ⏳ Integrasi preview **Excel Templates** ke `PdfPreviewModal`.
4) ⏳ Implementasi preview **Excel costing** sebagai image pages:
   - BOM attachments: `page-meta/page-image` dukung Excel.
   - Inquiry attachments: `page-meta/page-image` dukung Excel.
   - Frontend: SalesPage + MasterDrawingPage + BomAttachmentsReadOnly routing ke viewer.

**P1:**
- Refactor/rapikan file frontend besar (mis. `MasterDrawingPage.jsx` 2300+ lines) menjadi komponen.

**Testing:**
- Backend: curl/python untuk endpoint `page-meta/page-image` (PDF & Excel) + verifikasi caching dan error message.
- Frontend: validasi UI (screenshot/visual) untuk preview multi-page, zoom, print/download.

---

## 4) Success Criteria (Updated)
- ✅ Tidak ada regresi: backend startup sehat, frontend compile tanpa error.
- ✅ Semua preview PDF tidak lagi `window.open`/tab baru, melainkan via `PdfPreviewModal`.
- ✅ Excel costing dapat dipreview sebagai **halaman gambar** (multi-page) di viewer yang sama.
- ✅ Tombol Download tetap mengunduh file **asli** (Excel tetap `.xlsx`).
- ✅ Dapat berjalan di Windows Server 2012 R2 lokal (dengan requirement LibreOffice untuk konversi Excel→PDF).