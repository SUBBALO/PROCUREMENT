# Plan — Redesign Engineering Work Order (Fase 2, 3, 4)

## 1) Objectives
- Menyelaraskan alur Engineering dengan realita: **1 BOM per SO/DRF**, drawing bisa **submit bertahap** tanpa mengunci BOM/dokumen SO.
- Menambahkan **popup submit final** (drawing terakhir) dengan **checklist wajib** + item yang bisa diklik untuk diarahkan ke lokasi upload/isi.
- Menerapkan **lock dinamis** setelah **submit final**: **BOM + Dokumen SO** terkunci; **auto-unlock** jika ada drawing kembali ke `draft` (reject).
- Membuat **Eng Leader Review Popup (Fase 3)**: masterlist semua dokumen 1 SO (drawing + nesting/cad/costing + BOM), aksi per item (Approve/TTD atau Revisi) dengan catatan revisi wajib.
- Merapikan UX Fase 4: halaman per-drawing (`EngineeringWorkOrderPage.jsx`) fokus ke upload/submit drawing dan hilangkan BOM linking redundan.

## 2) Implementation Steps

### Phase 1 — Core POC (alir paling riskan: Final Submit + Lock/Unlock + Deep-link checklist)
> Fokus: buktikan end-to-end “submit bertahap → submit final → lock → reject → unlock” berjalan stabil.

**User stories (POC)**
1. Sebagai engineer, saya bisa submit drawing pertama tanpa BOM/SO docs ikut terkunci.
2. Sebagai engineer, saat submit drawing terakhir saya wajib checklist dokumen yang diperlukan.
3. Sebagai engineer, saya bisa klik item checklist yang “belum lengkap” dan langsung diarahkan ke panel upload yang benar.
4. Sebagai sistem, setelah semua drawing non-draft, BOM & dokumen SO menjadi read-only.
5. Sebagai engineer, jika Eng Leader reject 1 drawing sehingga kembali `draft`, lock SO otomatis terbuka lagi.

**Langkah POC**
- Backend
  - Tambah endpoint ringan untuk menghitung status SO-level dari DRF:
    - `GET /drawing-requests/{drfId}/workgroup-status` → { total_drawings, draft_count, locked, missing: { bomItems, nesting, cad, costing } }
  - Pastikan **tidak ada** logic yang mengubah `engineering_status` BOM saat submit drawing parsial.
  - Tambah guard upload BOM attachments: jika `locked=true` → `409`.
- Frontend
  - Di `EngineeringDrfWorkPage.jsx`:
    - Hitung `locked = drawings.length>0 && drawings.every(d => (d.approval_status||'draft') !== 'draft')`.
    - Render state lock di panel BOM + `SoDocsPanel` (`canEdit={!locked && canWork}`)
  - Buat `FinalSubmitChecklistDialog` (shadcn AlertDialog/Dialog):
    - Terbuka ketika user klik “TTD & Submit” pada drawing yang **membuat seluruh SO menjadi locked**.
    - Checklist wajib: BOM terisi + (Nesting/CAD/Costing) sesuai rule minimal (MVP: tampilkan semua 3 kategori + BOM items).
    - Item checklist yang belum lengkap bisa di-klik → set focus/scroll ke panel yang relevan (BOM link / SoDocsPanel kategori).

**Websearch (best practice singkat)**
- Cari praktik terbaik UX untuk “pre-submit checklist” dan “deep-link ke section” pada aplikasi ERP (kata kunci: *pre-submit checklist dialog UX*, *scroll to section react*, *Radix Dialog checklist*).

**Exit POC**
- 1 DRF dengan 2 drawing: submit 1st drawing → tetap bisa edit BOM/SO docs; submit last drawing → dialog checklist muncul; jika lanjut → lock aktif; reject dari leader → lock terbuka.

---

### Phase 2 — V1 App Development (Fase 2 + Fase 4 core)

**User stories (V1)**
1. Sebagai engineer, saya melihat halaman Work Group yang jelas: BOM bersama, Dokumen SO, daftar drawing.
2. Sebagai engineer, saya tidak melihat BOM linking per-drawing lagi (menghindari duplikasi).
3. Sebagai engineer, saya bisa bekerja bertahap: upload & submit drawing satu per satu.
4. Sebagai engineer, saya mendapat pengingat wajib saat submit final dengan checklist yang bisa mengarahkan saya.
5. Sebagai engineer, setelah submit final saya tidak bisa mengubah BOM/dokumen SO (tampilan terkunci + ikon lock).

**Frontend**
- `EngineeringWorkOrderPage.jsx`
  - Hapus/disable `BomLinkingSection` dari UI (atau pindahkan menjadi read-only info BOM bersama).
  - Pastikan copy UI Indonesia sesuai guideline (rounded-none, badge semantic).
  - Integrasikan trigger submit final:
    - Sebelum membuka `SignaturePlacementModal stage="submit"`, cek apakah drawing ini adalah “terakhir draft” untuk DRF yang sama.
    - Jika ya → tampilkan `FinalSubmitChecklistDialog`.
- `EngineeringDrfWorkPage.jsx`
  - Jadikan panel BOM dan SoDocsPanel sebagai “SO-level source of truth”.
  - Tambah indikator “TERKUNCI” saat locked.
- `SoDocsPanel.jsx`
  - Tampilkan mode terkunci (helper text + disable upload/delete) jika `canEdit=false` karena lock.

**Backend**
- `routers/drawing_register.py`
  - Biarkan `submit-for-approval` hanya mengubah status drawing, **tanpa mengunci BOM**.
- `routers/bom_attachments.py`
  - Tambah validasi lock berbasis DRF/SO:
    - Cari DRF/bom_id terkait → hitung apakah semua drawings non-draft.
    - Jika locked → tolak upload/delete attachments.
- `routers/bom.py`
  - Pastikan endpoint edit items (bulk replace) menolak jika locked.
  - Jika sebelumnya lock disamakan dengan `engineering_status=approved`, tetap pertahankan workflow BOM, tapi tambahkan gate “SO locked” sebagai guard tambahan.

**Testing (end-to-end minimal)**
- Jalankan `yarn build`.
- Gunakan frontend testing/screenshot tool:
  - Screenshot Work Group + Work Order page.
  - Uji: submit parsial, submit final, lock aktif, reject → unlock.

---

### Phase 3 — Eng Leader Review Popup (Fase 3)

**User stories (Review Popup)**
1. Sebagai Eng Leader, saya membuka popup review untuk 1 SO dan melihat semua dokumen (drawing + nesting/cad/costing + BOM).
2. Sebagai Eng Leader, saya bisa preview PDF dengan viewer existing tanpa lambat.
3. Sebagai Eng Leader, saya bisa Approve & TTD untuk item drawing dari popup.
4. Sebagai Eng Leader, saya bisa tandai OK untuk non-drawing (nesting/costing/cad) atau minta revisi.
5. Sebagai Eng Leader, saat minta revisi saya wajib mengisi catatan, dan status + riwayat tercatat.

**Frontend**
- Buat komponen `EngLeaderReviewDialog.jsx` sesuai `/app/design_guidelines.md`:
  - Kiri: tabel dense semua dokumen (status badge, search/filter).
  - Kanan: preview + aksi (Approve & TTD / Tandai OK / Minta Revisi + catatan wajib) + riwayat.
  - Semua dokumen tetap tampil walau drawing partial/TTD sudah done.
- Entry point:
  - Tombol “Review Dokumen SO” di `EngineeringDrfWorkPage.jsx` (hanya role Eng Leader).

**Backend**
- Tambah API agregasi dokumen SO:
  - `GET /drawing-requests/{drfId}/review-pack` → daftar item (drawings + bom + bom_attachments) dengan status per item.
- Tambah API aksi review non-drawing:
  - `POST /bom/{bomId}/attachments/{attachId}/review` (OK / REVISI + notes) simpan audit trail.
- Untuk drawing: gunakan endpoint existing `/drawings/{id}/approve/eng_head` dan `/drawings/{id}/reject/eng_head` dari popup.

**Testing**
- Login `riski`:
  - Buka DRF → buka popup review → approve 1 drawing + revisi 1 dokumen SO.
- Verifikasi badge/status ter-update tanpa reload penuh.

---

### Phase 4 — Hardening + Refactor + Regression

**User stories (hardening)**
1. Sebagai engineer, UI tidak membingungkan: tidak ada duplikasi BOM per drawing.
2. Sebagai QC/view-only, saya tetap bisa preview dokumen tanpa bisa edit/download (sesuai RBAC).
3. Sebagai sistem, lock/unlock konsisten walau refresh halaman.
4. Sebagai admin, saya bisa override bila diperlukan tanpa merusak audit trail.
5. Sebagai user, build produksi lokal tetap aman (tidak error saat `yarn build`).

**Langkah**
- Rapikan state derivation (single function util) untuk `locked` dan `isFinalSubmitCandidate`.
- Tambah index Mongo bila perlu (drawings by from_drf_id + approval_status) untuk hitung lock cepat.
- Tambah test backend minimal (extend `tests/backend_test_phase2.py`) untuk lock/unlock.

## 3) Next Actions (urut eksekusi)
1. Implement Phase 1 POC: endpoint status + dialog checklist + lock/unlock guard attachments.
2. Integrasikan ke V1 (Phase 2): hapus BOM per-drawing di WorkOrderPage, final submit dialog + deep-link.
3. Bangun Review Popup (Phase 3) + API review-pack.
4. Hardening + regression: `yarn build`, screenshot verification, jalankan test backend.

## 4) Success Criteria
- Engineer bisa submit drawing bertahap tanpa BOM/SO docs terkunci prematur.
- Submit drawing terakhir memunculkan dialog checklist wajib; item “belum lengkap” bisa diklik dan mengarahkan user ke tempat upload/isi.
- Setelah final submit (semua drawings non-draft): BOM & SO docs terkunci (frontend disable + backend guard).
- Jika ada reject → drawing kembali `draft` → lock otomatis terbuka.
- Eng Leader bisa review semua dokumen 1 SO dalam 1 popup, termasuk yang sudah TTD, dengan aksi approve/revisi tercatat.
