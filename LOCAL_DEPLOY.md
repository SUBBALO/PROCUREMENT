# Panduan Deploy Lokal (Jaringan Kantor) — Cepat & Ringan

Dokumen ini untuk menjalankan aplikasi di server lokal (mis. `192.168.1.254`) memakai
**build produksi** (bukan `yarn start` dev) agar jauh lebih ringan & cepat.

---

## 1) Frontend — Build Produksi + Sajikan

### a. Set alamat backend SEBELUM build  (PENTING!)
Nilai `REACT_APP_BACKEND_URL` "dibekukan" saat build. Pastikan menunjuk ke backend lokal Anda.

Edit `frontend/.env`:
```
REACT_APP_BACKEND_URL=http://192.168.1.254:8001
```
> Ganti IP sesuai server. JANGAN pakai URL preview Emergent untuk pemakaian lokal.

### b. Build
```
cd frontend
yarn install        # sekali saja / saat dependency berubah
yarn build
```
Hasil ada di folder `frontend/build`.

### c. Sajikan folder build (yang sudah Anda lakukan)
```
npx serve -s build -l 3000
```
Akses: `http://192.168.1.254:3000`

> Tips: agar tetap jalan walau terminal ditutup, pakai `pm2`:
> ```
> npm i -g pm2 serve
> pm2 start serve --name mks-web -- -s build -l 3000
> pm2 save
> ```

---

## 2) Backend — FastAPI

Jalankan backend di server yang sama (port 8001):
```
cd backend
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001
```
> Agar persisten: pakai `pm2 start "uvicorn server:app --host 0.0.0.0 --port 8001" --name mks-api`
> atau service systemd.

### CORS
Agar frontend (`:3000`) boleh memanggil backend (`:8001`), set env sebelum menjalankan backend:
```
export CORS_ORIGINS=http://192.168.1.254:3000
```
(Default `*` juga jalan, tapi lebih aman dibatasi ke origin frontend.)

---

## 3) Dependensi Sistem (untuk fitur PDF/Excel/Word)

Konversi dokumen memakai **LibreOffice**. Pastikan komponen ini terpasang di server:
```
# Debian/Ubuntu:
sudo apt-get install -y libreoffice-calc libreoffice-writer
```
- `libreoffice-calc`  → konversi Excel → PDF (template Excel).
- `libreoffice-writer`→ konversi Word → PDF (**template CAR Word**).

> Jika Writer tidak ada, cetak CAR otomatis memakai format bawaan (reportlab) — tidak error.

---

## 4) Kenapa versi lokal terasa lebih cepat setelah ini?
- **Build produksi**: JS/CSS diminifikasi & di-bundle → jauh lebih ringan dari dev server.
- **Cache render viewer di server** + **cache browser (ETag)** → buka ulang gambar instan.
- **Resolusi progresif**: drawing dimuat skala rendah dulu (data ±½), dipertajam saat zoom.
- **Index MongoDB** untuk koleksi drawings/dll → list & pencarian lebih cepat.

## 5) Checklist Cepat
- [ ] `frontend/.env` → `REACT_APP_BACKEND_URL` = IP backend lokal
- [ ] `yarn build` sukses → `serve -s build -l 3000`
- [ ] Backend `uvicorn ... :8001` jalan + `CORS_ORIGINS` diset
- [ ] LibreOffice (calc + writer) terpasang
- [ ] MongoDB jalan & `MONGO_URL` benar di `backend/.env`
