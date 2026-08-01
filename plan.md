# plan.md — Restrukturisasi Upload 1 SO (DRF Work + BOM Attachments)

## 1) Objectives
- Menjaga **upload per-Drawing** tetap: **MKS PDF + Customer Reference PDF** (+ file tambahan drawing jika ada).
- Menambah **auto-baca “No. Drawing Customer”** dari PDF Customer Reference (native text → akurat; OCR → fallback). Jika gagal/ambigu → **popup input manual** dan hasilnya **autofill** ke `customer_drawing_no`.
- Menambahkan **panel level SO/DRF** di `EngineeringDrfWorkPage` (di bawah daftar drawing): tabel upload bersama untuk **Nesting**, **AutoCAD/DWG**, **Costing/Price**; masing-masing bisa multi-file; storage tetap di **BOM attachments** (1 SO = 1 BOM).
- Memperluas backend BOM attachments: tambah kategori **`cad`** untuk file DWG/DXF/ZIP (native CAD), dan memastikan **costing** menerima **Excel + PDF**.
- Slot lama per-drawing (nesting/costing/cad) **tidak dihapus** (tetap ada), tapi panel SO baru jadi “single place” untuk upload bersama SO.

## 2) Implementation Steps

### Phase 1 — Core POC (isolated, must pass)
Fokus: membuktikan 2 core paling riskan berjalan end-to-end tanpa merusak flow lama.

**POC User Stories (core)**
1. Sebagai engineer, saya bisa upload **DWG/DXF/ZIP** ke BOM sebagai kategori **CAD** dan melihatnya muncul di daftar attachment BOM.
2. Sebagai engineer, saya bisa upload **Costing** dalam format **.xlsx** dan **.pdf** ke BOM tanpa ditolak validasi ekstensi.
3. Sebagai engineer, setelah upload **Customer Ref PDF**, sistem mengembalikan **suggestion nomor customer** (native/OCR) bila ditemukan.
4. Sebagai engineer, jika suggestion tidak ada/meragukan, saya mendapat popup untuk isi manual dan nilainya tersimpan ke drawing.
5. Sebagai role tanpa akses costing, saya tidak melihat file costing/price di list attachments (RBAC existing tetap jalan).

**Backend POC (minimal changes + test script)**
- `backend/routers/bom_attachments.py`
  - Tambah `cad` ke `VALID_CATEGORIES` dan `CATEGORY_LABELS`.
  - Tambah `CATEGORY_ALLOWED_EXT["cad"]` (mis: `.dwg`, `.dxf`, `.zip`, `.rar`, `.7z` — konfirmasi internal bila perlu).
  - Pastikan `costing` sudah mengizinkan `.pdf` (sudah terlihat ada). Tambahkan jika ada mismatch.
- `backend/routers/drawing_register.py`
  - Di endpoint `POST /drawings/{id}/upload-customer-ref`:
    - Extract text dari PDF customer ref (native + OCR fallback) pakai util yang sudah ada.
    - Implement deteksi nomor customer (regex/heuristik) → hasilkan `customer_dwg_detected` + `customer_dwg_source` + (opsional) `customer_dwg_candidates`.
    - Return payload suggestion ke frontend (jangan auto-commit bila source OCR lemah).
- Tambah **python script** `backend/scripts/poc_so_uploads.py`:
  - Login test token (reuse helper test yang ada), buat/ambil BOM id, upload `cad` + `costing pdf/xlsx`, upload customer_ref dan print suggestion.
  - Exit non-zero jika kategori ditolak/response tidak sesuai.

**POC Validation**
- Jalankan script POC sampai:
  - Upload cad berhasil.
  - Costing pdf/xlsx berhasil.
  - Upload-customer-ref mengembalikan suggestion minimal field yang disepakati.

### Phase 2 — V1 App Development (build around proven core)

**V1 User Stories**
1. Sebagai engineer, saya melihat panel “Dokumen SO” di DRF Work (di bawah list drawing) untuk upload Nesting/CAD/Costing bersama.
2. Sebagai engineer, saya bisa upload lebih dari 1 file per kategori (Nesting/CAD/Costing) dan melihat list + preview.
3. Sebagai engineer, saat upload Customer Ref PDF di drawing, sistem menawarkan auto-fill `customer_drawing_no` dan saya bisa konfirmasi/ubah.
4. Sebagai engineer, saya bisa isi manual nomor customer via popup ketika tidak terbaca.
5. Sebagai QC/role view-only, saya tetap bisa preview dokumen tapi tidak bisa download (mengikuti aturan viewer existing).

**Frontend (EngineeringDrfWorkPage.jsx)**
- Tambah komponen baru `SoDocsPanel` (file baru di `frontend/src/components/SoDocsPanel.jsx` atau inline dulu untuk MVP):
  - Input: `{ bomId, bomNo, canEdit }`.
  - Menampilkan tabel/tiles 3 kategori:
    - `nesting` (PDF + dokumen lain sesuai backend allowed)
    - `cad` (DWG/DXF/ZIP/…)
    - `costing` (XLS/XLSX/PDF)
  - Fitur:
    - List attachments per kategori via `GET /bom/{bomId}/attachments`.
    - Upload multi-file per kategori via `POST /bom/{bomId}/attachments` (loop FormData).
    - Preview pakai `PdfPreviewModal` mode generik untuk PDF/Excel (existing page-image flow).
    - Untuk CAD: tidak bisa “page-image”; tampilkan nama file + tombol download (kecuali role noDownload). (V1: preview optional “N/A”).
- Render `SoDocsPanel` **di bawah daftar drawings** pada `EngineeringDrfWorkPage.jsx`.
- Tombol “Isi BOM” tetap tersedia (boleh di panel SO baru juga sebagai shortcut).

**Frontend (DrawingAttachmentsPanel di MasterDrawingPage.jsx)**
- Update `uploadCustomerRef`:
  - Setelah `POST /drawings/{id}/upload-customer-ref`, baca response suggestion.
  - Jika suggestion kuat (source native) → tampilkan dialog konfirmasi “Pakai nomor ini?” lalu PATCH basic-info.
  - Jika tidak ada/ocr/lemah → tampilkan popup input manual; saat submit → PATCH basic-info.
  - Autocomplete: prefill input popup dengan kandidat terbaik bila ada.

**Backend (hardening + UX)**
- `bom_attachments.py`:
  - Pastikan list_attachments mengembalikan `cad` juga.
  - Pastikan RBAC costing tetap (sudah ada guard categories).
- `drawing_register.py`:
  - Tambah util deteksi nomor customer yang tidak bentrok dengan deteksi MKS.
  - Tambahkan flag/field response agar frontend bisa menentukan “kuat/lemah”.

**Phase 2 Testing (end-to-end)**
- esbuild compile check.
- Testing agent:
  - Login engstaff → buka DRF Work → upload nesting/cad/costing di panel SO → file muncul.
  - Upload customer ref → popup tampil → customer_drawing_no terisi.
  - Role non-costing: costing tidak terlihat.

### Phase 3 — Production hardening + refinements

**Phase 3 User Stories**
1. Sebagai engineer, saya bisa hapus attachment per kategori dari panel SO dengan konfirmasi.
2. Sebagai engineer, saya bisa melihat label/ikon yang jelas untuk tiap kategori dan jumlah file.
3. Sebagai engineer, saya bisa melihat error yang informatif jika ekstensi tidak diizinkan.
4. Sebagai admin, saya bisa audit log upload/hapus attachment kategori cad/costing/nesting.
5. Sebagai user, saya tidak mengalami duplikasi fetch berlebihan saat berpindah tab/refresh.

- Tambah delete untuk attachments (reuse endpoint DELETE `/bom/{bom_id}/attachments/{id}`) dari panel SO.
- Rapikan caching/refreshKey agar DRF Work tidak spam request.
- Tambah unit-ish tests ringan untuk deteksi customer dwg no (fixture PDF kecil bila tersedia).
- Satu ronde testing agent lagi.

## 3) Next Actions
1. Implement backend `cad` category di `bom_attachments.py` + jalankan POC upload.
2. Implement suggestion deteksi customer drawing no di `upload-customer-ref` (return fields) + POC.
3. Buat `SoDocsPanel` di DRF Work dan wiring ke BOM attachments.
4. Implement popup konfirmasi/manual untuk customer_drawing_no di upload customer ref.
5. Run testing agent + fix sampai green.

## 4) Success Criteria
- Panel “Dokumen SO” muncul di DRF Work dan bisa upload multi-file untuk Nesting/CAD/Costing ke BOM.
- Backend menerima kategori `cad` dan costing menerima Excel+PDF.
- Upload Customer Ref menghasilkan autofill `customer_drawing_no` (native/OCR) atau popup manual jika gagal.
- Slot per-drawing lama tetap berfungsi (tidak ada regression).
- RBAC costing tetap aman (role tanpa izin tidak melihat/akses costing).
