# Rencana Perbaikan Work Order (Work Group + Work Order) — BOM 1 per SO

## 1) Objectives
- Pusatkan konsep **1 SO = banyak Drawing = 1 BOM**: tab **BOM** ada di level **Work Group** (`/engineering/drf/:drfId`), bukan per-drawing.
- **Tab BOM** di Work Group menampilkan **grid BOM editable (embedded)** + **tombol Simpan saja** (tanpa Submit).
- **Submit ke Engineering** tetap **satu gerbang** di per-drawing **Drawing & Upload** (`/engineering/work-order/:drawingId`) dengan verifikasi drawing + BOM.
- Buat **UI minimalis & compact** untuk **dua halaman**: Work Group dan Work Order per-drawing.
- Pastikan perubahan tervalidasi dengan **testing_agent** karena user melaporkan mismatch.

## 2) Implementation Steps

### Phase 1 — Core Flow POC (wajib): “BOM tab di Work Group = grid embedded + Simpan saja”
**User stories (POC)**
1. Sebagai engineer, saya bisa membuka Work Group dan melihat 2 tab: **Drawing & Upload** dan **BOM** untuk 1 SO.
2. Sebagai engineer, saya bisa mengisi item BOM langsung di tab BOM tanpa pindah halaman.
3. Sebagai engineer, saya hanya melihat tombol **Simpan Draft** di tab BOM (tidak ada Submit BOM).
4. Sebagai engineer, saya bisa kembali ke daftar drawing di tab Drawing tanpa kehilangan konteks.
5. Sebagai engineer, saya melihat info bahwa BOM ini **shared** untuk semua drawing pada SO tersebut.

**Langkah teknis**
- Refactor `frontend/src/pages/BomEntryGridPage.jsx`:
  - Ekstrak `WorkOrderView` menjadi komponen reusable: mis. `BomWorkOrderView({ bomId, embedded })`.
  - Mode `embedded=true`:
    - Sembunyikan header besar + tombol navigasi/back internal BOM page.
    - Sembunyikan tombol/aksi yang bukan kebutuhan embedded (export/print/link ke BOM utama, dll) sesuai kebutuhan minimal.
    - Pertahankan: grid, save, status lock/read-only logic, revision panel yang relevan.
  - Export komponen tersebut untuk dipakai di Work Group.
- Ubah `frontend/src/pages/EngineeringDrfWorkPage.jsx`:
  - Tambah Tabs level grup: `Drawing & Upload` (default) dan `BOM`.
  - Di tab `BOM`, render `BomWorkOrderView` (embedded) menggunakan `sharedBomId`.
  - Pastikan fallback state:
    - jika `sharedBomId` kosong: tampilkan pesan “BOM belum terbentuk — generate drawing dulu / hubungi leader”.
- Pastikan di embedded BOM tab **tidak ada tombol submit** (hanya save) walau status memungkinkan.

**Checkpoint POC (jangan lanjut sebelum lolos)**
- Bisa buka `/engineering/drf/:drfId` → tab BOM tampil grid dan dapat simpan.
- Tidak ada tombol submit BOM di tab BOM.
- BOM yang disimpan tercermin saat reload.

### Phase 2 — V1 App Development: Restruktur & Minimalis (Work Group + Work Order)
**User stories (V1)**
1. Sebagai engineer, Work Group tampil ringkas: header tipis, info penting saja, tabel compact.
2. Sebagai engineer, saya bisa melihat daftar drawing dalam SO dan membuka Work Order per drawing dengan 1 klik.
3. Sebagai engineer, saya bisa mengisi BOM bersama di tab BOM tanpa bingung “BOM per drawing”.
4. Sebagai engineer, saya bisa upload drawing dan submit dari Work Order per drawing dengan UI yang tidak kebesaran.
5. Sebagai leader/reviewer, saya tetap bisa membuka Work Order per drawing untuk lihat status/attachment tanpa layout berantakan.

**Langkah teknis**
- `frontend/src/pages/EngineeringWorkOrderPage.jsx` (per-drawing):
  - Hapus tab BOM di per-drawing (atau ubah jadi “Info BOM” kecil saja) agar konsep tidak dobel.
  - Kompakkan layout:
    - perkecil padding, kurangi border tebal “section A/B”, jadikan header strip tipis.
    - ringkas panel info (grid lebih rapat, font kecil konsisten).
  - Tombol **TTD & Submit** tetap ada di Drawing & Upload; copy tetap menegaskan “BOM disimpan di Work Group tab BOM”.
- `frontend/src/pages/EngineeringDrfWorkPage.jsx` (Work Group):
  - Kompakkan header, tabel daftar drawing, dan panel BOM bersama.
  - Pastikan tab default tetap “Drawing & Upload” supaya alur kerja drawing tetap cepat.
- Konsistensi gating:
  - Submit drawing memverifikasi prasyarat (PDF upload, kategori kerja, dan BOM terisi sesuai aturan backend yang ada).
  - Jika perlu, tambahkan indikator ringan di Work Group bahwa BOM “sudah diisi / belum”.

**Akhiri Phase 2 dengan**
- `yarn build` frontend.
- Jalankan `testing_agent_v3` (regresi + verifikasi kasus user-reported mismatch).

### Phase 3 — Hardening + UX Polish
**User stories**
1. Sebagai engineer, saya tidak kehilangan input BOM saat pindah tab (state tersimpan/terjaga).
2. Sebagai engineer, saya melihat status lock BOM jelas saat ada drawing sudah submit.
3. Sebagai leader, saya bisa review BOM di tab BOM (read-only bila terkunci) tanpa tombol yang membingungkan.
4. Sebagai user, tabel dan header tetap nyaman dipakai di layar kecil (responsif).
5. Sebagai QA, setiap aksi penting punya `data-testid` unik.

**Langkah teknis**
- Rapikan `data-testid` untuk: tab group, embedded bom grid, save button, indikator lock.
- Pastikan embedded mode tidak merusak route BOM editor normal (`/engineering/bom-entry/:bomId`).
- Tambah screenshot route:
  - Work Group tab BOM
  - Work Order per-drawing
- Jalankan `testing_agent_v3` lagi.

## 3) Next Actions (eksekusi terdekat)
1. Refactor `WorkOrderView` di `BomEntryGridPage.jsx` menjadi komponen exported dengan flag `embedded`.
2. Tambah Tabs di `EngineeringDrfWorkPage.jsx` dan embed grid BOM.
3. Hilangkan BOM tab pada `EngineeringWorkOrderPage.jsx` dan perjelas navigasi “BOM ada di Work Group”.
4. Kompakkan UI kedua halaman (padding, header, tabel).
5. `yarn build` + `testing_agent_v3` + perbaiki temuan sampai clean.

## 4) Success Criteria
- Di **Work Group** (`/engineering/drf/:drfId`) ada 2 tab: **Drawing & Upload** dan **BOM**.
- Tab **BOM** menampilkan **grid BOM editable** dan hanya ada **Simpan** (tidak ada Submit BOM).
- **Work Order per-drawing** tidak lagi menampilkan BOM sebagai tab utama; submit tetap single gate dari drawing.
- UI **minimalis/compact**: header tipis, tabel rapat, tidak “kebesaran”.
- `yarn build` sukses dan **testing_agent_v3** untuk flow Work Group/Work Order tidak menemukan bug kritis.
