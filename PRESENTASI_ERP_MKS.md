# 🎯 MKS MANAGEMENT SYSTEM
## Sistem ERP Terintegrasi PT. Mitra Karya Sarana

**Prepared by:** Purchasing Department (Internal Initiative)
**Development Started:** 23 Juli 2026
**Status:** Active Development — Sudah Live-Testing di Cloud
**Presentation Date:** 31 Juli 2026

---

## SLIDE 1 — COVER

# **MKS Management System**
### Digital Transformation for Better, Faster, Compliant Operations

*Dari Excel & manual paper → Aplikasi web terintegrasi*

---

## SLIDE 2 — LATAR BELAKANG

### Kenapa Kami Buat Sistem Ini?

Sebelum ada MKS Management System:
- ❌ Data tersebar di banyak file Excel di setiap departemen
- ❌ Drawing & BOM diperbarui manual, sering out-of-date
- ❌ Approval drawing via cetak-tanda tangan basah → boros kertas & lama
- ❌ Distribusi controlled copy sulit dikontrol → risiko ISO audit
- ❌ Sulit tracking status inquiry, SO, drawing revision
- ❌ Purchasing susah kordinasi antar dept

### Inisiatif Purchasing Department
> "Kalau nunggu vendor ERP komersial (SAP, Odoo) — bisa 6 bulan + ratusan juta.
> Kita bangun sendiri sesuai proses MKS, gratis, dan bisa custom kapan saja."

**Dimulai 23 Juli 2026** — Full-stack development (React + FastAPI + MongoDB) in-house

---

## SLIDE 3 — YANG SUDAH SIAP (8 Hari Development)

### 🏗️ 8 Modul Departemen Terintegrasi

| # | Modul | Fitur Utama |
|---|-------|--------|
| 1 | **Sales** | Inquiry Costing · Quotation · Master Customer · Drawing Request Form (MKS-F-ENG-001) |
| 2 | **Engineering** | Master Drawing List (MKS-F-ENG-005) · BOM Preparation · Approval Workflow · Assign Engineer |
| 3 | **Purchasing** | BOM Consolidation · PO Management · Vendor Master |
| 4 | **Store (Gudang)** | Incoming Receipt · MCL/MIF Auto-generate · Stock Report |
| 5 | **QC** | Material Incoming Inspection (MII) · TTD Digital |
| 6 | **Finance** | View + Export data lintas departemen |
| 7 | **Document Control** | DC Stamp · SO Stamp Produksi · Controlled Drawing Database · Distribution Record |
| 8 | **Admin** | User Management · Role-Based Access · Audit Logs |

---

## SLIDE 4 — WORKFLOW UTAMA: DARI INQUIRY → PRODUKSI

```
CUSTOMER MINTA HARGA
        ↓
[SALES] Buat Inquiry Costing → Buat SO
        ↓
[SALES] Buat Drawing Request Form (MKS-F-ENG-001)
   - New Order / Repeat Order
   - Auto-TTD Requested By
        ↓
[ENG HEAD RISKI] Terima DRF → Accept (Auto-TTD Received By)
   - Assign Engineer (mis. Trisna)
        ↓
[ENG STAFF TRISNA] Buat Drawing + BOM
   - Upload PDF Drawing
   - Auto-verifikasi drawing_no
        ↓
[APPROVAL BERJENJANG DENGAN TTD DIGITAL PNG]
   Eng Head TTD → QC TTD → Sales TTD (isi data SO Produksi)
        ↓
[DOCUMENT CONTROL SALMA]
   1. DC Stamp semua dokumen (MKS + Customer Ref + Extras)
   2. SO Stamp Produksi (auto-fill dari Sales)
        ↓
[PRODUKSI] Terima drawing controlled + SO stamp
```

---

## SLIDE 5 — KELEBIHAN 1: DIGITAL SIGNATURE (TTD DIGITAL)

### 🖋 Zero Paper Approval

**Sebelumnya:**
- Cetak drawing → antri tanda tangan Eng Head → QC → Sales → Doc Control
- Butuh 3-5 hari untuk 1 drawing approve
- Kertas menumpuk, risiko hilang

**Sekarang:**
- Setiap user upload PNG signature 1x di profile
- Klik "TTD & Approve" → PDF viewer terbuka
- Klik posisi TTD di PDF → pilih ukuran S/M/L → konfirmasi
- Tanda tangan + tanggal + jam otomatis muncul di drawing
- **⚡ 1 drawing bisa approved dalam <30 menit**

### Fitur Watermark Otomatis
- Non-DC user cetak drawing → auto watermark "UNCONTROLLED COPY WHEN PRINTED"
- Salma (DC) cetak → controlled copy tanpa watermark
- **ISO 9001 compliant**

---

## SLIDE 6 — KELEBIHAN 2: BOM & DRAWING TERINTEGRASI

### 🔗 Single Source of Truth

**Sebelumnya:**
- BOM Excel di komputer Engineer
- Drawing PDF di folder shared
- Purchasing minta print → Engineer kirim → sudah revisi
- Sering beli material salah karena BOM out-of-date

**Sekarang:**
- 1 drawing = 1 BOM di database
- Purchasing auto-lihat BOM ter-approved
- Revisi drawing → auto-notif ke Purchasing
- Bisa export BOM ke Excel template MKS (dengan Text Box & Shapes!)
- **Zero mistake dari BOM lama**

---

## SLIDE 7 — KELEBIHAN 3: ROLE-BASED PERMISSION

### 👥 Setiap User Punya Akses Sesuai Peran

| Role | Yang Bisa Diakses | Yang Tidak Bisa |
|------|------------------|-----------------|
| Sales | Inquiry, Quotation, DRF, TTD Drawing | Data Purchasing, Cost |
| Eng Head (Riski) | Assign Engineer, Approve Drawing, semua Eng data | Tidak edit drawing yang bukan assign-nya |
| Eng Staff (Trisna) | Hanya drawing yang di-assign ke dia | Tidak lihat drawing engineer lain |
| QC | MII, TTD Drawing | Data Finance |
| Sales, Doc Control, Purchasing, Store | Modul masing-masing |
| Finance | View + Export semua | Tidak bisa modify |
| Admin | Semua | — |

**Data aman**, tidak ada leak antar departemen.

---

## SLIDE 8 — KELEBIHAN 4: DOCUMENT CONTROL DIGITAL

### 📋 Compliance ISO 9001 Otomatis

**Fase workflow Salma (DC):**
1. **Document Distribution Record** — Log setiap drawing yang di-approve
2. **DC Stamp Interaktif** — Klik posisi di PDF → cap merah MKS + tanggal muncul
3. **Multi-Document Stamping** — MKS Drawing + Customer Ref + Extras semua di-stamp
4. **SO Stamp Produksi** — Data SO/PO/Qty/Customer/Due Date otomatis dari Sales
5. **Controlled Drawing Database** — Master repository, siap audit ISO

**Setiap print/preview tercatat** — siapa, kapan, jam berapa. Full audit trail.

---

## SLIDE 9 — KELEBIHAN 5: PDF OCR VALIDATION

### 🔍 Anti Salah Upload Drawing

Sistem otomatis:
- Baca isi PDF yang di-upload
- Cek apakah `drawing_no` di PDF match dengan form
- Kalau tidak match → **warning merah**, user harus konfirmasi
- Mencegah salah upload drawing untuk project berbeda

---

## SLIDE 10 — KELEBIHAN LAIN

- ✅ **Pagination global** — semua tabel bisa dropdown page size
- ✅ **Global search** — cari apa saja (Ctrl+K)
- ✅ **Notifikasi real-time** — bell icon di header, badge count per role
- ✅ **Auto-generate nomor** — DRF, Quotation, Drawing, MII, MCL, MIF, SO — semua format ISO
- ✅ **Excel template dinamis** — Admin bisa upload template baru, sistem auto-detect placeholder `{{...}}`
- ✅ **PDF Preview bypass IDM** — pakai Blob URL, konsisten di semua komputer
- ✅ **Repeat Order** — copy dari SO lama + BOM lama + drawing lama sekali klik
- ✅ **Cloud deployed + preview URL** — akses dari mana saja
- ✅ **MongoDB backend** — bisa handle jutaan record tanpa lag
- ✅ **Hot reload development** — fitur baru bisa go-live tanpa downtime

---

## SLIDE 11 — YANG SEDANG DIRENCANAKAN

### 🚀 Roadmap Q3–Q4 2026

**Priority 0 (segera):**
- Telegram Bot Notification untuk approval offline
- Backup harian otomatis ke cloud storage

**Priority 1:**
- Multi-Supplier Comparison di Material Costing
- Cost Simulator Card di Engineering Costing
- AI PO Reader (upload PDF PO → auto-input ke sistem, powered by GPT)
- Template Excel PDF preview untuk Drawing Request Form

**Priority 2:**
- Auto-Sync BOM Items dari Excel Costing
- Payment Tracking / Invoice Status
- Mobile app companion (approval on-the-go)

---

## SLIDE 12 — DAMPAK BISNIS

### 📈 Estimasi Impact

| Area | Sebelum | Sesudah | Saving |
|------|---------|---------|--------|
| Approval Drawing | 3-5 hari | <1 jam | **~95% waktu** |
| Cetak kertas approval | ± 500 lembar/bulan | 0 lembar | **~Rp 500K/bulan + tinta** |
| Salah beli material (BOM out-of-date) | 2-3x/bulan | ~0 | **Rp 5-10 juta/bulan** |
| Waktu audit ISO | 2-3 hari manual | 1 jam (auto trail) | **Rp 3-5 juta/tahun konsultan** |
| Investasi ERP komersial | Rp 200-500 juta setup + Rp 5-10 juta/bulan lisensi | **Rp 0** (in-house) | **>Rp 200 juta hemat** |

---

## SLIDE 13 — KESIMPULAN

### 💡 Kenapa Ini Investasi Berharga?

1. **Full custom** untuk proses MKS — bukan sistem generik yang harus disesuaikan
2. **Bisa berkembang** — Purchasing bisa develop fitur baru sesuai kebutuhan
3. **Data 100% milik MKS** — tidak tergantung vendor eksternal
4. **Sudah works end-to-end** — sudah bisa dipakai testing hari ini
5. **Foundation untuk ERP lengkap** — HR, Finance, Payment tracking, dst bisa ditambahkan

### 🎯 Kami Butuh Support Dari Manajemen:
- ✅ **Persetujuan pilot deployment** di 2-3 dept dulu (Sales + Eng + Doc Control)
- ✅ **Waktu training user** 2-3 jam per role
- ✅ **Feedback loop mingguan** — supaya sistem terus sesuai lapangan
- ⚠️ **Optional: dedicated developer** untuk maintenance & feature request (kalau scope makin besar)

---

## SLIDE 14 — DEMO LIVE

**Live URL:** https://supply-hub-159.preview.emergentagent.com

**Test Accounts:**
| Role | Username | Password |
|------|----------|----------|
| Sales | nicholas | sales12345 |
| Eng Head | riski | riski123 |
| Eng Staff | trisna | trisna123 |
| QC | qc01 | qc12345 |
| Doc Control | salma | salma123 |
| Admin | susanto | admin123 |

**Skenario Demo (10 menit):**
1. Sales buat Drawing Request Form (2 menit)
2. Eng Head Accept + Assign Engineer (1 menit)
3. Eng Staff buat Drawing + Upload PDF (2 menit)
4. Full Approval Flow dengan TTD Digital (3 menit)
5. Salma DC Stamp + SO Stamp Produksi (2 menit)

---

## SLIDE 15 — THANK YOU

# **Terima Kasih.**
### Pertanyaan & Diskusi?

**Contact:**
Purchasing Department — PT. Mitra Karya Sarana
Email: purchasing@mks-mitrakarya.com

*Sistem dibuat dari 0 dalam 8 hari — bukti bahwa transformasi digital tidak selalu butuh vendor mahal.*
