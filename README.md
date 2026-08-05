# ERP PT Mitra Karya Sarana

Aplikasi ERP Engineering (FastAPI + React + MongoDB).

## Menjalankan di server lokal / jaringan kantor
Ikuti panduan lengkap di **[LOCAL_DEPLOY.md](./LOCAL_DEPLOY.md)** — mencakup:
- Build produksi frontend (`yarn build`) + `serve` (ringan & cepat)
- Menjalankan backend (`uvicorn ... :8001`) + CORS
- Dependensi LibreOffice (calc + writer) untuk PDF/Excel/Word

## Ringkas (pull GitHub → jalan)
```bash
# 1) Backend
cd backend
cp env.example .env          # isi MONGO_URL, dsb.
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001

# 2) Frontend
cd frontend
cp env.example .env          # set REACT_APP_BACKEND_URL ke backend lokal
yarn install
yarn build
npx serve -s build -l 3000
```

> File `.env` sengaja TIDAK disertakan di repo (keamanan). Gunakan `env.example` sebagai acuan.
