# CHANGELOG — Procurement App

## Iter 20 — DRF Refinements + Assign Engineer + Multi-Doc DC Stamp + UX Fixes (30 July 2026)

### Bug Fixes
- **DRF Inbox stuck bug**: Setelah Riski accept DRF, dokumen hilang dari inbox jika drawing belum dibuat. Fix: Backend `scope=for_engineering` sekarang include DRF `submitted` OR (`accepted` AND `linked_drawing_id` null). Tombol berubah jadi "Lanjut Buat Drawing →".
- **Request By (Sales) tidak auto-fill dari DRF**: Dropdown terbatas ke nama pendek, sedangkan DRF pass full name. Fix: ganti dropdown ke `<input list>` (datalist autocomplete) — bisa terima nama apa saja.

### Fitur Baru: Assign Engineer
- Backend: field `assigned_to_user_id`, `assigned_to_name`, `assigned_by`, `assigned_at` di drawing model
- New endpoint `GET /api/drawings/engineering-users` — list Eng users untuk dropdown
- New endpoint `POST /api/drawings/{id}/assign` — Eng Head assign engineer
- Permission logic `_can_modify_drawing()`:
  - Belum di-assign → semua Eng bisa edit
  - Sudah di-assign → hanya assignee + Eng Head + Admin
- PUT/upload/submit endpoints validate permission
- Frontend: dropdown "Assign Engineer" di form (Eng Head only), badge "👷 [Nama]" di listing drawing
- Tombol "Register Drawing Baru" DIHILANGKAN — drawing baru harus via DRF Sales

### Multi-Document DC Stamp (Salma)
- Backend endpoint `/stamp-controlled` sekarang single-target (`mks`|`customer_ref`|`extra`) dengan posisi custom per dokumen
- Auto-detect: kalau SEMUA dokumen (MKS + customer_ref + extras) sudah di-stamp → status jadi `controlled`
- Endpoint `/extras/{id}/preview` juga apply DC stamp + watermark

### UX Improvements
- **DC Stamp lebih kecil**: 130×100 → 85×65 (35% lebih kecil, tidak menutupi drawing)
- **Watermark lebih halus**: dari tile 3×3 opacity 28% → 2 baris diagonal opacity 14% color 0.88 gray (jauh lebih samar, drawing terbaca jelas)
- **Document Distribution Record UI**: Kolom "Aksi" diganti dengan list dokumen. Setiap drawing tampilkan semua attachment (MKS + Customer Drawing + Extras) sebagai baris terpisah dengan badge status "✓ STAMPED" / "⚠ BELUM" + tombol individual stamp position picker
- **StampPositionPicker refactored** — support target berbeda (mks/customer_ref/extra), pilih posisi per dokumen



Alur baru: **Drawing request STARTS from Sales**, bukan lagi langsung register di Engineering.

### Backend
- **`/app/backend/routers/drawing_requests.py`** — new router:
  - `POST /api/drawing-requests` — Sales create DRF (New Order / Repeat Order)
  - `GET /api/drawing-requests?scope={mine|for_engineering|for_sales_ttd}` — filtered listing
  - `GET /api/drawing-requests/pending-count-for-engineering` — badge count untuk Eng Portal
  - `POST /api/drawing-requests/{id}/submit` — Sales submit → auto-TTD `requested_by`
  - `POST /api/drawing-requests/{id}/accept` — Eng Head accept → auto-TTD `received_by`
  - `POST /api/drawing-requests/{id}/link-drawing` — link drawing_id back to DRF
  - `POST /api/drawing-requests/{id}/cancel`
  - Attachment endpoints: `POST/GET/DELETE /api/drawing-requests/{id}/attachments/...`
  - Form no format: `MKS-F-ENG-001/nnn/ROMAN/YYYY` (auto-increment per month)
- **`/app/backend/routers/drawing_register.py`**:
  - Added `from_drf_id` field to `DrawingIn` model
  - `POST /api/drawings` — kalau `from_drf_id` diisi → auto update DRF status → `in_progress` + set `linked_drawing_id`
  - Approve endpoint (Sales stage completion) → auto update linked DRF status → `completed`

### Frontend
- **`/app/frontend/src/pages/DrawingRequestFormPage.jsx`** — Sales list all DRF + create/edit
- **`/app/frontend/src/pages/DrawingRequestInboxPage.jsx`** — Eng Head (Riski) inbox untuk accept
- **`/app/frontend/src/components/DrawingRequestFormDialog.jsx`** — Form buat/edit DRF dengan:
  - Toggle **New Order** / **Repeat Order**
  - SO autocomplete dari `/api/sales-orders`
  - Repeat Order: pilih SO lama + SO baru + search & tag Drawing MKS lama untuk direferensikan
  - Multi-file attachment upload
  - Kotak "Requested By (Sales)" + "Received By (Eng Leader)" auto-TTD
- **Portal cards updated**:
  - **Sales Portal**: "TTD Drawing" DIGANTI dengan **"Drawing Request Form" MKS-F-ENG-001** (unified card)
  - **Engineering Portal**: "TTD Drawing" DIHAPUS, DIGANTI dengan **"Drawing Request dari Sales" MKS-F-ENG-001 Inbox** (Eng Head only)
- **`MasterDrawingPage.jsx`**:
  - Baca query params `from_drf_id, so_no, project_name, customer_name, customer_code, class_material, request_by_sales, source_drawing_id`
  - Auto-open Register Drawing form pre-filled kalau URL punya params
  - Banner emerald "📋 Drawing Request Form" di form kalau dibuka dari DRF
  - Kirim `from_drf_id` ke `POST /drawings` supaya backend link ke DRF

### Data Model
```
drawing_requests: {
  id, form_no (MKS-F-ENG-001/nnn/ROMAN/YYYY),
  request_type: "new_order" | "repeat_order",
  so_no, ref_so_no (for repeat),
  date, project_name, customer_code, customer_name,
  qty_order, unit, material, expected_due_date,
  notes, referenced_drawings [drawing_ids], attached_files [gridfs entries],
  status: "draft" | "submitted" | "accepted" | "in_progress" | "completed" | "cancelled",
  requested_by: { user_id, name, at }  # auto on submit
  received_by:  { user_id, name, at }  # auto on Eng accept
  linked_drawing_id,
  created_by, created_at, updated_at
}
```

### Complete Workflow
1. Sales buat DRF → status `draft`
2. Sales submit → auto-TTD Requested By → status `submitted`
3. Eng Head (Riski) lihat inbox → Accept → auto-TTD Received By → status `accepted` → auto-navigate ke Register Drawing form pre-filled
4. Eng buat drawing (with `from_drf_id`) → DRF status `in_progress` + `linked_drawing_id` tersimpan
5. Drawing lewat approval standard (Eng Head → QC → Sales → DC Salma)
6. Setelah Sales approve drawing → DRF status auto `completed`

---

## Iter 18 — Digital Signature TTD + Watermark Best Practice — 30 July 2026

### Backend
- **`/app/backend/utils/pdf_stamper.py`**:
  - New `_draw_placed_signature()` — overlay signature PNG di posisi x,y (0..1 relative) + size S/M/L + tanggal-jam text di bawahnya
  - `apply_stamps()` refactored — terima `signature_bytes_map: {user_id: png_bytes}` dan render per approval
  - Watermark tile pattern 3×3 diagonal 30°, opacity 28%, warna abu-abu muda — tetap terbaca drawing lines
- **`/app/backend/routers/drawing_register.py`**:
  - `ApprovalActionIn` menerima `stamp_x, stamp_y, stamp_page, stamp_size`
  - `/drawings/{id}/approve/{stage}` simpan posisi stamp di approval record
  - `/drawings/{id}/pdf-stamped` fetch signature bytes semua approver dari GridFS bucket "signatures" dan pass ke stamper
  - Fix bug: `pdf-stamped` sekarang pakai bucket "drawings" (bukan default "fs")
  - Fix `pending-my-approval` yang tidak return items (fungsi tidak lengkap)
  - Fix `_can_view` include `doc_control` role
  - `/drawings/{id}/customer-ref/preview` — customer ref juga dapat watermark untuk non-DC + audit trail log
- **`/app/backend/routers/auth.py`**:
  - New `GET /users/me/signature-meta` — return `{has_signature, signature_uploaded_at, signature_mime}`
- **`/app/backend/routers/notifications.py`**:
  - New kategori `drawing_pending_approval` untuk role eng_leader/qc/sales/doc_control

### Frontend
- **New pages**: `MyProfilePage.jsx` (upload/kelola TTD), `PendingApprovalDrawingsPage.jsx` (list drawing menunggu TTD saya)
- **New component**: `SignaturePlacementModal.jsx` — PDF viewer interaktif untuk klik posisi TTD + pilih ukuran S/M/L
- `AppShell.jsx` — tombol "🖋 TTD" di header untuk shortcut ke My Profile signature
- `DeptPortal.jsx` — support `badgeCount` prop untuk badge merah pulsing
- `MasterDrawingPage.jsx` — refactor `DrawingApprovalBadge` untuk open modal instead of window.prompt
- Portal cards `Sales/QC/Engineering` — tambah kartu "TTD Drawing" dengan badge count real-time
- New hook `useNotifCount(categoryKey)` — poll `/notifications` untuk badge

### Fix
- `App.js` ProtectedRoute — allow `/profile`, `/drawings/pending-my-approval`, `/drawings/controlled`, `/document-control/distribution` untuk semua role tanpa redirect

---

## Iter 17 — Digital Document Control Stamp + Watermark + Distribution Records — Earlier July 2026
(See PRD.md for details)
