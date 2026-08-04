# plan.md — Modul NONCONFORMANCE (CAR)

## 1) Objectives
- Menyediakan modul **NONCONFORMANCE (CAR)** yang berlaku untuk **semua departemen** (universal) berbasis form resmi **MKS-F-QAD-004 Rev.02**.
- Semua user (authenticated) dapat membuat CAR dan menentukan **Ditujukan Ke**:
  - **Departemen (wajib)**
  - **User spesifik (opsional)**
- Mendukung objek NC yang fleksibel (link sesuai apa yang kena NC):
  - **Drawing**, **SO**, **Produk/Part**, **Supplier/Vendor**, **Proses/Umum**.
- Menyediakan alur status: **Open → Assigned → In Progress → Closed**.
  - **Investigation (Section 2)** diisi oleh **dept/user tujuan**.
  - **Closed** dilakukan oleh **penerbit / QA / Admin**.
  - **Assign step terpisah ditiadakan** (cukup “Issued To”/dept-user pada saat penerbitan).
- Mengubah **KPI #1** agar menghitung “Drawing tanpa NC” berdasarkan **record CAR bertipe Drawing** (bulan CAR diterbitkan) dengan auditability (numerator/denominator + daftar record + `nc_nos`).
- Menyediakan **masterlist CAR universal** (1 menu khusus CAR) + akses dari LandingPage dan portal terkait.
- Mendukung lampiran bukti + **preview image-based** (konsisten dengan viewer PDF/Office yang sudah ada).
- Menyediakan endpoint ringkas untuk pencatatan **Internal Engineering Process (MKS-F-ENG-006)** khusus tab NC.

> Status saat ini: **SELESAI & TERUJI** (backend + frontend). Data testing sudah dibersihkan.

---

## 2) Implementation Steps

### Phase 1 — Core Flow POC (Backend saja, minimal tapi end-to-end)
**User stories (POC)**
1. Sebagai user (semua dept), saya bisa membuat CAR dan menautkan objek NC (Drawing/SO/Produk/Supplier/Proses).
2. Sebagai user, saya bisa melihat daftar CAR dan statusnya.
3. Sebagai dept/user tujuan, saya bisa mengisi investigasi (Root Cause, Corrective/Preventive Action).
4. Sebagai penerbit/QA/Admin, saya bisa menutup CAR (Closed) dan menyimpan referensi ECN bila terkait drawing.

**Langkah implementasi** *(COMPLETED)*
- DB + Model
  - Tambah koleksi `nonconformances`.
  - Nomor CAR resmi: `MKS-QA-CAR-{ROMAN_BULAN}-{YY}-{NNN}` (counter per tahun).
  - Field utama (diringkas):
    - Header: `issued_by`, `issued_at`, `issuer_dept` (otomatis dari role), `issued_to_dept` (wajib), `issued_to_user` (opsional), `expected_reply_date`.
    - Link objek: `link_type` ∈ {`drawing`,`so`,`product_part`,`supplier`,`process_general`}
      - `drawings[]/drawing_nos[]` jika `link_type=drawing`
      - `so_no` untuk tipe `so` (atau opsional untuk tipe lain)
      - `object_ref` untuk tipe non-drawing
    - Section 1: `title`, `description`, `source` (in_house/external), `severity`.
    - Section 2: `investigation` (root_cause, immediate_action, corrective_action, **preventive_action**, completed_by/date, dept_head_name/date, ecn_no).
    - Section 3: `closeout` (initiator_remarks, risk_review, risk_attached, effectiveness_reviewed_by/date, qa_approved_by/date).
    - Status: `open/assigned/in_progress/closed` + `timeline[]`.
- Router
  - Buat `/app/backend/routers/nonconformance.py`:
    - `POST /api/nonconformance` (semua user)
    - `GET /api/nonconformance` (filter: status, issuer_dept, issued_to_dept, link_type, q, month)
    - `GET /api/nonconformance/{id}`
    - `POST /api/nonconformance/{id}/status`
    - `POST /api/nonconformance/{id}/investigation`
    - `POST /api/nonconformance/{id}/closeout`
    - Lampiran: `GET/POST/DELETE /api/nonconformance/{id}/attachments` + preview page-meta/page-image
    - Utility: `GET /api/nonconformance/departments`, `GET /api/nonconformance/assignable-users?dept=...`
    - ENG-006: `GET /api/nonconformance/eng006-nc-log`
  - Router sudah di-include di `server.py`.
- Indexes
  - Index dibuat untuk `issued_at`, `status`, `issuer_dept`, `issued_to_dept`, `drawing_nos`, `assigned_to.id`, `issued_by.id`, `nc_attachments.nc_id`.
- Testing (backend)
  - Test otomatis sudah ada dan lolos (script/pytest).

### Phase 2 — V1 App Development (MVP UI + KPI wiring)
**User stories (V1)**
1. Sebagai user, saya bisa akses **Masterlist CAR** dan menerbitkan CAR sesuai form resmi.
2. Sebagai dept/user tujuan, saya bisa mengisi Section 2 (Investigation) dan mengubah status.
3. Sebagai penerbit/QA/Admin, saya bisa menutup (Closed) dan mengisi closeout.
4. Engineering KPI #1 otomatis berubah hanya berdasar CAR bertipe drawing yang diterbitkan bulan itu.

**Langkah implementasi** *(COMPLETED)*
- KPI #1 (backend)
  - Update `/app/backend/routers/kpi.py`:
    - KPI `drawing_customer_nc`: drawing ber-NC jika ada record **nonconformance link_type=drawing** di bulan yang sama (`issued_at` YYYY-MM).
    - Records tetap auditable: `ref`, `ok`, `note`, `date`, `nc_ids`, `nc_nos`.
- Frontend
  - `NonconformanceMasterlistPage.jsx`: tabel, filter, status pills, kolom Ditujukan Ke + Objek NC.
  - `CarCreateModal.jsx`: create sesuai form (Issued To dept+user, kategori objek, drawing multi-select bila perlu).
  - `CarDetailModal.jsx`: tampilan 3 section (S1/S2/S3), lampiran + preview image-based, timeline, update status.
- Navigasi
  - Route `/nonconformance` sudah terdaftar dan di-whitelist (universal page).
  - Menu universal ditambahkan ke **LandingPage**.
  - Kartu portal: QC/Produksi/Sales/Engineering sudah mengarah ke masterlist.

### Phase 3 — Form NCR sesuai template + Attachments + Hardening
**User stories (Phase 3)**
1. Field CAR mengikuti urutan/label form resmi MKS-F-QAD-004 Rev.02.
2. Lampiran bukti bisa diupload dan dipreview tanpa download (viewer image-based).
3. Audit trail jelas (timeline + activity log).

**Langkah implementasi** *(COMPLETED)*
- Template form resmi sudah diterima dan diimplementasikan ke schema + UI.
- Attachments sudah memakai GridFS bucket `nc_attachments` + page-meta/page-image untuk preview.
- Observability: `log_action` dipakai di create/assign(status lama)/status/investigation/closeout.

---

## 3) Next Actions
> Modul CAR sudah selesai. Berikut kandidat pengembangan lanjutan (opsional/next iteration):
1. **Masterlist link dari semua portal yang tersisa** (Purchasing/Store/Document Control bila diperlukan) untuk konsistensi navigasi.
2. **Export/Print CAR ke PDF** dengan layout resmi MKS-F-QAD-004 (kop surat, sign/date blocks, page break, lampiran opsional).
3. Buat halaman UI untuk **ENG-006 (Internal Engineering Process) tab NC**:
   - Tabel log dari endpoint `/api/nonconformance/eng006-nc-log` + filter bulan + export Excel/PDF.
4. Penambahan fitur notifikasi (opsional):
   - Notifikasi ke dept/user tujuan saat CAR diterbitkan.
   - Notifikasi ke penerbit saat status berubah/closed.

---

## 4) Success Criteria
*(Sudah terpenuhi)*
- Backend: CAR bisa dibuat oleh semua user, bisa link sesuai kategori objek, status flow berjalan, aturan close sesuai (penerbit/QA/Admin).
- KPI #1: numerator/denominator + records audit konsisten; hanya CAR bertipe Drawing memengaruhi KPI.
- Frontend: masterlist + create + detail (3 section) + lampiran preview + timeline berjalan.
- Testing: backend automated tests **PASS**; testing agent **100% (33/33)**; tidak ada bug terbuka; data testing dibersihkan.
- Tidak ada regresi di modul Engineering KPI Dashboard, Excel preview (LibreOffice prewarm), dan portal yang sudah ada.
