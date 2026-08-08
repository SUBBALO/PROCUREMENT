# Rencana Perbaikan Work Order (Work Group + Work Order) — BOM di Level SO (Support Multi‑Part) + TTD Prepared + Partial Submit

## 1) Objectives
- Pusatkan konsep **BOM di level SO/Work Group**: engineer bekerja per-SO pada halaman **Work Group** (`/engineering/drf/:drfId`) dengan 2 tab: **Drawing & Upload** dan **BOM**.
- **Tab BOM** di Work Group menampilkan **grid BOM editable (embedded)** + **tombol Simpan saja** (tanpa Submit BOM).
- Dukung realita operasional: **1 SO dapat memiliki beberapa BOM (Part)** → **sub-tab BOM Part 1/Part 2 + Tambah BOM** dengan penomoran **`-P{n}`**.
- Perjelas alur TTD:
  - **TTD Prepared By** dilakukan **per-drawing** dan hanya **Simpan** (status drawing tetap `draft`).
  - **Submit ke Eng Leader** dipindah ke **Work Group (bawah)** dengan **checkbox** (bisa **partial submit**) dan **BOM ikut tersubmit**.
- Buat UI **minimalis & compact** untuk **dua halaman** (Work Group dan Work Order per-drawing): header tipis, tabel rapat, padding kecil, kontrol jelas.
- Pastikan perubahan tervalidasi dengan **testing_agent_v3** karena user melaporkan mismatch (jangan klaim “sudah berubah” tanpa verifikasi route/role/data).

## 2) Implementation Steps

### Phase 1 — Core Flow POC (wajib): “BOM tab di Work Group = grid embedded + Simpan saja”
**User stories (POC)**
1. Engineer membuka Work Group dan melihat 2 tab: **Drawing & Upload** dan **BOM** untuk 1 SO.
2. Engineer mengisi item BOM langsung di tab BOM tanpa pindah halaman.
3. Engineer hanya melihat tombol **Simpan** di tab BOM (tidak ada Submit BOM).
4. Engineer kembali ke daftar drawing di tab Drawing tanpa kehilangan konteks.
5. Engineer memahami BOM ini shared di level SO (ditampilkan di UI).

**Langkah teknis**
- Refactor `frontend/src/pages/BomEntryGridPage.jsx`:
  - Ekstrak & export `WorkOrderView({ bomId, embedded })`.
  - Mode `embedded=true`:
    - Sembunyikan header besar + tombol back internal halaman BOM.
    - Pertahankan grid, save, status lock/read-only, panel revision yang relevan.
- Ubah `frontend/src/pages/EngineeringDrfWorkPage.jsx`:
  - Tambah Tabs level grup: `Drawing & Upload` (default) dan `BOM`.
  - Di tab `BOM`, render `WorkOrderView` (embedded) menggunakan BOM SO.
  - Fallback state: jika BOM belum ada → pesan “Generate minimal 1 drawing dulu”.

**Checkpoint POC**
- `/engineering/drf/:drfId` → tab BOM tampil grid dan dapat simpan.
- Tidak ada tombol submit BOM di tab BOM.
- Data BOM tersimpan dan muncul saat reload.

**Status**: ✅ **Selesai** (embedded BOM di Work Group sudah berjalan dan tervalidasi).

---

### Phase 2 — V1 App Development: Restruktur & Minimalis (Work Group + Work Order)
**User stories (V1)**
1. Work Group tampil ringkas: header tipis, info penting saja, tabel compact.
2. Daftar drawing jelas dan cepat untuk buka per-drawing Work Order.
3. BOM tidak lagi terasa “BOM per drawing” (BOM ditempatkan di tab grup).
4. Alur TTD per-drawing tidak membingungkan dan tidak kebesaran.

**Langkah teknis**
- `frontend/src/pages/EngineeringWorkOrderPage.jsx` (per-drawing):
  - Hapus konsep BOM tab/kolom BOM di halaman per-drawing.
  - Hilangkan elemen BOM yang mengganggu:
    - ✅ hapus **kolom “BOM Link”**.
    - ✅ hilangkan tombol **“Isi Data BOM”** pada attachments (gunakan `hideBomLink`).
  - Kompakkan layout (padding/font/button ringkas) dan copy menegaskan BOM ada di Work Group.
- `frontend/src/pages/EngineeringDrfWorkPage.jsx` (Work Group):
  - Kompakkan header/tabel.
  - Chip daftar drawing: hanya **MKS** dan **Cust Dwg** (Nesting/Extra di panel dokumen bawah).

**Akhiri Phase 2 dengan**
- `yarn build` frontend.
- Jalankan `testing_agent_v3`.

**Status**: ✅ **Selesai** (UI minimalis/compact di dua halaman sudah diterapkan dan diverifikasi).

---

### Phase 3 — Hardening + UX Polish: Multi‑Part BOM + TTD Prepared + Partial Submit
**User stories**
1. SO dapat memiliki **BOM Part 1/Part 2** (dst) bila diperlukan.
2. Nomor BOM part tambahan memakai suffix **`-P2`, `-P3`, ...**.
3. Di setiap BOM part, section **Nomor Drawing Terdaftar** menampilkan **semua drawing pada SO**.
4. Engineer TTD Prepared per-drawing (save-only) dengan pemilihan lokasi stamp digital.
5. Submit ke Eng Leader dilakukan dari Work Group dengan checkbox (partial), **BOM ikut tersubmit**.

**Langkah teknis**
- Backend (`backend/routers/bom.py`):
  - ✅ `GET /api/bom/by-so?so_no=...` untuk daftar BOM per SO.
  - ✅ `POST /api/bom/add-part` untuk membuat BOM part baru (suffix `-P{n}`), mewarisi metadata part‑1.
- Frontend Work Group (`frontend/src/pages/EngineeringDrfWorkPage.jsx`):
  - ✅ Tab BOM berisi sub-tab: **BOM Part 1 / BOM Part 2 / + Tambah BOM**.
  - ✅ Klik part → render embedded grid BOM untuk part tersebut.
- Frontend BOM embedded (`frontend/src/pages/BomEntryGridPage.jsx`):
  - ✅ Fetch drawings by SO dan tampilkan **SEMUA drawing SO** pada “Nomor Drawing Terdaftar”.
- Backend TTD Prepared (`backend/routers/drawing_register.py`):
  - ✅ `POST /api/drawings/{id}/sign-prepared` menyimpan prepared_signature, status tetap `draft`.
  - ✅ `submit-for-approval` fallback menggunakan posisi prepared_signature bila submit tanpa placement.
  - ✅ Relaksasi: **TTD Prepared tidak wajib kategori**; kategori tetap wajib saat submit.
- Frontend Signature modal (`frontend/src/components/SignaturePlacementModal.jsx`):
  - ✅ Stage `prepared` → panggil endpoint `sign-prepared`, tombol menjadi “Simpan TTD”.
  - ✅ Mendukung multi-halaman via `placements` (boleh sign lebih dari 1 halaman bila perlu).
- Frontend per-drawing upload UX (`frontend/src/pages/MasterDrawingPage.jsx` + `EngineeringWorkOrderPage.jsx`):
  - ✅ Setelah upload PDF MKS sukses, **auto-open** modal pemilihan titik TTD (opsional per kebutuhan user).
  - ✅ `suppressWorkCatPopup` untuk menghindari popup kategori mengganggu saat engineer langsung memilih titik TTD.
- Partial submit (`frontend/src/pages/EngineeringDrfWorkPage.jsx`):
  - ✅ Panel **Submit ke Eng Leader** di bawah (checkbox, select all, submit terpilih).
  - ✅ Panel menampilkan BOM yang akan ikut tersubmit (**BOM IKUT TER‑SUBMIT KE ENG LEADER**).

**Status**: ✅ **Selesai** (multi‑part BOM + TTD Prepared + partial submit + BOM included sudah berjalan).

## 3) Next Actions (eksekusi terdekat)
1. **Monitor real usage**: pastikan user melihat perubahan di route yang benar:
   - Work Group: `/engineering/drf/:drfId`
   - Work Order per-drawing: `/engineering/work-order/:drawingId`
2. (Opsional UX lanjutan) Tambah indikator ringkas di daftar drawing:
   - “PDF OK”, “TTD OK”, “Kategori OK”, “Siap Submit” agar engineer cepat pilih partial submit.
3. (Opsional) Aturan bisnis BOM multi-part:
   - Jika diperlukan, tambahkan penjelasan “kapan perlu Part 2” + guard agar tidak membuat part berlebihan.

## 4) Success Criteria
- **Work Group** (`/engineering/drf/:drfId`) memiliki 2 tab: **Drawing & Upload** dan **BOM**.
- Tab **BOM**:
  - Menampilkan **grid BOM embedded** (editable) dan hanya ada **Simpan**.
  - Mendukung **multi-part BOM** via sub-tab Part 1/Part 2 + **Tambah BOM** (suffix `-P{n}`).
  - “Nomor Drawing Terdaftar” menampilkan **semua drawing pada SO**.
- **Work Order per-drawing** (`/engineering/work-order/:drawingId`):
  - Tidak menampilkan kolom/tombol yang berhubungan dengan BOM (BOM ada di Work Group).
  - Setelah upload PDF, engineer dapat langsung memilih lokasi stamp digital dan **Simpan TTD Prepared**.
  - Modal TTD mendukung **multi-halaman** (boleh sign halaman tertentu saja).
- **Submit ke Eng Leader**:
  - Dilakukan di **Work Group** dengan **checkbox** (partial submit).
  - Panel menegaskan **BOM ikut tersubmit**.
- **Verifikasi**:
  - `testing_agent_v3` (Iterasi 34) ✅ backend 5/5, frontend 11/11.
  - Direct curl ✅ sign-prepared (dengan/tanpa kategori), submit fallback placement.
  - Screenshot ✅ Work Group + BOM tab + Work Order.
  - Cleanup ✅ 0 user `qa_`, artefak uji dibersihkan.
