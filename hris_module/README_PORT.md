# Paket Port Modul HRD → Proyek HRIS Baru

Folder ini berisi modul **HRD/Payroll** yang sudah jadi & teruji di ERP, siap dipindah ke aplikasi **HRIS** yang berdiri sendiri (database, URL, dan login terpisah).

## Isi folder
```
hris_module/
├── backend/
│   ├── hrd.py                         # Router utama HRD (payroll) — SALIN ke backend/routers/hrd.py
│   └── auth_permission_snippets.py    # Perubahan auth/models/deps/security yang WAJIB diadaptasi
├── frontend/
│   ├── HrdPortalPage.jsx              # Portal HRD (UI lengkap) — SALIN ke frontend/src/pages/
│   └── HrdAccessMatrix.jsx            # Editor hak akses granular (untuk panel Admin)
├── reference/
│   └── Gaji_Trial.xlsx               # Contoh file Excel konsultan (acuan importer)
└── README_PORT.md                     # File ini
```
> Catatan: lampirkan juga **gambar contoh slip gaji (Harjono)** saat memulai proyek HRIS sebagai acuan visual PDF.

## Dependensi backend
`pip install fastapi uvicorn motor pydantic pyjwt reportlab openpyxl`
(Modul memakai `smtplib` bawaan Python untuk kirim email Gmail.)

## Aturan bisnis yang WAJIB dipertahankan
1. **Dua lapis PIN**
   - **PIN Portal (per-user)**: setiap user HRD wajib punya PIN sendiri untuk masuk portal. Disimpan di dokumen user (`hrd_pin_hash`). Token scope `hrd_portal` (header `x-hrd-token`).
   - **PIN Gaji (khusus)**: untuk membuka menu gaji (Karyawan/Slip/Email/Settings). Disimpan global di `hrd_settings.pin_hash`. Bisa diatur/reset oleh user gaji (mis. Herliana) atau super admin. Token scope `hrd_gaji` (header `x-hrd-gaji`).
2. **Hak akses granular ala Accurate**: `access = {menu_key: {view,create,edit,delete,report}}` per user.
   - Menu HRD: `hrd_karyawan`, `hrd_slip_gaji`, `hrd_email`, `hrd_settings`, `hrd_dokumen`.
   - Grup "gaji" (butuh PIN Gaji): `hrd_karyawan`, `hrd_slip_gaji`, `hrd_email`, `hrd_settings`.
   - Super admin bypass semua.
3. **Importer Excel**: baca **sheet slip per-karyawan** yang ditandai sel **A5 == "SLIP GAJI"** (bukan sheet daftar). Layout tetap:
   - C8 Nama, E8 NIK, C9 Dept, C10 Jabatan, J8 Perhari, J9 Lembur/Jam, J10 T.Kehadiran
   - Penghasilan: kolom A(label)/C-D(qty)/E(amount), berhenti di "JUMLAH"
   - Pengurangan: kolom G(label)/I(qty)/J(unit)/K(amount); JUMLAH, PENGHASILAN BERSIH, PEMBULATAN
   - **Take Home = nilai PEMBULATAN dari Excel** (bukan dihitung ulang)
   - Terbilang diambil dari sheet bila ada, kalau tidak dihitung otomatis
   - Email/bank/rekening diisi otomatis dengan mencocokkan Nama/NIK ke Master Karyawan
4. **PDF slip** harus sesuai format perusahaan: header PT + alamat, judul SLIP GAJI, periode, info karyawan + box rate, dua kolom Penghasilan/Pengurangan (dengan qty), JUMLAH, PENGHASILAN BERSIH, PEMBULATAN, Terbilang, dan **footer: "dicetak otomatis oleh sistem [tanggal jam WIB] oleh [user], tidak perlu tanda tangan basah"**.
5. **Email**: Gmail SMTP + **App Password** (disimpan di server, tidak pernah ditampilkan). Blast per periode, PDF individual per karyawan, status `belum/terkirim/gagal` per slip.
6. **Log akses**: catat buka portal, PIN salah, set/reset PIN, import, blast.

## Endpoint (prefix /api)
```
GET  /api/hrd/my-access
POST /api/hrd/portal-pin/set     POST /api/hrd/portal-pin/verify   (portal_token)
POST /api/hrd/set-pin            POST /api/hrd/verify-pin          (gaji_token)
GET/POST/PUT/DELETE /api/hrd/employees
GET/POST/PUT/DELETE /api/hrd/payslips
POST /api/hrd/payslips/import-excel      GET /api/hrd/payslips/{id}/pdf
GET  /api/hrd/import-template
GET/POST /api/hrd/settings       POST /api/hrd/blast
GET  /api/hrd/logs               GET /api/hrd/menu-defs
```

## Koleksi MongoDB
`hrd_employees`, `hrd_payslips`, `hrd_settings` (doc _id="hrd": pin_hash, gmail_user, app_password, sender_name), dan `activity_logs` (untuk log).

---

## PROMPT SIAP-PASTE untuk memulai proyek HRIS baru

> Bangun aplikasi **HRIS (HR Information System)** berdiri sendiri dengan **FastAPI + React + MongoDB**, login & database terpisah. Untuk modul awal (Payroll), **gunakan kode di folder `hris_module/`** sebagai fondasi:
> - Salin `hris_module/backend/hrd.py` → `backend/routers/hrd.py`, daftarkan di `server.py`.
> - Adaptasi perubahan auth/permission sesuai `hris_module/backend/auth_permission_snippets.py` (field `access`, role, `must_change_password`, `get_current_user` kembalikan dokumen mentah, `is_super_admin_user`, `log_action`, `hash_password/verify_password`, `JWT_SECRET/JWT_ALGORITHM`, `NOT_DELETED_FILTER/soft_delete_one`).
> - Salin `hris_module/frontend/HrdPortalPage.jsx` → `frontend/src/pages/` dan jadikan halaman utama HRIS. Salin `HrdAccessMatrix.jsx` ke panel Admin untuk atur hak akses user.
> - **Pertahankan semua aturan bisnis** di `README_PORT.md` (2 lapis PIN, hak akses granular, importer baca sheet 'SLIP GAJI', Take Home dari kolom Pembulatan, format PDF, email Gmail App Password, log akses).
> - Acuan data: `hris_module/reference/Gaji_Trial.xlsx` dan gambar contoh slip (Harjono) yang saya lampirkan.
> Buat user HRD: **herliana** (akses penuh menu gaji) dan **heri** (hanya Dokumen HRD), password awal `hrd123` wajib ganti. Setelah itu kembangkan menu Dokumen HRD: Absensi, Cuti, Kontrak Kerja, Arsip Dokumen Karyawan, dan Dashboard HR.
