# Development Plan — ERP/Procurement (FARM) — Master Drawing List Redesign

## Objectives
- **Selesai verifikasi Legacy Import multi-DWG** (sudah selesai: Iteration 8, backend 9/9 & frontend 10/10).
- **Redesign MKS-F-ENG-005 Drawing Master List** agar:
  - Ada kolom **Status** (siapa yang sudah TTD + status DC stamp/controlled).
  - Ada **4 preview inline per baris**: DWG MKS, DWG Customer, BOM, Nesting.
  - Preview DWG MKS & Customer menampilkan versi **DC-stamped** tetapi **tanpa SO stamp**.
  - Tombol **Print** hanya untuk **Engineering + Admin/SuperAdmin**, dengan footer "Printed by [nama]" (sudah didukung backend via pdf-stamped/page-image stamping).

---

## Phase 1 — Core POC (Isolation): “Preview DC-stamped tanpa SO stamp”
**Core paling riskan:** kemampuan backend+viewer menampilkan **stamped=1** sambil **hide SO stamp** untuk Master Drawing List.

### User Stories (POC)
1. Sebagai Engineer, saya ingin preview DWG MKS versi DC-stamped tanpa SO stamp agar Master List tetap “bersih”.
2. Sebagai Doc Control, saya ingin tetap bisa melihat stamp DC pada preview untuk validasi controlled document.
3. Sebagai Admin, saya ingin memastikan hide_so tidak mempengaruhi endpoint pdf-stamped normal yang dipakai download.
4. Sebagai QC/Produksi, saya ingin preview tetap mengikuti watermark/preview-only rule (tidak berubah).
5. Sebagai Engineer, saya ingin tombol print menghasilkan output dengan footer “Printed by …” (tanpa harus download).

### Implementation Steps (POC)
1. **Backend** (`/app/backend/routers/drawing_register.py`)
   - Tambah query param `hide_so: bool = False` di endpoint:
     - `GET /drawings/{id}/page-image` dan (opsional) `GET /drawings/{id}/pdf-stamped` bila dibutuhkan.
   - Ubah `_build_stamped_for_target(...)` agar menerima `hide_so` dan saat `target=="mks"`:
     - memanggil `_apply_pdf_stamps(..., so_stamp=None)` bila `hide_so==True`.
2. **Frontend viewer** (`/app/frontend/src/components/PdfPreviewModal.jsx`)
   - Tambah prop `hideSo`.
   - Saat membangun URL `page-image`, kirim `hide_so=1` bila `hideSo` aktif.
3. **Quick verification**
   - Tambah minimal test script/notes lokal (curl) untuk memastikan `hide_so=1` tidak error dan output tetap PNG.

### Fix Until Works
- Iterasi sampai:
  - `page-image?stamped=1&hide_so=1` sukses untuk drawing target=mks.
  - Default behavior tidak berubah jika `hide_so` tidak dikirim.

---

## Phase 2 — V1 App Development: Redesign Master Drawing List UI

### User Stories (V1)
1. Sebagai user, saya ingin melihat kolom Status yang ringkas (Approval badge + DC stamp by/at) agar cepat tahu dokumen sudah controlled atau belum.
2. Sebagai user, saya ingin melihat 4 tile preview per drawing (MKS, Customer, BOM, Nesting) agar tidak perlu buka modal berulang.
3. Sebagai user, saya ingin klik tile preview untuk membuka viewer universal (image-based) agar bisa scroll/zoom.
4. Sebagai Engineer/Admin, saya ingin tombol Print tersedia dari Master List agar cepat mencetak tanpa download file.
5. Sebagai QC/Store/Produksi/Doc Control, saya ingin tidak ada tombol download di viewer (preview-only) agar sesuai kebijakan dokumen.

### Implementation Steps (V1)
1. **Frontend RBAC helper** (`/app/frontend/src/lib/rbac.js`)
   - Tambah helper `isEngineeringRole(role)` dan helper `canPrint(role)` (Engineering + Admin/SuperAdmin).
2. **Refactor UI row** (`/app/frontend/src/pages/MasterDrawingPage.jsx`)
   - Ekstrak render row tabel menjadi komponen `DrawingMasterRow`.
   - Tambahkan kolom baru **Status**:
     - Tampilkan ringkas: approval_status badge + “DC: [nama]” bila `dc_stamp.name` ada + timestamp singkat.
     - Tampilkan “TTD: prepared/checked/approved” bila data approvals tersedia.
   - Tambah 4 inline preview tile per row:
     - **MKS**: open `PdfPreviewModal` (drawing mode) dengan `stamped=1` dan `hideSo=true`.
     - **Customer**: open `PdfPreviewModal` target `customer_ref` (stamped=1, hideSo irrelevant).
     - **BOM** & **Nesting**: lazy-fetch attachments via `/bom/{bom_id}/attachments`; open `PdfPreviewModal` generic mode menggunakan `metaUrl` + `pageUrlBuilder`.
3. **Print button**
   - Tampilkan hanya jika `canPrint(user.role)`.
   - Print memanggil fungsi `PdfPreviewModal` print (tidak perlu download); footer “Printed by …” otomatis dari backend stamping.
4. **Konservasi fitur existing**
   - Jangan ubah alur `DrawingApprovalBadge` dan endpoint stamp-controlled.
   - Pastikan klik row tetap bisa preview (atau pindah jadi klik tile MKS saja—sesuaikan agar UX tidak bentrok).

### Testing (end of Phase 2)
- Jalankan testing agent:
  - Screenshot Master Drawing List: memastikan kolom Status + 4 tile muncul.
  - Klik tile preview MKS: pastikan viewer terbuka & request mengandung `stamped=1` + `hide_so=1`.
  - Verifikasi tombol Print hanya muncul untuk role yang benar.

---

## Phase 3 — Hardening & Regression Testing

### User Stories (Hardening)
1. Sebagai user, saya ingin halaman tetap cepat walau data banyak (pagination + lazy fetch attachments).
2. Sebagai user, saya ingin jika attachment tidak ada, tile menampilkan state “-”/disabled yang jelas.
3. Sebagai user, saya ingin bila preview gagal (404/422), muncul error state yang informatif di viewer.
4. Sebagai admin, saya ingin memastikan perubahan tidak merusak download/stamping existing (pdf-stamped default tetap sama).
5. Sebagai doc control, saya ingin memastikan controlled workflow (stamp-controlled) tetap jalan setelah perubahan hide_so.

### Implementation Steps
1. Tambah caching ringan attachments per `bom_id` di state list (hindari fetch berulang saat scroll/paging).
2. Rapikan styling tile supaya ringkas (thumbnail-like) dan tidak membuat row terlalu tinggi.
3. Regression test:
   - Legacy Import tetap OK (smoke test).
   - Drawing approval badge workflow tetap OK.
   - Watermark preview-only role tetap OK.

---

## Next Actions (Immediate)
1. Implement **POC hide_so** (backend + PdfPreviewModal) dan uji cepat via browser/curl.
2. Implement **RBAC canPrint + hideSo prop wiring**.
3. Implement **DrawingMasterRow + 4 tile preview + Status column**.
4. Jalankan **testing agent** + screenshot untuk validasi UX.

---

## Success Criteria
- Master Drawing List menampilkan **kolom Status** + **4 preview tile** per row tanpa crash/performance drop signifikan.
- Preview **MKS** menampilkan **DC-stamped** dan **tanpa SO stamp** (hide_so) sementara viewer lain tidak berubah.
- Tombol **Print** hanya muncul untuk **Engineering + Admin/SuperAdmin**.
- Semua endpoint existing tetap kompatibel; regression test lulus (khususnya approval/stamping/download).