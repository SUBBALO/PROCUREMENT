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

### Phase 2 — Repeat Order Auto-Pull + QC View-Only + TTD (IN PROGRESS)

**Keputusan user (konfirmasi terbaru):**
- Sumber pencarian repeat order: **kombinasi SO + Drawing No**.
- Yang di-auto-pull: **Drawing + BOM + Nesting + Costing** → di-copy & auto-attach, autofill di BOM, **editable bila Qty berubah**.
- Bila data lama tidak ketemu: **tampilkan form upload manual** (pakai flow generate/upload yang sudah ada).
- QC: hanya bisa lihat **MKS drawing + Customer drawing** (view-only, **tanpa tombol download**), lalu **TTD**.
- Setelah QC TTD → **lanjut ke Sales** (sudah sesuai chain: pending_qc → pending_sales).

**Pendekatan implementasi (reuse infra teruji):**
1. **Backend — Repeat Order:**
   - `GET /drawings/repeat-search?q=` → cari drawing lama via drawing_no / customer_drawing_no / SO / project / customer, balikkan info + bom_id/bom_no + indikator MKS/Cust/Nesting/Costing.
   - `POST /drawing-requests/{drf_id}/pull-repeat` (assignee/admin) → clone N drawing lama menjadi drawing baru di DRF ini:
     - Drawing pertama: `create_drawing` mode `create_new` + `source_bom_id` (clone item BOM + bom_attachments incl costing→costing_prev). Sisanya link ke shared BOM.
     - Clone file level-drawing (file_id MKS, customer_ref_file_id, additional_files) sebagai reference-copy.
     - Tandai `is_repeat_pulled`, `pulled_from_drawing_no`.
   - Reuse `create_drawing(DrawingIn(..., source_bom_id=...))` yang sudah ada.
2. **Frontend — Repeat Order Panel** di `EngineeringDrfWorkPage`:
   - Ganti banner "Fase 2 coming" dengan panel: cari SO/DWG lama → pilih → **Tarik Otomatis**.
   - Fallback: tetap ada panel Generate/Upload manual (yang sudah ada) bila tidak ketemu.
3. **Frontend — QC View-Only:**
   - `PendingApprovalDrawingsPage` dibuat role-aware: untuk role `qc`, ganti link "View PDF" (bisa di-download) dengan **modal preview embed** (MKS stamped + Customer ref) memakai `#toolbar=0&navpanes=0` → tanpa tombol download. Tetap ada TTD & Approve + Reject.
   - Role lain tetap perilaku existing (tidak diubah).

End of Phase 2: repeat order auto-pull + fallback berjalan; QC preview view-only tanpa download + TTD → Sales.

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
