# Rencana Implementasi Transfer Request Form (CRF‑TT) + HRIS (Payroll/HR)

> Dokumen plan ini awalnya fokus TRF. Modul HRD/Payroll sempat dibangun di ERP sebagai tahap persiapan, namun **keputusan final**: HRD menjadi aplikasi terpisah bernama **HRIS (HR Information System)**. Karena itu, **modul HRD sudah dihapus total dari ERP** setelah dibuat **paket port**.

---

## 1) Objectives

### A. Transfer Request Form (CRF‑TT) — ERP
- Menyediakan fitur **Transfer Request Form (CRF‑TT)** untuk pengajuan pembayaran ke Finance.
- Mendukung **1 form berisi banyak vendor** dan **banyak baris pembayaran**.
- **Nomor rekening per baris** (auto-fill dari Master Bank Vendor, tetap bisa diedit).
- Pajak **fleksibel per baris** (toggle taxed + input persentase PPh).
- Mendukung pembayaran **valas** dengan **rate** dan **fee bank**.
- Output minimal:
  - Buat form;
  - Cetak PDF;
  - Master List TRF.
- Format nomor (reset tiap bulan): `005/CRF-TT/VIII/2026`.

### B. HRIS (HR Information System) — aplikasi terpisah
- Membangun aplikasi HRIS terpisah (DB/URL/login terpisah dari ERP) yang mencakup:
  - Payroll/Slip Gaji berbasis upload Excel konsultan;
  - Master Karyawan;
  - Email blast slip gaji (Gmail SMTP App Password) + status per karyawan;
  - Log akses/aktivitas;
  - Roadmap HR: Absensi, Cuti, Kontrak Kerja, Arsip Dokumen Karyawan, Dashboard HR.
- **Catatan status**: HRIS **belum dibuat sebagai proyek Emergent baru**; yang sudah tersedia adalah **paket port** dari modul payroll yang sudah teruji.

---

## 2) Implementation Steps

### Phase 1 — Backend API + PDF (TRF MVP)
**User stories (MVP)**
1. Purchasing dapat membuat TRF dengan beberapa baris pembayaran.
2. Saat mengetik vendor, sistem menampilkan rekomendasi rekening bank vendor yang sudah pernah tersimpan.
3. Sistem menghasilkan nomor TRF otomatis sesuai format.
4. Purchasing dapat mencetak TRF menjadi PDF.

**Langkah teknis**
- Backend: `backend/routers/transfer_requests.py`
  - Master Bank Vendor:
    - `GET /api/vendor-banks?q=&limit=`
    - `POST /api/vendor-banks` (upsert by vendor_name)
  - Transfer Requests:
    - `GET /api/transfer-requests/next-no`
    - `GET /api/transfer-requests`
    - `POST /api/transfer-requests`
    - `GET /api/transfer-requests/{id}`
    - `DELETE /api/transfer-requests/{id}`
    - `GET /api/transfer-requests/{id}/pdf` (ReportLab A4 landscape)
- Registrasi router di `backend/server.py`.

**Status**: ✅ **Selesai** (agent-verified via curl)

---

### Phase 2 — Frontend Page + Purchasing Portal Integration (TRF)
**User stories**
1. Purchasing melihat kartu TRF dan masuk halaman TRF.
2. Halaman TRF punya 2 tab: Buat TRF + Master List.
3. Admin bisa hapus TRF.

**Langkah teknis**
- `frontend/src/pages/TransferRequestPage.jsx`
- Route di `frontend/src/App.js`
- Kartu di portal (Landing / Transfer-Finance placement sesuai keputusan user)

**Status**: ✅ **Selesai** (compile + UI flow + PDF open verified)

---

### Phase 3 — Hardening + E2E Verification + Cleanup (TRF)
**Status**: ✅ **Selesai** (E2E save/list/detail/delete + PDF OK, cleanup DB done)

---

### Phase 4 — HRD Payroll (dibangun dulu di ERP, kemudian dibuat paket port)
> Phase ini historis: modul payroll HRD sempat dibangun dan diverifikasi, lalu **dipaketkan untuk port** dan **dihapus total dari ERP** karena HRD akan berdiri sebagai HRIS.

**Fitur yang sudah teruji saat masih ada di ERP**
1. Master Karyawan (nama, NIK, jabatan, email, bank, no rekening).
2. Upload Excel konsultan:
   - Sheet per-karyawan dengan marker `A5 = "SLIP GAJI"`.
3. Slip gaji lengkap:
   - Penghasilan + qty
   - Pengurangan + qty/unit
   - Box rate (Perhari, Lembur/Jam, T. Kehadiran)
   - Terbilang
   - Pembulatan/Take Home Pay diambil dari Excel
4. PDF slip sesuai template (rapi, lengkap), footer sistem (timestamp WIB + printed_by) dan **tanpa tanda tangan basah**.
5. Gmail SMTP blast + status `belum/terkirim/gagal` + error.
6. Keamanan:
   - Permission granular ala Accurate per menu (View/Create/Edit/Delete/Report)
   - Two-tier PIN:
     - PIN Portal (per-user)
     - PIN Gaji (khusus menu gaji)
7. Log akses: buka portal, PIN salah, set/reset PIN, import, blast.

**Status**: ✅ **Selesai & terverifikasi (saat masih di ERP)**

---

### Phase 5 — Paket Port HRIS dibuat + Modul HRD dihapus dari ERP
**Tujuan**
- Menyiapkan modul payroll sebagai paket port agar bisa dipindahkan ke proyek HRIS baru.
- Menghapus seluruh jejak HRD dari ERP agar ERP kembali bersih.

**Langkah teknis**
1. Buat paket port di:
   - `/app/hris_module/`
     - `backend/hrd.py`
     - `backend/auth_permission_snippets.py`
     - `frontend/HrdPortalPage.jsx`
     - `frontend/HrdAccessMatrix.jsx`
     - `reference/Gaji_Trial.xlsx`
     - `README_PORT.md` (prompt siap-paste + aturan bisnis)
2. Hapus modul HRD dari ERP:
   - Backend:
     - Hapus `backend/routers/hrd.py`
     - Hapus registrasi router HRD di `backend/server.py`
     - Revert perubahan `backend/models.py` (hapus field `access` dari UserCreate/UserUpdate)
     - Revert perubahan `backend/routers/auth.py` (hapus role `hrd` + pengembalian/persist `access`)
   - Frontend:
     - Hapus `frontend/src/pages/HrdPortalPage.jsx`
     - Hapus route `/hrd` + gating role `hrd` di `frontend/src/App.js`
     - Hapus kartu HRD di `frontend/src/pages/LandingPage.jsx`
     - Revert editor permission matrix HRD di `frontend/src/pages/AdminPage.jsx`
3. Bersihkan database ERP:
   - Drop koleksi: `hrd_payslips`, `hrd_employees`, `hrd_settings`
   - Hapus user: `herliana`, `heri`
   - Unset field `access`, `hrd_pin_hash`, `hrd_pin_updated_at` dari semua user
   - Hapus log `activity_logs` dengan prefix action `hrd_*`
4. Verifikasi akhir ERP:
   - Frontend compile OK
   - Backend restart OK
   - `/api/hrd/*` = 404
   - Landing ERP tampil normal tanpa kartu HRD

**Status**: ✅ **Selesai & terverifikasi**

---

### Phase 6 — HRIS Project Baru (Next)
**User stories (Payroll MVP di HRIS)**
1. HRD masuk ke HRIS (login terpisah) dan bisa atur PIN portal per-user.
2. Menu gaji terkunci PIN Gaji (khusus Bu Lia/Herliana).
3. Upload Excel konsultan → slip gaji terbentuk otomatis → PDF rapi.
4. Blast email slip (Gmail SMTP) + status per karyawan.
5. Log akses/aktivitas tersedia.

**Langkah teknis**
1. User push ERP repo ke GitHub (sebagai arsip  back-up kode).
2. Buat proyek Emergent baru: **Start New Task “HRIS”** (FastAPI + React + MongoDB).
3. Di HRIS:
   - Pull repo/ambil paket `/app/hris_module/` (copy ke proyek baru).
   - Ikuti `hris_module/README_PORT.md` untuk:
     - pasang `backend/routers/hrd.py`
     - adaptasi auth/models/deps/security sesuai snippet
     - pasang UI `HrdPortalPage.jsx` + matrix editor
4. Pastikan:
   - DB HRIS terpisah dari ERP
   - URL/deploy HRIS terpisah
5. Setelah payroll stabil, mulai modul Dokumen HRD:
   - Absensi, Cuti, Kontrak, Arsip, Dashboard.

**Status**: ⏳ **Next**

---

## 3) Next Actions (eksekusi terdekat)

1. User **push ERP ke GitHub** (repo penuh tidak masalah; HRD sudah dihapus dari ERP).
2. Dari Home Emergent: **Start New Task → HRIS**.
3. Saat task HRIS aktif:
   - Copy/pull paket `hris_module/` dan jalankan langkah port sesuai `README_PORT.md`.
4. Setelah HRIS hidup:
   - Konfigurasi Gmail sender + App Password melalui UI Settings HRIS
   - Uji kirim slip untuk 1-2 user dulu, lalu blast full.

---

## 4) Success Criteria

### TRF (ERP)
- Menu TRF sesuai format nomor, multi-vendor/multi-line, rule pajak/valas, PDF A4 landscape.
- E2E verified (save → list → detail → delete, PDF 200).

### HRIS (terpisah)
- Payroll MVP berjalan di HRIS:
  - Upload Excel konsultan menghasilkan payslip akurat dan PDF rapi sesuai template.
  - PIN Portal per-user wajib; PIN Gaji khusus untuk menu gaji.
  - Email blast siap + status per karyawan.
  - Log akses tersedia.
- ERP tetap bersih:
  - Tidak ada endpoint `/api/hrd` dan tidak ada menu HRD.
  - User HRD tidak ada di ERP.

**Catatan status**:
- ✅ TRF shipped & agent-verified end-to-end di preview; ⏳ menunggu konfirmasi user di environment lokal.
- ✅ Paket port HRIS tersedia di `/app/hris_module/`.
- ✅ Modul HRD sudah dihapus total dari ERP; ERP kembali bersih.
- ⏳ HRIS project baru belum dibuat (menunggu user Start New Task setelah push GitHub).
