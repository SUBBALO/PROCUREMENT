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
- ✅ (Tambahan sebelumnya) Document Control stamping multi-page sudah diperbaiki (DC/SO/TTD di semua halaman + picker scrollable).

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
   - ✅ Curl tests + UI tests + testing_agent (backend 94.4% success; UI 0 console errors untuk role leader & staff).

POC Exit: semua endpoints berfungsi, permission enforced, dan tidak ada regresi.

---

### Phase 2 — V1 App Development (Repeat Order + costing pull + attachment cloning)
Fokus Phase 2 (belum dikerjakan):
1. **Repeat Order workflow:**
   - Search old drawing dengan 2 metode:
     - by **Drawing No**
     - by **SO** yang berhubungan
   - Auto-pull ke DRF repeat:
     - **Nesting PDF** dan attachment terkait
     - **Costing price** dari modul **Material Costing** (per SO/drawing)
   - Jika tidak ditemukan → fallback manual multi-upload (preview/replace/delete).
2. **Repeat Order: add-new-drawing:**
   - Dalam repeat order, boleh tambah drawing baru → generate nomor baru.
   - Hanya drawing baru yang wajib TTD; drawing lama tidak perlu TTD.
3. **UI integration:**
   - Extend Work Group untuk mode repeat order:
     - panel pencarian drawing/SO lama
     - panel hasil auto-pull + mapping attachment
     - tombol “Tambah drawing baru”

End of Phase 2: repeat order end-to-end berjalan (auto-pull + fallback) dengan shared BOM.

---

### Phase 3 — Revision loop + QC/Sales/Document Control wiring + UX simplification
Fokus Phase 3 (belum dikerjakan):
1. **Revision loop Riski ↔ engineer staff:**
   - Eng Leader bisa upload multiple file revisi + catatan revisi ke eng staff.
   - Engineer revisi, replace/hapus upload, lalu resubmit.
2. **QC flow (view-only, no download):**
   - QC bisa preview **MKS drawing** + **customer drawing**, tidak ada tombol download.
   - QC TTD semua MKS drawing → submit.
3. **Sales flow:**
   - Sales TTD → popup isi data SO stamping untuk produksi (sudah ada) dan pastikan wiring halus.
4. **Document Control (Salma):**
   - Setelah 4 TTD lengkap (Eng staff, Eng leader, QC, Sales) drawing masuk Master List dan masuk queue DC.
   - DC stamp dulu → baru SO stamp produksi.
   - (Stamping multi-page sudah beres, tinggal wiring status/queue bila perlu.)
5. **ECR/ECN enhancement (opsional):**
   - Tambahkan attachments pada ECR/ECN.
   - Link ECR/ECN ke drawing/BOM target dan alur “apply change”.

---

## 3) Next Actions
1. **Rapikan navigasi Engineering:**
   - ✅ Sudah digabung jadi 1: **Work Order Engineering** (`/engineering/work-orders`), role-aware.
2. **Finalize permission & UX rules:**
   - ✅ Riski hanya assign; Work Group edit hanya assignee (Admin override).
3. **Mulai Phase 2 (Repeat Order):**
   - Implement lookup Material Costing + clone attachments.
   - Add UI panel repeat order.
4. **Mulai Phase 3:**
   - Revision loop leader↔staff.
   - QC view-only + sign.
   - Pastikan chain 4 TTD → DC stamp → SO stamp berjalan mulus.

---

## 4) Success Criteria
- ✅ Phase 1 complete:
  - DRF(New Order) dapat generate N drawings.
  - Semua drawings share 1 BOM.
  - Assignee-only edit (leader assign-only).
  - Customer DWG No tersimpan & searchable.
  - Nomor drawing bisa dicek (preview next-number + recent list).
  - Master List view-only.
  - ECR/ECN tersedia.
  - Engineering cards disederhanakan menjadi 1 entrypoint.
- ✅ No regressions: modul existing tetap berjalan; stamping multi-page sudah fixed.
- ⏳ Phase 2 + 3 complete (target berikutnya): repeat order auto-pull + revision loop + QC/Sales + DC queue/wiring end-to-end.
