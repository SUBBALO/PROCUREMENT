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

## Tahap 3 — Rantai TTD (Produksi -> QA/QC -> Doc Control) — STATUS: BLOCKED (menunggu info akun user)

## Backlog (Upcoming)
- P1 ECR vs ECN logic
- P2 Repeat Orders auto-pull old data
- P3 Universal image-based PDF viewer
- P4 Excel-to-Image preview
- P5 Legacy Data Bulk Import

## File Kunci
- `frontend/src/components/EcnRevisionModal.jsx`
- `frontend/src/pages/EngineeringWorkOrderPage.jsx`
- `backend/routers/drawing_register.py` (endpoint request-revision & revision-decision)

## Akun Test
- `trisna` / `eng123` (eng_staff), `engstaff` (eng_staff)
- `riski` / `eng123` (eng_leader)
- `qcuser` (qc), `salma` (doc_control)
