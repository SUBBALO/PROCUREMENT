# Rencana Implementasi Transfer Request Form (CRF‑TT) + HRD Payroll (untuk dipindah ke HRIS)

> Dokumen plan ini awalnya fokus TRF. Saat ini ditambah **Phase HRD Payroll** karena modul HRD sudah dibangun di dalam ERP dan akan **di-port** ke proyek terpisah **HRIS**.

---

## 1) Objectives

### A. Transfer Request Form (CRF‑TT)
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

### B. HRD Payroll (di ERP, siap dipindah ke HRIS)
- Menyediakan **Portal HRD** untuk pengelolaan payroll yang **rahasi**:
  - Master Karyawan;
  - Upload Excel payroll dari konsultan;
  - Generate PDF slip gaji sesuai format perusahaan;
  - Blast email slip gaji via Gmail SMTP (App Password) + status terkirim/gagal per karyawan;
  - Log akses & aktivitas.
- Keamanan/privasi payroll:
  - **Granular permission ala Accurate**: View/Create/Edit/Delete/Report per menu HRD.
  - **Two-tier PIN**:
    1) **PIN Portal HRD (per user)**: wajib untuk user HRD untuk masuk portal.
    2) **PIN Gaji (khusus menu gaji)**: diperlukan untuk membuka menu payroll (Karyawan/Slip/Email/Settings) dan dimiliki oleh user gaji (mis. Herliana).
  - Admin/superadmin **tidak otomatis bisa lihat gaji** tanpa akses HRD + PIN sesuai aturan.
- Modul HRD dibangun di ERP sebagai tahap persiapan, lalu akan **di-port** ke proyek baru bernama **HRIS (HR Information System)** (DB/URL/login terpisah) setelah user push ke GitHub.

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

### Phase 4 — HRD Payroll Backend (API + Import Excel + PDF + Email + Security)

**User stories**
1. HRD dapat menyimpan **Master Karyawan** (nama, NIK, jabatan, email, bank, no rekening).
2. HRD dapat upload Excel dari konsultan:
   - Sheet utama: `Daftar Gaji` (informasi summary)
   - Sheet berikutnya: **per-karyawan** dengan marker `A5 = "SLIP GAJI"`.
3. Sistem menghasilkan slip gaji dengan rincian:
   - Penghasilan + qty
   - Pengurangan + qty/unit
   - Box rate (Perhari, Lembur/Jam, T. Kehadiran)
   - Terbilang
   - Pembulatan (Take Home Pay) diambil dari Excel
4. Slip bisa dicetak PDF dan dikirim email massal via Gmail SMTP.
5. Status kirim per karyawan: `belum/terkirim/gagal` + error message.
6. Keamanan:
   - Portal HRD wajib PIN portal per-user.
   - Menu gaji wajib PIN gaji (khusus).
   - Permission granular ala Accurate per menu HRD.
7. Portal HRD punya log akses (buka portal, PIN salah, set/reset PIN, import, blast).

**Langkah teknis (Backend)**
- Router: `backend/routers/hrd.py`
  - Gate & security:
    - `GET /api/hrd/my-access`
    - `POST /api/hrd/portal-pin/set`
    - `POST /api/hrd/portal-pin/verify` → `portal_token`
    - `POST /api/hrd/set-pin` (PIN Gaji) → bisa oleh gaji user (Herliana) / super admin
    - `POST /api/hrd/verify-pin` → `gaji_token`
    - Semua endpoint gaji memakai permission + PIN gaji header `x-hrd-gaji`.
  - Employee Master:
    - `GET/POST/PUT/DELETE /api/hrd/employees`
  - Payslips:
    - `GET/POST/PUT/DELETE /api/hrd/payslips`
    - `POST /api/hrd/payslips/import-excel` → parse sheet per-karyawan `SLIP GAJI`
    - `GET /api/hrd/payslips/{id}/pdf` → PDF sesuai template (tanpa tanda tangan basah, footer sistem + timestamp WIB + printed_by)
    - `GET /api/hrd/import-template`
  - Gmail SMTP:
    - `GET/POST /api/hrd/settings` (gmail_user, app_password, sender_name)
    - `POST /api/hrd/blast` (bulk) + status per slip
  - Logs:
    - `GET /api/hrd/logs`
- Auth model update:
  - `backend/models.py` tambah field user `access` (permission matrix)
  - `backend/routers/auth.py`:
    - tambah role `hrd`
    - include `access` dalam response `login` & `me`
    - persist `access` pada create/update user.
- Router registration:
  - `backend/server.py` include router HRD.

**Status**: ✅ **Selesai & terverifikasi**
- Import Excel diverifikasi cocok dengan `Gaji Trial.xlsx`.
- PDF slip diverifikasi sesuai contoh (qty column, rate box, Terbilang, pembulatan, footer sistem).
- Blast email endpoint siap (uji kirim asli menunggu kredensial Gmail).

---

### Phase 5 — HRD Payroll Frontend Portal + Admin Permission Editor

**User stories**
1. User HRD masuk portal HRD:
   - Wajib PIN Portal masing-masing.
2. Menu gaji (Karyawan/Slip/Email/Settings) minta PIN Gaji (Bu Lia).
3. UI menampilkan kartu sesuai permission:
   - Data Karyawan
   - Slip Gaji (upload-first)
   - Kirim Email
   - Pengaturan Gmail
   - Dokumen HRD (placeholder untuk HRIS: Absensi/Cuti/Kontrak/Arsip/Dashboard)
   - Log Akses
4. Super Admin dapat mengatur permission HRD user dengan checklist ala Accurate.

**Langkah teknis (Frontend)**
- Portal:
  - `frontend/src/pages/HrdPortalPage.jsx`
    - Portal PIN gate: `portal-pin/set` & `portal-pin/verify`
    - Gaji PIN dialog: `verify-pin` → `gaji_token`
    - Header menu: ganti/reset PIN portal, reset PIN gaji (jika berhak), lock gaji, keluar portal
    - Slip Gaji: upload Excel + list + open PDF
    - Email: pilih slip + blast + status
    - Settings: Gmail config (App password disimpan server, tidak pernah ditampilkan)
    - Dokumen HRD: placeholder cards
    - Log Akses: table
- Routing & landing:
  - `frontend/src/App.js` tambah gating role `hrd` (hanya boleh akses /hrd di luar landing)
  - `frontend/src/pages/LandingPage.jsx`:
    - Card HRD tampil untuk role `hrd` atau user yang punya `access.*.view` HRD
- Admin panel:
  - `frontend/src/pages/AdminPage.jsx`
    - tambah role `hrd`
    - tambah **HRD permission matrix editor** pada Create/Edit user
    - simpan field `access` ke API `/users` & `/users/{id}`

**Status**: ✅ **Selesai (compile + screenshot verified)**

---

### Phase 6 — Verification, Testing, dan Readiness untuk Port ke HRIS

**Langkah teknis**
1. **Testing agent** untuk HRD:
   - flow portal pin set/verify
   - gaji pin set/verify
   - import excel (sample)
   - list payslips + pdf 200
   - blast: validasi gagal bila gmail belum di-set; sukses setelah diset (opsional)
   - permission checks (heri vs herliana)
2. Cleanup data uji HRD (gunakan prefix khusus / filter username test).
3. Persiapan port ke HRIS:
   - User push repo ERP ke GitHub
   - Start New Task “HRIS” (FastAPI+React+MongoDB) → port folder HRD + auth permission + UI HRD
   - Pastikan DB HRIS terpisah (koleksi HRIS) dan URL/deploy terpisah.

**Status**: ⏳ **Next**

---

## 3) Next Actions (eksekusi terdekat)

1. Jalankan **testing agent** untuk HRD (Phase 6.1).
2. Tambahkan screenshot evidence untuk:
   - PIN Portal gate
   - Unlock PIN Gaji
   - Upload Excel + list payslips
   - PDF preview
   - Admin permission matrix
3. Konfirmasi user:
   - Gmail sender + App Password akan diisi melalui UI Settings saat siap.
4. Setelah user push ke GitHub:
   - Buat proyek baru **HRIS** dan port modul HRD.

---

## 4) Success Criteria

### TRF
- Menu TRF sesuai format nomor, multi-vendor/multi-line, rule pajak/valas, PDF A4 landscape.
- E2E verified (save → list → detail → delete, PDF 200).

### HRD Payroll
- Portal HRD bisa dipakai oleh user HRD (Herliana/Heri) dengan:
  - PIN Portal per-user wajib.
  - PIN Gaji khusus untuk menu gaji.
  - Permission granular ala Accurate berfungsi (view/create/edit/delete/report).
- Upload Excel dari konsultan menghasilkan payslip akurat sesuai template dan bisa di-PDF-kan.
- Blast email siap dan menyimpan status per karyawan (uji kirim menunggu kredensial Gmail).
- Log akses tersedia di portal.
- Siap dipindahkan ke **HRIS** terpisah (DB/URL/login terpisah) setelah repo dipush.

**Catatan status**:
- ✅ TRF shipped & agent-verified end-to-end di preview; ⏳ menunggu konfirmasi user di environment lokal.
- ✅ HRD payroll shipped & agent-verified (import Excel + PDF + security + UI); ⏳ testing agent formal + port ke HRIS menunggu push GitHub.