# Rencana Pengembangan — Alur ECN (Engineering Change Notice)

Bahasa aplikasi & komunikasi: **Indonesia**.

## Konteks
Alur revisi drawing menggunakan Form ECN (MKS-F-ENG-004) dengan rantai persetujuan bertingkat:
1. Eng Staff menyiapkan Form ECN
2. Head/Leader Eng meng-approve
3. Setelah IFU → minta TTD Produksi untuk acknowledge
4. Lanjut ke QA/QC (sign)
5. Drawing revisi + Form ECN dikirim ke Document Control

## Tahap 1 — Integrasi Modal ECN (Staff → Leader) — STATUS: COMPLETED
- [x] Wire `EcnRevisionModal.jsx` ke `EngineeringWorkOrderPage.jsx`
- [x] Section "Ajukan ECN" tampil saat drawing sudah tidak draft (controlled/released/pending) untuk role Engineering
- [x] Banner status pengajuan ECN (pending/approved/rejected) + catatan keputusan
- [x] Backend `POST /drawings/{id}/request-revision` (Staff) & `POST /drawings/{id}/revision-decision` (Leader) tervalidasi via curl
- [x] Verifikasi UI via screenshot (modal terbuka penuh)

## Tahap 2 — Alur Revisi ECN End-to-End — STATUS: COMPLETED
- [x] Approve ECN = gate (tidak langsung draft); status tetap controlled/released
- [x] `POST /drawings/{id}/start-revision` — snapshot history (data lama TIDAK dihapus), rev_no+1, reset TTD, buka draft
- [x] Proteksi anti-hapus file lama yang ada di history
- [x] `GET /drawings/eng-designers` untuk filter
- [x] `GET /ecn-register` — agregasi ECN (revisi drawing) + ECR/ECN lama (db.ecns)
- [x] Pembatasan OWNER: hanya engineer yang menggambar drawing (designer/assignee) yang boleh ajukan/mulai revisi (admin override)
- [x] Work Order: gate "Lanjut Kerja" (pending/approved/in_progress/rejected panels)
- [x] Master Drawing List: tombol "Ajukan ECN" (owner-only) di popup + filter Designer & "Drawing Saya"
- [x] Menu lama "Perubahan ECN/ECR" -> "Master List ECN & ECR" (read-only record)
- [x] Testing agent 17/17 pass + verifikasi manual owner check

## Tahap 3 — Rantai TTD (Produksi -> QA/QC -> Doc Control) — STATUS: COMPLETED
- [x] Akun: agus (produksi/kepala produksi), prodstaff (produksi), qcuser (qc) + TTD PNG
- [x] `POST /drawings/{id}/ecn-ack` — berurutan Produksi->QA/QC->auto Doc Control, role-gated
- [x] `GET /drawings/{id}/ecn-ack-state` & `GET /drawings/ecn-pending-ttd` (queue per role)
- [x] Work Order: panel Acknowledgment ECN (TTD PNG + tanggal/jam)
- [x] Halaman `/ecn-ttd` (universal) + kartu di Portal QC & Produksi (badge count)
- [x] Portal Produksi baru + entry di Landing; drawing revisi pakai alur TTD normal (QC review)
- [x] History Revisi Viewer (buka/unduh PDF versi lama) di Work Order

## Tahap 4 — Inbox TTD Tunggal (semua dept) — STATUS: COMPLETED
- [x] `/drawings/pending-my-approval` jadi "Menunggu TTD Saya": Drawing + ECN dalam satu halaman
- [x] Section ECN inline (TTD digital) + tabel Drawing (review+TTD/Reject) + empty-state gabungan
- [x] Portal QC & Produksi: satu kartu "Menunggu TTD Saya" (badge = drawing+ECN)
- [x] Testing agent 14/14 pass (ack chain, sequential, role perms, owner restriction)

## Tahap 5 — Review ECN, Bukti PDF, Notifikasi, Ringkasan, Filter — STATUS: COMPLETED
- [x] QC portal: kartu 'Riwayat TTD Saya' dihapus (sudah jadi tab di inbox TTD)
- [x] Modal Review ECN: WAJIB lihat isi ECN + Drawing + centang konfirmasi sebelum TTD (tidak bisa klik buta)
- [x] Lembar Acknowledgment ECN (PDF, MKS-F-ENG-004) + stamp PNG TTD Produksi & QA/QC sebagai bukti resmi (`GET /drawings/{id}/ecn-sheet`)
- [x] Notifikasi TTD ke Produksi/QA-QC (kategori 'ecn_ttd' di bell)
- [x] Ringkasan ECN di dashboard Eng Head (menunggu Produksi/QA/QC/selesai)
- [x] Register: kolom Timeline (Reg -> Mulai -> Selesai/IFU -> Distribusi Doc Control) + progress TTD
- [x] Register: filter status + rentang tanggal
- [x] Tgl selesai revisi ditangkap saat drawing jadi controlled (IFU)

## Tahap 6 — Stabilitas Preview Inline (Fix Bug Iframe 500) — STATUS: COMPLETED
**Tujuan:** memastikan tab "Drawing (MKS)" di `EcnReviewModal` tidak pernah memunculkan error 500 walaupun file MKS kosong/rusak.
- [x] Root cause teridentifikasi: `pymupdf.FileDataError: Failed to open stream` saat `fitz.open(stream=pdf_bytes)` menerima bytes non-PDF/invalid
- [x] Harden endpoint `GET /api/drawings/{id}/pdf-stamped` agar **anti-gagal** untuk kebutuhan iframe preview
- [x] Tambah helper `_placeholder_pdf()` (1 halaman A4) dengan pesan ramah Bahasa Indonesia
- [x] Perilaku baru:
  - Jika drawing tidak ditemukan / `file_id` kosong / file tidak bisa dibaca / bukan PDF valid / stamping gagal → **HTTP 200** + PDF placeholder (bukan 404/500)
  - Jika file valid → tetap mengembalikan PDF hasil stamping seperti sebelumnya
- [x] Tambah fallback konversi file Office (legacy import) → PDF bila memungkinkan sebelum stamping
- [x] Verifikasi via curl:
  - drawing tanpa file → HTTP 200, `application/pdf`, placeholder ~1.7KB, magic bytes `%PDF-`
  - drawing dengan file valid → HTTP 200, `application/pdf`, stamped PDF ~13KB
- [x] Verifikasi via UI: modal review terbuka & tab "Drawing (MKS)" dapat dibuka tanpa error 500/Internal Server Error

## Kredensial TTD (final)
- agus / AgusMks2026 (Produksi - Kepala Produksi)
- prodstaff / ProdMks2026 (Staff Produksi)
- qcuser / QcMks2026 (QA/QC)

## Backlog (Upcoming)
### P1 — ECR vs ECN logic (Desain & Implementasi)
- [ ] Definisikan aturan bisnis final (kapan ECR dipakai, kapan ECN dipakai; dampaknya ke repeat order vs workflow aktif)
- [ ] Model status/flow ECR (request-only) terpisah dari ECN (notice + distribusi + TTD)
- [ ] Update UI register "Master List ECN & ECR" agar pembedaan jelas (label, filter, timeline)
- [ ] Migrasi/normalisasi data legacy ECR/ECN lama bila dibutuhkan

### P2 — Repeat Orders auto-pull old data (Phase 2)
**Catatan:** butuh klarifikasi desain sebelum coding.
- [ ] Tetapkan definisi "Repeat Order" (berdasarkan SO? customer+part? drawing_no?)
- [ ] Tentukan data apa saja yang di-*pull* otomatis (BOM, drawing link, routing approval, catatan QC, dsb)
- [ ] Tentukan aturan override: kapan user boleh edit vs view-only
- [ ] Rancang endpoint backend + perubahan UI pada pembuatan order/DRF
- [ ] Uji dengan data SO lama + validasi audit trail

### P3 — Universal image-based PDF viewer
**Tujuan:** viewer konsisten (render halaman sebagai gambar) untuk menghindari variasi dukungan PDF viewer browser + kontrol UI (tanpa tombol download bila view-only).
- [ ] Tentukan pendekatan render: server-side (PyMuPDF → PNG per halaman) vs client-side
- [ ] Endpoint: render page-by-page, caching, proteksi RBAC, watermark/footnote
- [ ] Integrasi ke modal review (ECN/Drawing) dan halaman view-only (QC/DC)

### P4 — Excel-to-Image preview
- [ ] Tentukan format file yang didukung (.xlsx, .xls)
- [ ] Pipeline konversi: Excel → PDF → PNG (atau langsung ke gambar)
- [ ] Preview inline (tanpa download) + RBAC

### P5 — Legacy Data Bulk Import
- [ ] Template import + validasi
- [ ] Mapping field ke schema `drawings` + `revisions`
- [ ] Import file ke GridFS + indexing + audit trail

## File Kunci
- `frontend/src/components/EcnRevisionModal.jsx`
- `frontend/src/components/EcnReviewModal.jsx`
- `frontend/src/pages/EngineeringWorkOrderPage.jsx`
- `frontend/src/pages/PendingApprovalDrawingsPage.jsx`
- `backend/routers/drawing_register.py` (endpoint ECN & `pdf-stamped` hardened)
- `backend/utils/pdf_stamper.py`

## Akun Test
- `trisna` / `eng123` (eng_staff), `engstaff` (eng_staff)
- `riski` / `eng123` (eng_leader)
- `qcuser` (qc), `salma` (doc_control)
