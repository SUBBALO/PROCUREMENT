# Rencana Implementasi Transfer Request Form (CRF‑TT) — Purchasing → Finance (Multi‑Vendor, Multi‑Line, PDF)

## 1) Objectives
- Menyediakan fitur **Transfer Request Form (CRF‑TT)** di modul Purchasing untuk pengajuan pembayaran ke Finance.
- Mendukung **1 form berisi banyak vendor** dan **banyak baris pembayaran**.
- **Nomor rekening berada per baris** pembayaran (auto-fill dari Master Bank Vendor, tetap bisa diedit).
- Pajak **fleksibel per baris**:
  - user menentukan apakah kena pajak;
  - user mengisi sendiri persentase PPh.
- Mendukung pembayaran **valas** dengan **rate** dan **fee bank**.
- Output minimal scope:
  - Buat form;
  - Cetak PDF;
  - Master List TRF pada tab sebelah.
- Format nomor (reset tiap bulan):
  - `005/CRF-TT/VIII/2026`
  - kode form `CRF-TT`
  - bulan Romawi, tahun 4 digit.

## 2) Implementation Steps

### Phase 1 — Backend API + PDF (MVP)
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
    - `GET /api/transfer-requests/next-no` (preview nomor tanpa increment)
    - `GET /api/transfer-requests` (list, search by form/vendor/notes)
    - `POST /api/transfer-requests` (create + compute per line + auto-upsert vendor bank)
    - `GET /api/transfer-requests/{id}` (detail)
    - `DELETE /api/transfer-requests/{id}` (admin only, soft delete)
    - `GET /api/transfer-requests/{id}/pdf` (ReportLab landscape A4)
  - Perhitungan per baris (sesuai keputusan):
    - `base_idr = amount * rate`
    - `pph_amount = taxed ? base_idr * (pph_percent/100) : 0`
    - `net_transfer = base_idr - pph_amount + fee`
- Registrasi router:
  - Tambah import dan `include_router` di `backend/server.py`.

**Checkpoint MVP**
- Endpoint preview nomor mengembalikan format benar.
- Create TRF menghasilkan perhitungan benar dan menyimpan data.
- Master bank vendor tersimpan/ter-update otomatis dari data baris pembayaran.
- PDF endpoint menghasilkan dokumen valid.

**Status**: ✅ **Selesai** (backend + PDF + endpoints terverifikasi via curl)

---

### Phase 2 — Frontend Page + Purchasing Portal Integration
**User stories**
1. Purchasing masuk menu Purchasing Portal dan melihat kartu **Transfer Request Form**.
2. Di halaman TRF terdapat 2 tab:
   - **Buat TRF**: input multi baris dengan vendor autocomplete + auto-fill rekening; pajak per baris; valas rate+fee; total transfer terlihat.
   - **Master List TRF**: daftar TRF, dapat klik untuk detail dan cetak PDF.
3. Admin dapat menghapus TRF dari detail modal.

**Langkah teknis**
- Frontend page:
  - Tambah `frontend/src/pages/TransferRequestPage.jsx`.
  - Implementasi 2 tab:
    - **Buat TRF**:
      - Header: Next No (preview), tanggal, ditujukan (Finance).
      - Line editor:
        - vendor autocomplete memanggil `GET /vendor-banks` dan on select mengisi bank fields.
        - currency dropdown: **IDR, SGD, USD**.
        - rate disabled saat IDR.
        - toggle pajak + input persen.
        - computed preview: base IDR, PPh, fee, nilai transfer.
      - Aksi: Simpan / Simpan & Cetak PDF.
    - **Master List TRF**:
      - Search, list table.
      - Click row open detail modal.
      - Detail modal: breakdown baris, tombol cetak PDF, tombol hapus (admin only).
- Route:
  - `frontend/src/App.js`: tambahkan route protected `"/purchasing/transfer-request"`.
- Portal card:
  - `frontend/src/pages/PurchasingPortalPage.jsx`: tambahkan card **Transfer Request Form** menuju route tersebut.

**Checkpoint**
- Halaman dapat diakses dari Purchasing Portal.
- Simpan menghasilkan TRF baru, muncul di Master List.
- Cetak PDF membuka PDF di tab baru.
- Hapus TRF hanya terlihat untuk admin/super_admin.

**Status**: ✅ **Selesai** (render + compile + UI flow + PDF open verified)

---

### Phase 3 — Hardening + E2E Verification + Cleanup
**User stories**
1. Perhitungan valas + pajak sesuai formula dan tampil konsisten di UI serta PDF.
2. Data uji tidak mengotori database.

**Langkah teknis**
- E2E test (UI):
  - Buat TRF (pajak aktif) → cek total → masuk Master List → buka detail → delete.
  - Validasi PDF endpoint mengembalikan HTTP 200.
- Cleanup:
  - Hapus data TRF dan vendor bank uji.
  - Reset counter `crf:YYYY-MM` pada lingkungan preview agar user mulai dari 001.

**Status**: ✅ **Selesai** (E2E save/list/detail/delete + PDF OK, cleanup DB done)

## 3) Next Actions (eksekusi terdekat)
1. **User confirmation di local deployment**:
   - `git pull origin main`
   - restart backend + rebuild frontend (`yarn build`) sesuai prosedur user.
2. (Opsional) Penyempurnaan kecil UX:
   - default rate saat pilih USD/SGD (optional, jika ada referensi kurs harian).
   - validasi UI: warning jika vendor kosong tapi rekening terisi.
   - opsi duplikasi baris (copy row) untuk pembayaran mirip.
3. (Opsional) Penguatan Master Bank Vendor:
   - jika nanti dibutuhkan, tambahkan halaman khusus untuk edit banyak rekening per vendor.

## 4) Success Criteria
- Menu Purchasing memiliki akses mudah ke TRF melalui kartu portal.
- Format nomor TRF sesuai: `NNN/CRF-TT/{ROMAN_MONTH}/{YYYY}` dengan reset bulanan.
- Satu TRF mendukung multi-vendor dan multi-line; rekening per baris.
- Pajak fleksibel per baris (toggle + persen), valas support (currency/rate/fee).
- Master Bank Vendor auto-terbentuk/ter-update dari input form.
- PDF dapat dicetak/dibuka dari detail.
- E2E verified (save → list → detail → delete, PDF 200) dan data uji dibersihkan.

**Catatan status**: ✅ shipped & agent-verified end-to-end di preview; ⏳ menunggu konfirmasi user pada environment lokal.