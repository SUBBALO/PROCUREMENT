# Changelog Update — Aplikasi ERP PT Mitra Karya Sarana

Ringkasan semua perbaikan yang dilakukan di Emergent. Semua perubahan ini
**sudah ada di repository GitHub** (branch `main`, commit "Auto-generated changes").
Untuk server LOKAL Anda, cukup lakukan `git pull` (lihat bagian "Cara update lokal" di bawah).

Legenda: 🟢 = wajib untuk runtime · ⚪ = file test (opsional, tidak memengaruhi aplikasi)

---

## 1) Setup / Migrasi
- 🟢 `backend/.env` — ditambahkan secret yang wajib:
  `JWT_SECRET`, `ADMIN_USERNAME=susanto`, `ADMIN_PASSWORD=admin123`,
  `SUPER_ADMIN_USERNAME=susanto`, `GEMINI_API_KEY` (isi sendiri), `GEMINI_MODEL=gemini-2.5-flash`.
  (Catatan: file `.env` biasanya TIDAK ikut ke GitHub — di lokal Anda buat/isi manual.)
- 🟢 `backend/requirements.txt` — menghapus 1 baris `litellm @ https://...` yang bentrok dengan
  `emergentintegrations` saat `pip install`.

## 2) Performa multi-user (anti-lelet saat banyak user)
Masalah: endpoint pembuat dokumen (Excel→PDF LibreOffice, PDF, render gambar) tadinya
memblokir server → 1 orang generate PDF membekukan SEMUA user (3–8 detik).
- 🟢 `backend/server.py` — tambah index MongoDB `users.id` (dipakai tiap request auth).
- 🟢 `backend/routers/excel_templates.py`
- 🟢 `backend/routers/qc.py`
- 🟢 `backend/routers/bom.py`
- 🟢 `backend/routers/form_templates.py`
- 🟢 `backend/routers/nonconformance.py`
  → semua proses render berat dibungkus `asyncio.to_thread(...)` supaya jalan di thread
  terpisah dan TIDAK memblokir user lain. (Sudah lolos uji konkuren.)

## 3) Halaman Login
- 🟢 `frontend/src/pages/LoginPage.jsx` — judul diubah menjadi **"ERP"**.

## 4) Merapikan Menu (khususnya Engineering)
- 🟢 `frontend/src/components/AppShell.jsx`
  - Menghapus tombol density **"Lega/Padat"** dari navbar (tampilan padat tetap dipakai).
  - Menu Engineering di navbar digabung jadi **1 dropdown "Engineering"**
    (isi: Portal Engineering, Inquiries, BOM, Import Data Lama*).
    *Import Data Lama hanya untuk Engineering Leader/Head.
- 🟢 `frontend/src/pages/EngineeringPortalPage.jsx` — kartu menu dikelompokkan ulang
  mengikuti alur kerja: **Pekerjaan Masuk → Proses & Approval → Monitor → Master & Data**.
- 🟢 `frontend/src/App.js` — memperbaiki hak akses: Engineering Leader/Head kini bisa
  membuka `/admin/legacy-import` (sebelumnya salah ter-redirect); Engineering Staff tetap ditutup.

## 5) Fix error AI "503 UNAVAILABLE" saat baca foto nota (Transaksi Sementara)
- 🟢 `backend/routers/temp_transactions.py`
  - Model default diganti ke yang lebih stabil: **`gemini-2.5-flash`** (bukan `gemini-flash-latest`).
  - **Retry otomatis** pada model utama (3x, jeda 1.5s→3s) saat kena 503/overload/429.
  - **Fallback model cadangan** berurutan: `gemini-2.5-flash → gemini-2.0-flash → gemini-flash-latest → gemini-1.5-flash`.
  - **Pesan error ramah** kalau semua sibuk (bukan error mentah), sarankan klik "Ulangi".
  - Error non-sementara (skema/kunci salah) tetap langsung dilaporkan.

## File test (opsional — tidak wajib untuk menjalankan aplikasi)
- ⚪ `backend/tests/test_temp_tx_retry.py` — uji logika retry/fallback AI.
- ⚪ `backend/tests/test_concurrency_docgen.py` — uji performa konkuren render dokumen.

---

## Cara update di server LOKAL (agar tidak muncul banyak notif merah / konflik)
"Notif merah" saat update biasanya = **konflik git** karena ada perubahan lokal yang belum di-commit.
Langkah aman:

```bash
# 1) Masuk folder project
cd /path/ke/PROCUREMENT

# 2) Simpan/lihat dulu perubahan lokal Anda (kalau ada)
git status
git stash            # simpan sementara perubahan lokal (opsional, kalau ada yg belum di-commit)

# 3) Tarik update terbaru dari GitHub
git pull origin main

# 4) (kalau tadi pakai stash) kembalikan perubahan lokal Anda
git stash pop        # bila ada konflik, selesaikan file yg ditandai, lalu simpan

# 5) Install ulang dependency & restart service
#    Backend:
pip install -r backend/requirements.txt
#    Frontend:
cd frontend && yarn install && yarn build   # atau yarn start untuk dev
```

Catatan penting untuk lokal:
- Pastikan `backend/.env` lokal punya `JWT_SECRET`, `GEMINI_API_KEY` (valid), dan
  `GEMINI_MODEL=gemini-2.5-flash`.
- Setelah update, restart backend & frontend.
- Kalau `git pull` menolak karena ada perubahan lokal, gunakan `git stash` seperti langkah di atas,
  ATAU commit dulu perubahan lokal (`git add -A && git commit -m "wip"`) baru `git pull`.
