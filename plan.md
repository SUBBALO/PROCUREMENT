# Rencana Pengembangan — Redesign Engineering Work Order (Partial Submit, BOM Per-SO, Review Popup, TTD)

## 1) Objectives
- Memperbaiki masalah **TTD tidak terbaca** (RISKI/approver) dan memastikan TTD tampil konsisten di aplikasi & PDF.
- Mengubah model **BOM menjadi 1 per SO/Work Group** (diisi sekali), sehingga **partial submit drawing tidak mengunci BOM**.
- Menambahkan **Reminder Popup** saat submit drawing (terutama “drawing terakhir”) untuk mengingatkan BOM & dokumen SO (Nesting/AutoCAD/Costing) sudah diisi/diupload.
- Setelah submit final, **dokumen SO tidak bisa diupload lagi** (read-only).
- Menyediakan **Popup Review Eng Leader** yang menampilkan daftar dokumen (drawing + non-drawing) untuk approve/OK atau minta revisi.
- Merapikan UX menu Work Order: hilangkan BOM dobel, menu lebih jelas bagi Engineering.

## 2) Implementation Steps

### Phase 1 — POC Core Flow (Isolasi) — “TTD terbaca end-to-end”
**Core paling riskan:** rekam/visualisasi TTD dari `approvals[]` tanpa bergantung pada placement manual + memastikan stamped PDF & UI menampilkan.
- **Websearch (best practice):** riset cepat “PDF signature block rendering without coordinates / default placement patterns” untuk PDF stamping (PyMuPDF/Reportlab).  
- Buat script uji Python: ambil 1 drawing pending (SO 003354), validasi:
  1) `approvals[]` ada untuk stage submit/eng_head,
  2) `user.signature_gridfs_id` ada,
  3) generate `/pdf-stamped` menampilkan TTD (atau minimal embed image/date) dan UI badge menampilkan “ditandatangani oleh”.
- Implement backend: 
  - Perbaiki `_sig_stamp()` agar menyimpan `signature_gridfs_id`, `has_signature`, dan `date` (fallback dari `at`).
  - Perbaiki stamper: saat `approvals` tidak kosong, stamp TTD **di signature block standar** (bukan harus placement) untuk stage yang relevan.
  - Pastikan endpoint preview/download yang mem-stamp **mengirim approvals yang benar** (jangan `approvals=[]`).
- Implement frontend: tampilkan “TTD/Disetujui oleh” berdasarkan `approvals[]` (bukan `signatures` kosong).

**User stories (Phase 1)**
1. Sebagai Eng Leader, saya ingin melihat nama  tanggal TTD saya tampil di drawing sehingga tidak ada kebingungan apakah sudah tanda tangan.
2. Sebagai QC, saya ingin melihat siapa saja yang sudah menandatangani tanpa harus membuka log.
3. Sebagai Engineer, saya ingin status approval jelas (submit/eng_head/qc/sales) dengan bukti TTD yang terbaca.
4. Sebagai Admin, saya ingin stamp PDF tetap konsisten walau user tidak klik posisi TTD.
5. Sebagai Eng Leader, saya ingin drawing SO 003354 yang sudah saya approve menampilkan TTD saya.

### Phase 2 — V1 App Development (BOM per SO + Partial Submit + Reminder)
- **Model data:** perkenalkan entitas “SO Package / Work Group” (atau gunakan dokumen existing DRF/SO) sebagai container:
  - BOM_link: 1 per SO (bom_id/bom_no)
  - SO Docs: nesting/autocad/costing (attachment per SO)
  - Status paket: draft → in_progress → submitted (final)
- **UI Work Order:**
  - Pindahkan BOM Linking/ISI BOM ke panel **SO-level** (di luar per-drawing).
  - Hapus “ISI BOM” per drawing.
  - Drawing tetap bisa partial submit per item.
- **Reminder Popup saat submit:**
  - Saat user klik “TTD & Submit” pada drawing: tampilkan checklist:
    - BOM sudah di-link? (Ya/Tidak)
    - Dokumen SO (Nesting/AutoCAD/Costing) sudah diupload? (Ya/Tidak, opsional)
  - Bahasa: “Jika tidak diperlukan, Anda boleh lanjut.”
  - Logic “drawing terakhir”: bila semua drawing di SO sudah status submitted/pending, popup menandai “ini submit terakhir” dan mengingatkan BOM.
- **Locking:**
  - Setelah paket SO “submitted final” → semua upload dokumen SO terkunci.
  - Partial submit drawing tidak mengunci BOM.

**User stories (Phase 2)**
1. Sebagai Engineer, saya ingin submit 1 drawing tanpa mengunci BOM karena masih ada drawing lain.
2. Sebagai Engineer, saya ingin BOM cukup diisi sekali per SO, tidak berulang per drawing.
3. Sebagai Engineer, saya ingin saat submit terakhir ada pengingat BOM/dokumen SO agar tidak lupa.
4. Sebagai Engineer, saya ingin bisa lanjut submit meski dokumen SO tidak diperlukan.
5. Sebagai Eng Leader, saya ingin melihat status BOM  dokumen SO langsung dari Work Order.

> Tutup Phase 2 dengan 1 kali testing agent (backend+frontend) untuk: partial submit, reminder popup, lock upload setelah final submit.

### Phase 3 — Review Popup Eng Leader (Blueprint → Implement)
- Jalankan **design_agent** untuk blueprint:
  - Popup “Review Dokumen SO” mirip Masterlist: list item (Drawing, Nesting, Customer Ref, AutoCAD, Costing, BOM).
  - Per item: 
    - Drawing: tombol **Approve+TTD** / **Minta Revisi**.
    - Non-drawing: tombol **Tandai OK** / **Minta Revisi** (engineer re-upload).
- Backend:
  - Tambah state review untuk non-drawing docs (ok/revise + notes).
  - Tambah endpoint aksi: mark_ok, request_revision (dengan notes) + notifikasi.
- Frontend:
  - Tampilkan popup dari Work Group/WO page.
  - Tampilkan catatan revisi & riwayat.

**User stories (Phase 3)**
1. Sebagai Eng Leader, saya ingin melihat semua dokumen terkait SO dalam satu popup agar review cepat.
2. Sebagai Eng Leader, saya ingin approve drawing dengan TTD langsung dari daftar.
3. Sebagai Eng Leader, saya ingin minta revisi nesting/costing tanpa harus upload sendiri.
4. Sebagai Engineer, saya ingin menerima notifikasi revisi dan upload ulang dokumen yang diminta.
5. Sebagai Admin, saya ingin jejak audit keputusan review tersimpan.

> Tutup Phase 3 dengan testing agent: review popup flows, mark ok/revise, notifikasi, RBAC.

### Phase 4 — Rapikan UX Menu Work Order (Blueprint → Implement)
- Implement perubahan UI sesuai blueprint:
  - Menu per SO: BOM  Dokumen SO (attachments)  Daftar drawing.
  - Per drawing: fokus upload PDF + submit/approval status; hilangkan BOM forms di dalam.
  - Konsistensi label Indonesia + status badges.
- Pastikan backward-compat untuk data lama (BOM per drawing) dengan migrasi ringan:
  - Jika ada bom_id di drawing lama → angkat menjadi bom_id SO-level (first non-null), tandai “migrated”.

**User stories (Phase 4)**
1. Sebagai Engineer, saya ingin halaman Work Order tidak membingungkan dan tidak ada menu dobel BOM.
2. Sebagai Engineer, saya ingin cepat menemukan upload drawing vs upload dokumen SO.
3. Sebagai Eng Leader, saya ingin review tidak perlu buka banyak halaman.
4. Sebagai QC, saya ingin mode view-only tetap bisa lihat dokumen tanpa bisa ubah.
5. Sebagai Sales, saya ingin status dokumen SO jelas tanpa melihat detail teknis.

> Tutup Phase 4 dengan testing agent regresi penuh (drawing approvals, CAR, ENG-006, viewer).

## 3) Next Actions
1. Jalankan **design_agent** untuk blueprint Phase 3/4 (popup review + layout menu WO).
2. Kerjakan Phase 1 POC: perbaiki `_sig_stamp`  stamper approvals, pastikan RISKI TTD tampil.
3. Implement Phase 2 (BOM per SO + reminder + locking) minimal viable.
4. Implement Phase 3 (review popup + endpoints + notifikasi).
5. Implement Phase 4 (UX polish + migrasi data lama).

## 4) Success Criteria
- TTD RISKI dan approver lain **terlihat** di UI dan di PDF stamped tanpa perlu placement manual.
- Partial submit drawing **tidak mengunci BOM**; BOM 1 per SO, tidak ada input BOM di tiap drawing.
- Saat submit terakhir: popup pengingat BOM  dokumen SO muncul, user bisa lanjut bila tidak perlu.
- Setelah final submit: upload dokumen SO terkunci; audit trail jelas.
- Popup review Eng Leader berfungsi: approve drawing + minta revisi non-drawing (engineer upload ulang).
- Tidak ada regresi pada modul CAR, ENG-006, viewer, dan approval flow existing.
