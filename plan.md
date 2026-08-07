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
- ⏳ (O) Membuat **Antrian** yang jelas untuk Engineering/Leader:
  - `Antrian Drawing Request & Inquiry`
  - `Menunggu Verifikasi Leader`
  - Klik item → langsung membuka **EngLeaderReviewDialog (Review Dokumen SO)**.
- ⏳ (L) Redesign **DRF list** (Sales): hapus kolom **Aksi**, tampilkan **items + preview + tabel drawing** (No. Drawing, Item, Qty, Status).
- ⏳ (M) Pindahkan **TTD Sales** ke DRF list: bagian **Perlu TTD Sales** → preview → review/isi stamp → pilih lokasi TTD.
- ⏳ (I) **Notifikasi Sales (in-app saja)** saat drawing sudah siap untuk dilihat.

> Status ringkas:
> - N: **SELESAI** (backend test 11/11 lulus; user minta anggap selesai & lanjut).
> - O: **Mulai dikerjakan berikutnya**.
> - L/M/I: **Belum mulai**.
> - Approval berjenjang BOM (Leader → Purchasing → Erwin): **DITUNDA** sampai N/O/L/M/I selesai.

---

## 2) Implementation Steps

### Phase 1 — Fondasi Engineering Workflow (Fase 2–4) — (Completed / Historical)
> Fase ini tetap dipertahankan sebagai fondasi karena akan dipakai ulang oleh Phase O.

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

### Phase O — Antrian “Menunggu Verifikasi Leader” + “Antrian Drawing Request & Inquiry” — (Next)

**Tujuan**
- Mengganti tab lama **"Tugas Saya / Menunggu TTD Saya"** menjadi 2 antrian yang sesuai proses terbaru.
- Leader bisa masuk dari antrian → langsung review lengkap via **EngLeaderReviewDialog** (tanpa membangun ulang dialog).

**User stories**
1. Sebagai Eng Leader, saya melihat tab **Menunggu Verifikasi Leader** berisi SO/DRF yang butuh verifikasi saya.
2. Sebagai Eng Leader, klik item langsung membuka **Review Dokumen SO** (EngLeaderReviewDialog) dan saya bisa approve/revisi.
3. Sebagai Engineer/Leader, saya punya tab **Antrian Drawing Request & Inquiry** untuk pekerjaan masuk (hub Pekerjaan Masuk).

**Rencana implementasi**
- Frontend
  - ⏳ Buat halaman/section antrian Engineering sesuai struktur menu yang disepakati:
    - Hub **Pekerjaan Masuk** (tab: Inquiry / New Order (DRF) / Repeat Order) — bila belum tersambung, minimal siapkan kerangka + 2 antrian utama dulu.
  - ⏳ Ganti tab lama menjadi:
    - `Antrian Drawing Request & Inquiry`
    - `Menunggu Verifikasi Leader`
  - ⏳ Klik item pada `Menunggu Verifikasi Leader` → buka `EngLeaderReviewDialog` dan load data DRF/SO terkait.
  - ⏳ Pastikan semua label/copy UI bahasa Indonesia + `data-testid` untuk elemen penting.

- Backend
  - ⏳ Jika data queue belum tersedia dari endpoint existing, tambahkan endpoint queue (tetap di bawah `/api`) misalnya:
    - `GET /api/engineering/queues/incoming`
    - `GET /api/engineering/queues/pending-leader-verification`
  - ⏳ Definisikan kriteria queue secara eksplisit (berbasis status drawing/attachment/BOM) dan gunakan RBAC.

**Exit criteria**
- Antrian muncul stabil untuk role leader.
- Klik item membuka dialog review dan action berhasil (approve/revisi) tanpa reload yang mengganggu.

---

### Phase L — DRF List Redesign (Sales) — (Planned)

**Tujuan**
- DRF list lebih informatif tanpa kolom “Aksi” dan lebih fokus pada item/drawing.

**User stories**
1. Sebagai Sales, saya melihat DRF list tanpa kolom **Aksi**.
2. Saya bisa melihat **tabel item** dan **preview**.
3. Saya bisa melihat tabel drawing per DRF: **No. Drawing, Item, Qty, Status**.

**Rencana implementasi**
- Frontend
  - ⏳ Ubah tampilan list DRF:
    - Hilangkan kolom/sel “Aksi”.
    - Tambah tampilan ringkas items (mis. expandable/preview modal).
    - Tambah tabel drawing yang terkait.
  - ⏳ Pastikan tetap pakai komponen shadcn (Table/Accordion/Badge/Select).

- Backend
  - ⏳ Jika diperlukan, tambah endpoint ringkas untuk list drawing per DRF agar DRF list tidak berat.

**Exit criteria**
- DRF list bisa dipakai tanpa kehilangan fungsi utama (lihat, filter, buka detail/preview).

---

### Phase M — Pindahkan TTD Sales ke DRF List — (Planned)

**Tujuan**
- Sales menandatangani dari DRF list (bukan alur terpisah), dengan UX jelas: **Perlu TTD Sales**.

**User stories**
1. Sebagai Sales, saya melihat section/status **Perlu TTD Sales** di DRF list.
2. Saya bisa buka preview dokumen.
3. Saya bisa review/isi stamp SO lalu pilih lokasi TTD (signature placement) dan submit.

**Rencana implementasi**
- Frontend
  - ⏳ Tambah status/indikator “Perlu TTD Sales”.
  - ⏳ Dari DRF list → buka modal preview → lanjut ke flow stamp + signature placement.
  - ⏳ Pastikan view-only tetap untuk role lain sesuai aturan.

- Backend
  - ⏳ Pastikan endpoint stamping/TTD sales kompatibel dengan entry point baru (tidak mengubah arsitektur viewer iframe/blob).

**Exit criteria**
- Sales bisa menyelesaikan TTD dari DRF list end-to-end.

---

### Phase I — Notifikasi Sales (In-App Saja) Saat Drawing Siap Dilihat — (Planned)

**Tujuan**
- Sales mendapat notifikasi ketika drawing sudah bisa dilihat (tanpa email).

**User stories**
1. Sebagai Sales, saya mendapat notifikasi in-app (badge/toast/notification center) saat drawing siap dilihat.
2. Klik notifikasi membawa saya ke DRF/drawing yang relevan.

**Rencana implementasi**
- Backend
  - ⏳ Tentukan event “drawing siap dilihat” (mis. saat file upload selesai + status tertentu).
  - ⏳ Simpan notifikasi ke koleksi notifications per user/role.
  - ⏳ Endpoint:
    - `GET /api/notifications`
    - `POST /api/notifications/mark-read`
- Frontend
  - ⏳ Komponen notifikasi (shadcn + sonner bila perlu) + badge di portal Sales.

**Exit criteria**
- Notifikasi muncul tepat waktu dan tidak spam, hanya in-app.

---

### Deferred — Approval Berjenjang BOM (Leader → Purchasing → Erwin)
- ⏸ Ditunda sampai Phase N/O/L/M/I selesai.
- Setelah aktif, targetnya mengikat approval BOM dengan chain per role dan audit trail yang jelas.

---

## 3) Next Actions (urut eksekusi)
1. ✅ N dinyatakan selesai dan lanjut ke O (sesuai konfirmasi user).
2. ⏳ Implement **Phase O**: 2 antrian baru + klik buka `EngLeaderReviewDialog`.
3. ⏳ Implement **Phase L**: DRF list tanpa kolom Aksi + tabel drawing + preview.
4. ⏳ Implement **Phase M**: flow TTD Sales dari DRF list.
5. ⏳ Implement **Phase I**: notifikasi Sales in-app.
6. ⏸ Baru setelah itu: approval BOM berjenjang.

> Catatan operasional wajib:
> - Semua UI copy wajib **Bahasa Indonesia**.
> - Tetap pakai shadcn UI (hindari native select).
> - Pertahankan viewer PDF hybrid `<iframe>` blob (jangan ubah ke render PNG server).
> - Mode Cepat default aktif (reduce-motion).
> - Jangan ubah `frontend/.env` dan `backend/.env`.
> - Gunakan `yarn`.

---

## 4) Success Criteria
- ✅ Dashboard SO Progress + sidebar berjalan dan endpoint tervalidasi (testing agent 11/11 pass).
- ⏳ Leader punya 2 antrian baru dan bisa review dari antrian via dialog yang sudah ada.
- ⏳ DRF list lebih informatif (items + preview + tabel drawing) tanpa kolom Aksi.
- ⏳ Sales bisa melakukan TTD dari DRF list dengan alur jelas.
- ⏳ Notifikasi Sales in-app muncul saat drawing siap dilihat dan bisa di-click menuju konteksnya.
