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

**Update objektif (terbaru, hasil sesi ini):**
- ✅ **Universal preview image-based** (PDF + Excel) tanpa buka tab baru (`PdfPreviewModal`), menghindari popup blocker/IDM.
- ✅ **Preview Sales Inquiry attachments** (PDF + Excel) di viewer yang sama.
- ✅ **Preview Form Template** (ReportLab PDF) & **Excel Template preview** di viewer yang sama.
- ✅ **Preview Excel costing sebagai halaman gambar** (akurat “sesuai hasil” via LibreOffice), **download tetap file Excel asli**.
- ✅ **Nomor SO 6 digit**: ketik `5251` → sistem menyimpan/menampilkan `005251` + migrasi data lama.
- ✅ **Legacy Import Data Lama** (upload per “box” untuk 1 drawing/SO) → otomatis masuk **Drawing Master List** sebagai **Controlled/Final** (skip TTD) dengan label “Data Lama (scan TTD manual)”.
- ✅ **RBAC BOM**:
  - Costing Price + Harga/Riwayat Pembelian hanya untuk **super_admin/admin/supervisor/finance/engineering/sales** (Purchasing dikecualikan; sesuai instruksi user).
  - DWG & Customer = **preview-only tanpa download** untuk **QC/DocControl/Store/Produksi**.

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
   - ✅ Curl tests + UI tests + testing_agent.

POC Exit: semua endpoints berfungsi, permission enforced, dan tidak ada regresi.

---

### Phase 2 — Repeat Order Auto-Pull + QC View-Only + TTD (DONE ✅)
**Keputusan user (konfirmasi):**
- Sumber pencarian repeat order: **kombinasi SO + Drawing No**.
- Yang di-auto-pull: **Drawing + BOM + Nesting + Costing** → di-copy & auto-attach, autofill di BOM, **editable bila Qty berubah**.
- Bila data lama tidak ketemu: **tampilkan form upload manual**.
- QC: hanya bisa lihat **MKS drawing + Customer drawing** (view-only), lalu **TTD**.

**Implementasi:**
- ✅ Backend: `GET /drawings/repeat-search` dan `POST /drawing-requests/{drf_id}/pull-repeat`.
- ✅ Frontend: panel Repeat Order di Work Order Engineering.
- ✅ QC view-only modal & TTD flow.

---

## Phase 3+ (User pivot) — Stamp per-halaman, Universal Preview, SO 6-digit, Legacy Import, BOM RBAC

### Phase A — Stamp per-halaman (SELESAI ✅)
Masalah: stamp hal.1 kiri, hal.2 ingin kanan, tetapi semua halaman ikut satu posisi.
Solusi: dukung `placements[]` (list {page,x,y,size}) di seluruh alur stamp.
- ✅ `utils/pdf_stamper.py`: signature, DC stamp, SO stamp render posisi berbeda per halaman.
- ✅ Backend endpoints menerima `placements[]`.
- ✅ `PdfStampCanvas` + `SignaturePlacementModal`.
- ✅ Verified end-to-end.

### Phase B — Universal image-based Preview (PDF + Excel) (SELESAI ✅)
Masalah: preview PDF buka tab baru → kena popup blocker/IDM.
Solusi: viewer baca/preview berbasis **GAMBAR** (`PdfPreviewModal`) dengan backend `page-meta`/`page-image`.

**Hasil implementasi (selesai):**
- ✅ `PdfPreviewModal` jadi viewer universal (zoom/print/download) untuk seluruh modul.
- ✅ Backend util:
  - ✅ `backend/utils/pdf_render.py` (render page-meta + page-image)
  - ✅ `backend/utils/office_render.py` (Office/Excel → PDF via LibreOffice headless + cache TTL)
- ✅ Endpoint Excel→image sudah aktif untuk:
  - ✅ BOM attachments: `/api/bom/{bom_id}/attachments/{attach_id}/page-meta|page-image`
  - ✅ Sales inquiry attachments: `/api/inquiries/{inq_id}/attachments/{file_id}/page-meta|page-image`
- ✅ Preview template image-based:
  - ✅ Form templates: `/api/form-templates/{tid}/preview-page-meta|preview-page-image`
  - ✅ Excel templates: `/api/excel-templates/{tid}/preview-page-meta|preview-page-image`
- ✅ Frontend wiring:
  - ✅ SalesPage: PDF + Excel attachments → `PdfPreviewModal`
  - ✅ MasterDrawingPage costing → `PdfPreviewModal`
  - ✅ BomAttachmentsReadOnly: full excel/dwg preview → `PdfPreviewModal`
  - ✅ FormTemplatesPage + FormTemplateEditorPage: ganti `window.open(blob)` → `PdfPreviewModal`
- ✅ Testing backend: **100% lulus (21/21)** untuk endpoint preview Excel/PDF.

**Catatan deploy Windows Server 2012 R2:**
- LibreOffice wajib terinstall (headless) atau set `SOFFICE_BIN`.

### Phase C — SO Number 6 Digit (SELESAI ✅)
Kebutuhan: semua SO numeric disimpan dalam format **6 digit** (zero-pad).
- ✅ Backend:
  - `normalize_so_no()` diubah menjadi zero-pad 6 digit.
  - Validasi confirm order di Sales diubah → angka max 6 digit, disimpan zfill(6).
  - Migrasi data lama: `backend/migrations/migrate_so_6digit.py` (sudah dijalankan pada env kerja).
- ✅ Frontend:
  - Input SO di QuotationPage: max 6 digit + padStart(6) saat blur.

### Phase D — Legacy Import Data Lama → Drawing Master List (SELESAI ✅)
Kebutuhan: upload data lama per “box” (per SO/drawing) dengan auto-detect dan verifikasi sebelum masuk sistem.
- ✅ Backend router: `routers/legacy_import.py`
  - `POST /api/legacy-import/analyze` → baca BOM Excel dan kembalikan suggested fields + items.
  - `POST /api/legacy-import/commit` → buat Drawing + BOM + attachments sebagai **Controlled/Final** (skip TTD) dan label “Data Lama (scan TTD manual)”.
  - Slot file sesuai permintaan:
    - `eng_dwg` (PDF/Word, wajib)
    - `customer_dwg` (PDF/Word/gambar, opsional)
    - `nesting` (PDF/Word/Excel, opsional)
    - `nesting_price` (PDF/Word/Excel, opsional)
    - `bom_file` (Excel, opsional)
- ✅ Frontend page: `LegacyImportPage.jsx` + route `/admin/legacy-import`
  - Add box, upload slot, auto-analyze BOM, editable verifikasi, commit.
- ✅ Menu:
  - Admin dropdown + link untuk engineering leader.

### Phase E — BOM Workflow & RBAC (IN PROGRESS → hardening + UX)
**User requirement:**
- Add/edit item hanya lewat workflow revisi (staff ajukan revisi → leader approve → revisi → approval → masuk list + alasan revisi + bisa lihat revisi sebelumnya).
- BOM umum bisa dibuka semua departemen, tapi:
  - Costing price + harga pembelian/riwayat pembelian dibatasi.
  - DWG/Customer untuk QC/DC/Store/Produksi hanya preview tanpa download.

**Status saat ini:**
- ✅ Backend alur revisi BOM sudah ada di Work Order (`request-reopen` → leader approve → draft → submit-review → approve-review + revision snapshot/history).
- ✅ Caption/link lama “BOM Preparation & Approval” di BOM Utama sudah dihapus (tidak lagi link ke `/engineering/master-list`).
- ✅ Backend RBAC:
  - BOM attachments list memfilter kategori harga (`costing`, `costing_prev`, `nesting_price`) untuk non-privileged.
  - Endpoint download guarded:
    - Non-privileged tidak bisa download/akses costing.
    - QC/DC/Store/Produksi tidak bisa download drawing/customer.
  - Endpoint `GET /bom/{bom_id}/purchases` dibatasi → hanya role costing-view.
- ✅ Frontend RBAC:
  - BOM purchases card disembunyikan untuk non-costing role.
  - PdfPreviewModal mendukung `noDownload` untuk mematikan tombol download.
  - BomAttachmentsReadOnly: untuk QC/DC/Store/Produksi, tombol download DWG/Customer tidak muncul.
- ✅ Role baru: `produksi` ditambahkan ke VALID_ROLES + dropdown Admin.

**Sisa hardening (target berikutnya):**
1. UI end-to-end verifikasi (QC/DC/Store/Produksi vs Sales/Engineering/Admin):
   - Costing/price hidden vs visible
   - DWG/Customer preview-only tanpa download
   - Purchase history hidden vs visible
2. Pastikan seluruh halaman yang menampilkan attachments BOM membaca flag `can_view_costing` / `drawing_preview_only` dari backend bila perlu.
3. Final check: tidak ada lagi link/menu “BOM Preparation & Approval” yang membingungkan.

---

## 3) Next Actions (Updated)
**P0 (langsung):**
1) ✅ Universal preview Excel/PDF + wiring viewer (DONE, tested).
2) ✅ SO 6 digit + migrasi data lama (DONE).
3) ✅ Legacy Import page + role produksi (DONE).
4) ⏳ **Hardening RBAC BOM** (UI test + edge cases):
   - QC/DC/Store/Produksi: DWG/Customer preview-only (tanpa download)
   - Non-privileged: tidak bisa lihat costing price + tidak bisa lihat purchase history
   - Privileged: semua tetap berfungsi (download tetap jalan, watermark rule tetap berlaku).

**P1:**
- Refactor file frontend besar (mis. `MasterDrawingPage.jsx` 2300+ lines).

**Testing:**
- Backend: sudah lulus untuk preview endpoints; tambah regression untuk RBAC (403/filtered list).
- Frontend: validasi visual + role-based flows (QC/DC/Store/Produksi vs Engineering/Sales/Admin).

---

## 4) Success Criteria (Updated)
- ✅ Tidak ada regresi: backend startup sehat, frontend compile tanpa error.
- ✅ Semua preview dokumen tidak lagi `window.open`/tab baru; gunakan `PdfPreviewModal`.
- ✅ Excel (costing/template/inquiry) dapat dipreview sebagai **halaman gambar**; download tetap file asli.
- ✅ SO numeric tersimpan konsisten 6 digit (`005251`).
- ✅ Legacy import mampu memasukkan data lama sebagai Controlled/Final dan bisa diverifikasi sebelum commit.
- ✅ RBAC BOM:
  - Costing price + purchase history hanya terlihat untuk role yang diizinkan.
  - QC/DC/Store/Produksi tidak bisa download DWG/Customer (preview-only).
- ✅ Siap ditarik ke Windows Server 2012 R2 lokal (dengan requirement LibreOffice untuk konversi Office→PDF).