# Plan — Redesign Engineering Work Order (Fase 2, 3, 4)

## 1) Objectives
- ✅ Menyelaraskan alur Engineering dengan realita: **1 BOM per SO/DRF**, drawing bisa **submit bertahap** tanpa mengunci BOM/dokumen SO.
- ✅ Menambahkan **popup submit final** (drawing terakhir) dengan **checklist wajib** + item yang bisa diklik untuk diarahkan ke lokasi upload/isi.
- ✅ Menerapkan **lock dinamis** setelah **submit final**: **BOM + Dokumen SO** terkunci; **auto-unlock** jika ada drawing kembali ke `draft` (reject).
- ✅ Membuat **Eng Leader Review Popup (Fase 3)**: masterlist semua dokumen 1 SO (drawing + nesting/cad/costing + BOM), aksi per item (Approve/TTD atau Revisi) dengan catatan revisi wajib.
- ✅ Merapikan UX Fase 4: halaman per-drawing (`EngineeringWorkOrderPage.jsx`) fokus ke upload/submit drawing dan menghapus BOM linking redundan.

> Status: **SEMUA objektif tercapai** dan sudah lolos pengujian (Backend 8/8, Frontend 14/15; 1 timeout re-login bukan bug fungsional).

## 2) Implementation Steps

### Phase 1 — Core POC (alir paling riskan: Final Submit + Lock/Unlock + Deep-link checklist)
> Fokus: buktikan end-to-end “submit bertahap → submit final → lock → reject → unlock” berjalan stabil.

**User stories (POC)**
1. ✅ Sebagai engineer, saya bisa submit drawing pertama tanpa BOM/SO docs ikut terkunci.
2. ✅ Sebagai engineer, saat submit drawing terakhir saya wajib checklist dokumen yang diperlukan.
3. ✅ Sebagai engineer, saya bisa klik item checklist yang “belum lengkap” dan langsung diarahkan ke panel upload yang benar.
4. ✅ Sebagai sistem, setelah semua drawing non-draft, BOM & dokumen SO menjadi read-only.
5. ✅ Sebagai engineer, jika Eng Leader reject 1 drawing sehingga kembali `draft`, lock SO otomatis terbuka lagi.

**Langkah POC (Implemented)**
- Backend
  - ✅ Endpoint status SO-level:
    - `GET /drawing-requests/{drfId}/workgroup-status` → `{ total_drawings, draft_count, locked, counts: { bom_items, nesting, cad, costing }, bom_id, bom_no }`
  - ✅ Util lock dinamis: `backend/utils/workgroup.py`
  - ✅ Guard lock dokumen SO (BOM attachments):
    - `POST /bom/{bomId}/attachments` → `409` jika SO locked (kecuali admin-like override)
    - `DELETE /bom/{bomId}/attachments/{attachId}` → `409` jika SO locked (kecuali admin-like override)
- Frontend
  - ✅ Final submit checklist dialog:
    - Komponen: `frontend/src/components/FinalSubmitChecklistDialog.jsx`
    - Trigger: saat klik “TTD & Submit” pada drawing yang merupakan **draft terakhir** dalam DRF
    - Checklist wajib (sesuai permintaan): BOM items + Nesting + AutoCAD + Costing
    - Deep-link: tombol **Lengkapi** mengarahkan ke Work Group (`#so-docs`) atau ke halaman BOM

**Websearch (best practice singkat)**
- ℹ️ Tidak dibutuhkan lagi untuk implementasi; fitur sudah selesai dan tervalidasi di UI.

**Exit POC (Verified)**
- ✅ Partial submit tidak mengunci.
- ✅ Submit final menampilkan checklist.
- ✅ Setelah final submit, lock aktif.
- ✅ Setelah reject kembali draft, lock otomatis terbuka.

---

### Phase 2 — V1 App Development (Fase 2 + Fase 4 core)

**User stories (V1)**
1. ✅ Sebagai engineer, saya melihat halaman Work Group yang jelas: BOM bersama, Dokumen SO, daftar drawing.
2. ✅ Sebagai engineer, saya tidak melihat BOM linking per-drawing lagi (menghindari duplikasi).
3. ✅ Sebagai engineer, saya bisa bekerja bertahap: upload & submit drawing satu per satu.
4. ✅ Sebagai engineer, saya mendapat pengingat wajib saat submit final dengan checklist yang bisa mengarahkan saya.
5. ✅ Sebagai engineer, setelah submit final saya tidak bisa mengubah BOM/dokumen SO (tampilan terkunci + ikon lock).

**Frontend (Implemented)**
- `EngineeringWorkOrderPage.jsx`
  - ✅ Menghapus `BomLinkingSection` (BOM per-drawing) dan mengganti dengan **Section A (read-only)**:
    - “**Bill of Material — 1 BOM bersama per Sales Order**” + tombol “Isi/Buka BOM”
  - ✅ Struktur A/B/C jelas:
    - A. BOM (reference)
    - B. Upload Dokumen Drawing
    - C. TTD & Submit
  - ✅ Trigger checklist submit final via `workgroup-status` sebelum membuka `SignaturePlacementModal stage="submit"`.

- `EngineeringDrfWorkPage.jsx`
  - ✅ Lock banner saat SO locked: `data-testid="drf-so-locked-banner"`
  - ✅ Panel BOM menampilkan status “TERKUNCI” dan tombol “Lihat BOM” saat locked
  - ✅ SoDocsPanel di-disable saat locked: `canEdit={canWork && !soLocked}`
  - ✅ Deep-link scroll handler untuk `#so-docs`

- `SoDocsPanel.jsx`
  - ✅ Secara otomatis read-only saat `canEdit=false` (upload/delete tidak tampil).

**Backend (Implemented)**
- `routers/drawing_register.py`
  - ✅ `submit-for-approval` tetap hanya mengubah status drawing (tidak ada logika lock BOM di sini).
- `routers/bom_attachments.py`
  - ✅ Guard lock upload/delete attachments ketika SO locked.
- `routers/bom.py`
  - ✅ Guard lock edit BOM items-bulk ketika SO locked (`409` untuk non-admin).

**Testing (Completed)**
- ✅ `yarn build` sukses.
- ✅ Screenshot verifikasi UI Work Group + Review Dialog + Work Order.
- ✅ Test report: Backend 8/8 pass; Frontend 14/15 pass (1 timeout re-login bukan bug).

---

### Phase 3 — Eng Leader Review Popup (Fase 3)

**User stories (Review Popup)**
1. ✅ Sebagai Eng Leader, saya membuka popup review untuk 1 SO dan melihat semua dokumen (drawing + nesting/cad/costing + BOM).
2. ✅ Sebagai Eng Leader, saya bisa preview PDF dengan viewer existing tanpa lambat.
3. ✅ Sebagai Eng Leader, saya bisa Approve & TTD untuk item drawing dari popup.
4. ✅ Sebagai Eng Leader, saya bisa tandai OK untuk non-drawing (nesting/costing/cad) atau minta revisi.
5. ✅ Sebagai Eng Leader, saat minta revisi saya wajib mengisi catatan, dan status + riwayat tercatat.

**Frontend (Implemented)**
- ✅ Komponen: `frontend/src/components/EngLeaderReviewDialog.jsx` (master-detail)
  - Kiri: tabel dense dokumen + search + filter status (pakai shadcn Select)
  - Kanan: detail + tombol aksi + riwayat
  - Drawing:
    - Approve & TTD (menggunakan `SignaturePlacementModal stage="eng_head"`) hanya ketika `pending_eng_head`
    - Minta Revisi (catatan wajib)
  - Non-drawing (nesting/cad/costing):
    - Tandai OK
    - Minta Revisi (catatan wajib)
- ✅ Entry point:
  - Tombol “Review Dokumen SO” di `EngineeringDrfWorkPage.jsx` (role Eng Leader/Admin).

**Backend (Implemented / Revised)**
- ✅ Tidak membuat `review-pack` terpisah; dialog memuat data dari endpoint yang sudah ada:
  - Drawing list: `GET /drawings?from_drf_id=...`
  - Attachment list: `GET /bom/{bomId}/attachments` (menggunakan `items` flat list)
- ✅ API aksi review non-drawing:
  - `POST /bom/{bomId}/attachments/{attachId}/review` (OK / REVISI + notes) + audit trail (`review_history`)
  - RBAC: hanya `eng_leader/eng_head/admin/super_admin/supervisor`

**Testing (Completed)**
- ✅ Review dialog terbuka, menampilkan dokumen, aksi muncul sesuai jenis dokumen, dan update status berjalan.

---

### Phase 4 — Hardening + Refactor + Regression

**User stories (hardening)**
1. ✅ Sebagai engineer, UI tidak membingungkan: tidak ada duplikasi BOM per drawing.
2. ✅ Sebagai QC/view-only, saya tetap bisa preview dokumen tanpa bisa edit/download (sesuai RBAC existing).
3. ✅ Sebagai sistem, lock/unlock konsisten walau refresh halaman.
4. ✅ Sebagai admin, saya bisa override bila diperlukan tanpa merusak audit trail (admin-like override untuk lock guard).
5. ✅ Sebagai user, build produksi lokal tetap aman (tidak error saat `yarn build`).

**Langkah (Completed)**
- ✅ State derivation lock dilakukan konsisten di frontend (berdasarkan `approval_status`) dan backend guard memakai util `so_locked_by_bom`.
- ✅ Regression build: `yarn build` sukses.
- ✅ Pengujian fitur kunci selesai (lihat `/app/test_reports/iteration_21.json`).
- ✅ Akun uji sementara sudah dihapus (environment bersih).

## 3) Next Actions (urut eksekusi)
1. ✅ Implement Phase 1 POC: endpoint status + dialog checklist + lock/unlock guard attachments.
2. ✅ Integrasikan ke V1 (Phase 2): hapus BOM per-drawing di WorkOrderPage, final submit dialog + deep-link.
3. ✅ Bangun Review Popup (Phase 3) + endpoint review attachment.
4. ✅ Hardening + regression: `yarn build`, screenshot verification, jalankan test backend.

> Next Actions baru (opsional / future backlog):
- (Opsional) Tambah test otomatis khusus skenario “drawing terakhir benar-benar memunculkan checklist” dengan data fixture (butuh drawing dengan `file_id` + `work_category` + `draft_count==1`).
- (Opsional) Rapikan konsistensi label status badge di Review Dialog agar mapping status drawing lebih presisi per tahap.

## 4) Success Criteria
- ✅ Engineer bisa submit drawing bertahap tanpa BOM/SO docs terkunci prematur.
- ✅ Submit drawing terakhir memunculkan dialog checklist wajib; item “belum lengkap” bisa diklik dan mengarahkan user ke tempat upload/isi.
- ✅ Setelah final submit (semua drawings non-draft): BOM & SO docs terkunci (frontend disable + backend guard).
- ✅ Jika ada reject → drawing kembali `draft` → lock otomatis terbuka.
- ✅ Eng Leader bisa review semua dokumen 1 SO dalam 1 popup, termasuk yang sudah TTD, dengan aksi approve/revisi tercatat.
