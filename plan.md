# Engineering Workflow Redesign Plan (MKS ERP)

## 1) Objectives
- Implement **Phase 1 (New Order)**: 1 DRF can contain **multiple drawings** but **exactly 1 shared BOM**; only assigned engineering staff can edit.
- Add **multi-document upload** for engineering work (MKS drawing, customer drawing, nesting + other attachments) with **preview / replace / delete** before submit.
- Ensure **digital signature (TTD) per NEW MKS drawing** before submit to Eng Leader.
- Keep existing modules working (Sales DRF, approvals, DC stamping, Store/Purchasing, etc.), no env URL changes.

---

## 2) Implementation Steps

### Phase 1 — Core Workflow POC (isolation, must pass before full UI)
**Core = “DRF(New Order) → assign → generate N drawings → 1 shared BOM → multi-upload per drawing → TTD per new MKS drawing → submit to Eng Leader”.**

POC Steps (backend-first, minimal):
1. **Model additions (non-breaking):**
   - Add `drf_id` and `work_group_id` (or `drawing_group_id`) to drawing records.
   - Add `bom_id` (shared) on DRF or group doc.
   - Add `assigned_engineer_id` on DRF (single assignee) to enforce edit rights.
2. **New endpoints (POC scope):**
   - `POST /drawing-requests/{id}/assign-engineer` (Eng Leader only): set assignee.
   - `POST /drawing-requests/{id}/new-order/init` (assigned engineer): create N drawing stubs, reserve numbers.
   - `GET /drawing-requests/{id}/work` (view): return DRF + drawings + BOM id + attachments status.
3. **Uploads (POC scope, reuse existing):**
   - For each drawing: keep `file_id` as **MKS drawing** (single latest), `customer_ref_file_id` as **customer drawing** (single latest), `additional_files[]` as **multi-attachments** (nesting + others).
   - Add ability to **delete/replace**: implement delete endpoints for main MKS file and extras if missing.
4. **TTD requirement (POC scope):**
   - Before submit-to-leader, validate: each NEW drawing has MKS PDF uploaded and has `approvals` entry for stage `submit` (engineer TTD).
5. **POC test script:**
   - Seed DRF(new_order) → assign → init N=3 → upload MKS + nesting → sign each → submit → assert status transitions.

POC Exit: all endpoints work with real files, permissions enforced, no regressions in existing drawing endpoints.

---

### Phase 2 — V1 App Development (Phase 1 features in full UI)
User stories (Phase 2):
1. As Sales, I can create and submit a New Order DRF so Engineering can start work.
2. As Eng Leader, I can accept a DRF and assign exactly one engineer without filling other fields.
3. As assigned engineer, I can specify “jumlah drawing” and the system generates multiple drawing numbers under one DRF.
4. As assigned engineer, I can upload multiple files (nesting + docs) and preview/replace/delete before submitting.
5. As assigned engineer, I must digitally sign each NEW MKS drawing before I can submit to Eng Leader.

Implementation:
1. **Backend (complete Phase 1):**
   - Finalize DRF fields: `assigned_engineer_id`, `assigned_engineer_name`, statuses: `accepted` → `in_progress` → `submitted_to_leader`.
   - Enforce permissions: only assignee can mutate BOM/uploads; others view-only.
   - Add missing endpoints for file management (replace/delete MKS PDF, delete extras) if not present.
2. **Frontend (Engineering portal cleanup for Phase 1):**
   - Create a single “**Drawing Work Inbox**” for assigned engineer: list DRF assigned to me.
   - Add “**Work Detail**” page per DRF:
     - Section A: Generate drawing count → show list of drawings with numbers.
     - Section B: Shared BOM editor (existing BOM page embedded or linked).
     - Section C: Per-drawing upload panel:
       - MKS drawing upload (replace)
       - Customer drawing upload (replace)
       - Nesting/attachments multi-upload (add, preview, delete)
     - Section D: TTD per drawing using existing signature placement modal (page selection already supported).
     - Section E: Submit button with clear validation errors.
3. **Incremental tests:**
   - UI happy-path: assigned engineer completes DRF with 2 drawings.
   - Permission test: other engineer can view but cannot edit.

End of Phase 2: one full New Order flow works end-to-end.

---

### Phase 3 — Add more features (Repeat Order + revision loop + QC/Sales + UI simplification)
User stories (Phase 3):
1. As engineer, I can create Repeat Order by searching old drawing no/SO and auto-pull nesting + costing into new work.
2. As engineer, if auto-pull fails, I can manually upload required docs with preview/replace/delete.
3. As engineer, I can add a NEW drawing to repeat order (generate number) and only that new drawing requires TTD.
4. As Eng Leader, I can send revision notes + multiple revised files back to engineer, and engineer can resubmit.
5. As QC, I can preview (no download) MKS + customer drawings and digitally sign all MKS drawings.

Implementation outline:
- Repeat Order: integrate with Material Costing module lookup and attachment cloning.
- Revision loop: leader attachments + notes + status transitions.
- QC view-only PDF (hide download) + watermark; QC signature stage.
- Engineering portal cards/menu: consolidate to 3–4 key entrypoints (Inbox, Work Detail, My Assignments, Master/Archive).

---

## 3) Next Actions
1. Confirm naming/statuses for DRF workflow (accepted/in_progress/submitted_to_leader/etc.).
2. Implement Phase 1 POC endpoints + DB fields (non-breaking).
3. Write and run the Phase 1 POC script until pass.
4. Build Phase 2 UI screens around the proven backend.
5. Run end-to-end testing (Sales → Leader assign → Engineer work → submit).

---

## 4) Success Criteria
- Phase 1: One DRF(New Order) can generate N drawings, share one BOM, accept multi-upload with preview/replace/delete, enforce assignee-only edit, and require TTD per new MKS drawing before submit.
- No regressions: existing drawing register, approvals, DC stamping, and other departments remain functional.
- UX: Engineering entrypoints are simplified (single inbox + single work detail page covers most work).
