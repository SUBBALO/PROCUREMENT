# Plan — Dashboard SO Progress + Antrian Leader + DRF List + TTD Sales + Notifikasi (N → O → L → M → I)

## 1) Objectives

### Objective yang sudah tercapai (riwayat)
- ✅ Menyelaraskan alur Engineering dengan realita: **1 BOM per SO/DRF**, drawing bisa **submit bertahap** tanpa mengunci BOM/dokumen SO.
- ✅ Menambahkan **popup submit final** (drawing terakhir) dengan **checklist wajib** + item yang bisa diklik untuk diarahkan ke lokasi upload/isi.
- ✅ Menerapkan **lock dinamis** setelah **submit final**: **BOM + Dokumen SO** terkunci; **auto-unlock** jika ada drawing kembali ke `draft` (reject).
- ✅ Membuat **Eng Leader Review Popup**: masterlist semua dokumen 1 SO (drawing + nesting/cad/costing + BOM), aksi per item (Approve/TTD atau Revisi) dengan catatan revisi wajib.
- ✅ Merapikan UX Work Order: fokus ke upload/submit drawing + BOM khusus 1 SO.

### Objective aktif (prioritas terbaru)
- ✅ (N) Membuat **Dashboard SO Progress + sidebar kiri** untuk tracking stage lintas departemen.
- ✅ (O) Membuat **Antrian** yang jelas untuk Engineering/Leader:
  - `Antrian Drawing Request & Inquiry`
  - `Menunggu Verifikasi Leader`
  - Klik item → langsung membuka **EngLeaderReviewDialog (Review Dokumen SO)**.
- ✅ (L) Redesign **DRF list** (Sales): hapus kolom **Aksi**, tampilkan **items + preview + tabel drawing** (No. Drawing, Item, Qty, Status).
- ✅ (M) Pindahkan **TTD Sales** ke DRF list: bagian **Perlu TTD Sales** → preview → review/isi stamp → pilih lokasi TTD.
- ✅ (I) **Notifikasi Sales (in-app saja)** saat drawing sudah siap untuk dilihat.

> Status ringkas:
> - N/O/L/M/I: **SELESAI** dan sudah **lolos testing agent**.
> - Approval berjenjang BOM (Leader → Purchasing → Erwin): **DITUNDA** sampai ada instruksi lanjutan dari user.

---

## 2) Implementation Steps

### Phase 1 — Fondasi Engineering Workflow (Fase 2–4) — (Completed / Historical)
> Fase ini dipertahankan sebagai fondasi untuk queue/approval & review dokumen.

**User stories (fondasi)**
1. ✅ Partial submit drawing tidak mengunci BOM/SO docs.
2. ✅ Submit final menampilkan checklist wajib + deep-link.
3. ✅ Setelah final submit: BOM + SO docs lock.
4. ✅ Reject → unlock otomatis.
5. ✅ Eng Leader review 1 SO dalam 1 popup.

**Komponen/endpoint yang sudah ada**
- Backend
  - ✅ `GET /api/drawing-requests/{drfId}/workgroup-status`
  - ✅ Guard lock untuk BOM & attachment
  - ✅ Review attachment non-drawing: `POST /api/bom/{bomId}/attachments/{attachId}/review`
- Frontend
  - ✅ `FinalSubmitChecklistDialog.jsx`
  - ✅ `EngLeaderReviewDialog.jsx`
  - ✅ Mode Cepat default (reduce-motion) + toggle

**Testing (Completed)**
- ✅ Lolos regression sebelumnya (lihat `/app/test_reports/iteration_21.json`).

---

### Phase N — Dashboard SO Progress + Sidebar Kiri — (Completed)

**Tujuan**
- Menyediakan dashboard ringkas untuk memantau **progress SO** lintas stage (Sales → Engineering → Purchasing → Store → QC → Delivery), termasuk progress drawing (approved/total).

**Implementasi (Done)**
- Backend
  - ✅ Endpoint: `GET /api/dashboard/so-progress`
    - Return: `{ items: [...], count }`
    - Mendukung query:
      - `q` (search SO/customer/description)
      - `limit`
- Frontend
  - ✅ Komponen: `frontend/src/components/SoProgressTracker.jsx`
  - ✅ Integrasi halaman landing: `frontend/src/pages/LandingPage.jsx` + sidebar kiri

**Testing (Done)**
- ✅ Testing agent report: `/app/test_reports/iteration_25.json`
  - Backend: **11/11 pass**, tidak ada bug.

---

### Phase O — Antrian “Menunggu Verifikasi Leader” + “Antrian Drawing Request & Inquiry” — (Completed)

**Tujuan**
- Mengganti tab lama **"Tugas Saya / Menunggu TTD Saya"** menjadi 2 antrian yang sesuai proses terbaru.
- Leader bisa masuk dari antrian → langsung review lengkap via **EngLeaderReviewDialog**.

**Implementasi (Done)**
- Backend
  - ✅ Endpoint baru: `GET /api/engineering/pending-leader-verification`
    - Mengelompokkan drawing `pending_eng_head` per DRF/SO.
    - RBAC: hanya `eng_leader/eng_head/engineering/admin/super_admin/supervisor`.
- Frontend
  - ✅ `EngineeringQueuePanel.jsx` diubah menjadi **2 tab** untuk leader:
    - `Antrian Drawing Request & Inquiry`
    - `Menunggu Verifikasi Leader`
  - ✅ QuickLinks lama dihapus.
  - ✅ Klik item pada tab `Menunggu Verifikasi Leader` membuka `EngLeaderReviewDialog`.

**Exit criteria (Verified)**
- ✅ Leader melihat queue dan bisa membuka dialog review dari queue.

---

### Phase L — DRF List Redesign (Sales) — (Completed)

**Tujuan**
- DRF list lebih informatif tanpa kolom “Aksi” dan lebih fokus pada item/drawing.

**Implementasi (Done)**
- Frontend (`DrawingRequestFormPage.jsx`)
  - ✅ Kolom **"Aksi"** dihapus.
  - ✅ Baris DRF menjadi **expandable**:
    - Panel **Daftar Item** (tabel item DRF).
    - Panel **Drawing** (tabel No. Drawing / Item / Qty / Status + tombol preview view-only).
    - Tombol **Detail & Preview** tersedia di area expand.
    - Aksi draft (Edit/Submit/Batalkan) dipindah ke area expand.
  - ✅ Preview drawing pada list bersifat **view-only** (`noDownload`, `noPrint`).

**Exit criteria (Verified)**
- ✅ DRF list dapat digunakan tanpa kehilangan fitur utama dan tampil lebih informatif.

---

### Phase M — Pindahkan TTD Sales ke DRF List — (Completed)

**Tujuan**
- Sales menandatangani dari DRF list (bukan alur terpisah), dengan UX jelas: **Perlu TTD Sales**.

**Implementasi (Done)**
- Frontend (`DrawingRequestFormPage.jsx`)
  - ✅ Section **"Perlu TTD Sales"**:
    - Sumber data: `GET /api/drawings/pending-my-approval` (role sales → `pending_sales`).
    - Muncul hanya jika ada data (benar bila kosong: section tersembunyi).
  - ✅ Tombol **TTD** juga tersedia di tabel drawing (untuk row yang `pending_sales`).
  - ✅ Reuse `SignaturePlacementModal` dengan `stage="sales"`.
- Frontend (`SignaturePlacementModal.jsx`)
  - ✅ Prefill **P/O No** dari `drawing.po_customer_no` (atau fallback `po_no`).

**Exit criteria (Verified)**
- ✅ Flow TTD Sales dapat dipicu dari DRF list dan memakai modal TTD yang existing.

---

### Phase I — Notifikasi Sales (In-App Saja) Saat Drawing Siap Dilihat — (Completed)

**Tujuan**
- Sales mendapat notifikasi ketika drawing sudah bisa dilihat (tanpa email).

**Implementasi (Done)**
- Backend (`routers/notifications.py`)
  - ✅ Tambah kategori notifikasi baru khusus Sales:
    - `key: drawing_ready_view`
    - `label: "Drawing Siap Dilihat (Preview)"`
    - Kriteria: drawing milik DRF Sales dengan `approval_status in (pending_eng_head, pending_qc)` dan sudah punya `file_id`.
    - `link: /sales/drawing-requests`
- Frontend
  - ✅ Terlihat di dropdown Notifikasi header pada halaman ber-AppShell.

**Exit criteria (Verified)**
- ✅ Notifikasi muncul dan jumlahnya sesuai data; klik membawa user ke DRF list.

---

### Deferred — Approval Berjenjang BOM (Leader → Purchasing → Erwin)
- ⏸ Ditunda sampai ada instruksi lanjutan dari user.
- Setelah aktif, targetnya mengikat approval BOM dengan chain per role dan audit trail yang jelas.

---

## 3) Next Actions (urut eksekusi)
1. ✅ N selesai (Dashboard SO Progress + sidebar).
2. ✅ O selesai (2 antrian leader + buka EngLeaderReviewDialog).
3. ✅ L selesai (DRF list redesign tanpa kolom Aksi + expandable + tabel item/drawing).
4. ✅ M selesai (TTD Sales dari DRF list + prefill PO).
5. ✅ I selesai (notifikasi Sales in-app untuk drawing siap dilihat).
6. ⏭ **Menunggu instruksi berikutnya**: Approval berjenjang BOM (Leader → Purchasing → Erwin).

> Catatan operasional wajib:
> - Semua UI copy wajib **Bahasa Indonesia**.
> - Tetap pakai shadcn UI (hindari native select).
> - Pertahankan viewer PDF hybrid `<iframe>` blob (jangan ubah ke render PNG server).
> - Mode Cepat default aktif (reduce-motion).
> - Jangan ubah `frontend/.env` dan `backend/.env`.
> - Gunakan `yarn`.

---

## 4) Success Criteria
- ✅ Dashboard SO Progress + sidebar berjalan dan endpoint tervalidasi.
- ✅ Leader punya 2 antrian baru dan bisa review dari antrian via dialog yang sudah ada.
- ✅ DRF list lebih informatif (items + preview + tabel drawing) tanpa kolom Aksi.
- ✅ Sales bisa melakukan TTD dari DRF list dengan alur jelas.
- ✅ Notifikasi Sales in-app muncul saat drawing siap dilihat dan bisa di-click menuju konteksnya.

---

## 5) Verification / Evidence
- ✅ Testing agent report:
  - `/app/test_reports/iteration_25.json` — Dashboard SO Progress (backend 11/11 pass)
  - `/app/test_reports/iteration_26.json` — Phase O/L/M/I (backend 11/11 pass, frontend 100%)
- ✅ Cleanup selesai:
  - Password `salesuser` dipulihkan ke hash asli
  - Akun QA `qa_leader_tmp` dihapus
  - Temporary files dihapus
- ✅ Final `yarn build` sukses
