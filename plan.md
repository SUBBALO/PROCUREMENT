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

## Tahap 2 — Rantai Sign-off Bertingkat (Leader → Produksi → QA/QC → Doc Control) — STATUS: BLOCKED (menunggu input user)
Menunggu keputusan user:
- User Produksi untuk acknowledge (belum ada akun)
- Mapping QA/QC signer ("dimas"/"salma" — dimas belum ada, salma=doc_control)
- Bentuk TTD tiap tahap (tombol digital vs stamp PDF)
- Pengiriman ke Doc Control (otomatis vs manual)

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
