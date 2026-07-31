# MKS Management System — Security Whitepaper

**Versi 1.0 · Prepared Feb 2026 · PT. Mitra Karya Sarana · Internal LAN Deployment**

---

## 1. Framework & Tech Stack (Industry Standard)

| Layer | Framework | Dipakai Oleh |
|-------|-----------|--------------|
| **Backend** | FastAPI (Python 3.11) | Netflix, Uber, Microsoft, Cisco |
| **Frontend** | React 19 | Facebook, Airbnb, Instagram, Discord |
| **Database** | MongoDB (NoSQL) | Adobe, Bosch, Toyota |
| **Auth** | JWT + Cookie Session | RFC 7519 standard |
| **Password Hash** | bcrypt (12 rounds) | OWASP recommended |
| **PDF Engine** | PyMuPDF | Fortune 500 enterprise |
| **Web Server** | Uvicorn ASGI | Industry high-performance |
| **Deployment** | Docker-ready + supervisord | Production standard |

---

## 2. Security Controls (Live di Sistem — Iter 22, Feb 2026)

### Authentication & Access
- **Password policy** — min 10 karakter + huruf besar + angka + block default password (admin123, riski123, dll)
- **Brute force protection** — 5x salah password → akun locked 15 menit (per username, MongoDB counter, tidak butuh Redis)
- **Force-change default password** — user yang login pakai default wajib ganti sebelum akses fitur lain
- **Idle auto-logout** — session expire 30 menit tanpa aktivitas + warning 5 menit sebelum
- **Session cookie** — httpOnly + SameSite=Lax + Secure (di HTTPS)
- **Password hash** — bcrypt 12 rounds, resistant to GPU brute force

### Web Application Security
- **XSS Protection** — React auto-escape + Content-Security via headers
- **Clickjacking** — X-Frame-Options: SAMEORIGIN
- **MIME Sniffing** — X-Content-Type-Options: nosniff
- **HTTPS Enforce** — Strict-Transport-Security (HSTS) 1 tahun
- **Referrer Leak** — Referrer-Policy: strict-origin-when-cross-origin
- **Camera/Mic Block** — Permissions-Policy: deny camera/microphone/geolocation

### Application-Level Controls
- **Role-Based Access Control (RBAC)** — 9 role: admin, super_admin, eng_head, eng_staff, qc, sales, doc_control, purchasing, store
- **Endpoint guards** — setiap route protected by role dep function
- **Digital Signature (PNG)** — upload sekali, placed per-approver, immutable di PDF
- **Audit Trail** — activity_logs collection: setiap login/edit/approve/delete tersimpan permanent dengan user_id, timestamp, IP
- **Data Ownership** — 100% on-premise MongoDB, data tidak keluar LAN

---

## 3. OWASP Top 10 (2021) Compliance Coverage

| # | Ancaman | Kontrol di Sistem | Status |
|---|---------|-------------------|--------|
| A01 | Broken Access Control | Role-based ACL + endpoint guards | ✅ |
| A02 | Cryptographic Failures | bcrypt, HTTPS, HTTP-only cookies | ✅ |
| A03 | Injection (SQL/NoSQL) | Motor async ORM (parameterized) | ✅ |
| A04 | Insecure Design | 4-layer approval workflow + audit trail | ✅ |
| A05 | Security Misconfiguration | Security headers middleware | ✅ |
| A06 | Vulnerable Components | Dependency lock (requirements.txt) | ⚠ Perlu review monthly |
| A07 | Auth & Session Failures | Rate limit + policy + lockout + idle timeout | ✅ |
| A08 | Software & Data Integrity | Approval signatures immutable | ✅ |
| A09 | Logging & Monitoring | activity_logs (login/edit/approve/delete) | ✅ |
| A10 | SSRF | Backend tidak accept URL user-controlled | ✅ |

---

## 4. Recommended Hardening untuk On-Premise Deployment

Untuk LAN internal:

1. **Nginx reverse proxy** di depan FastAPI (block direct port 8001 & MongoDB 27017 dari LAN)
2. **HTTPS internal** — self-signed cert atau internal CA (Let's Encrypt kalau ada internal domain)
3. **Firewall** — buka HANYA port 443, tutup 8001/3000/27017/22 dari LAN
4. **MongoDB authentication ON** — set username/password di .env
5. **Daily automated backup** ke drive/NAS terpisah (script disediakan) — monthly restore test
6. **Rotate JWT_SECRET quarterly** — new random 64-char, deploy semua user re-login
7. **Review audit logs weekly** — deteksi login/edit anomali
8. **Patch OS + Python + Node monthly** — apply security updates

---

## 5. Threat Model Ringkas

**Scope:** aplikasi web internal untuk 20-50 user di LAN.
**Attacker profile:** internal user dengan role rendah, atau IT staff dengan akses server.
**Attack surface:**
- Login page (mitigated: rate limit + policy + lockout)
- API endpoints (mitigated: JWT + RBAC + audit trail)
- MongoDB port (mitigated: firewall + MongoDB auth)
- Backup files (recommendation: encrypt di rest, akses terbatas)

**Residual risk & mitigasi bertahap:**
- **Physical server access** → mitigation: BIOS password + disk encryption (bitlocker / LUKS)
- **Screen shoulder-surfing** → mitigation: idle auto-logout 30 menit
- **Phishing internal user** → mitigation: security awareness training (non-technical)
- **Insider misuse role** → mitigation: audit log review + approval workflow requires 4-layer

---

## 6. Kesimpulan

Sistem menggunakan framework dan library yang dipakai oleh perusahaan enterprise skala global (Netflix, Facebook, Adobe). Layer security yang diterapkan sesuai standar OWASP Top 10 2021 dan best practice bank/fintech (bcrypt 12 rounds, rate limit, session management).

Untuk deployment LAN internal, mengikuti rekomendasi hardening di atas akan menghasilkan sistem dengan **security posture setara aplikasi web enterprise umum**, tanpa memerlukan lisensi vendor mahal.

---

*Dokumen internal MKS. Digenerate otomatis oleh sistem — bukan hasil audit pihak ketiga. Untuk audit formal external, silakan hubungi ISO consultant / CertNexus.*

**Purchasing Department · mks-management-system.local**
