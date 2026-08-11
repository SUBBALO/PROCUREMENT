# ERP MKS — Granular Permission System (Accurate-style)

## Context
User wants an Accurate-style **compact/dense** permission editor inside the Admin Panel → Edit User dialog.
Confirmed decisions:
- Matrix as a **table inside Edit User dialog** (module rows × action columns).
- Compact/dense UI (small font, short rows, many modules on one screen).
- **Do UI + full backend enforcement in ONE batch.**
- Save `access` per user. Super Admin only controls it.
- Do NOT change existing ERP menus/content.

## Existing foundation
- `/app/backend/permissions.py` — complete REGISTRY (module→activities→prefixes), ACTIONS, path→menu_key + method→action mapping, check_access(). Ready to wire.
- Enforcement rule (non-regressive): only users with an explicit `access` matrix are enforced; super_admin always bypasses; users without `access` keep legacy role behavior.

## Phase 1: Backend (Status: COMPLETED)
- models.py: added `access: Optional[dict]` to UserCreate & UserUpdate
- auth.py: persist/return `access` (login, /auth/me, _sanitize_user, create_user, update_user); added `GET /permissions/registry` (super_admin); `is_super_admin` now honors DB flag too (consistent with backend)
- server.py: added centralized permission-enforcement HTTP middleware using permissions.py

## Phase 2: Frontend compact matrix (Status: COMPLETED)
- New `components/AccessMatrix.jsx` compact dense component (module groups, 6 action columns, row/column/module select-all, search, master full/clear)
- Wired into EditUserDialog; widened dialog (sm:max-w-2xl); load & save `access`; "Atur manual" toggle (off = clear → default role)
- No existing ERP menus/content changed

## Phase 3: Testing (Status: COMPLETED)
- Backend curl: registry gated to super_admin ✅ ; login/me return access ✅ ; PUT save persists+normalizes ✅
- Enforcement verified: GET /quotations 200 (view), POST /quotations 403 (no create), GET /orders 403 (not granted), /auth/me 200 (exempt) ✅
- Legacy non-regression: user without `access` unaffected (404/422 not 403) ✅
- Frontend esbuild compile clean; screenshot shows dense Accurate-style matrix ✅
- Temp test users (zz_perm_tester, zz_enf) removed

## Phase 4: Compact "Accurate-style" UI (Status: COMPLETED)
- Redesigned Input Transaksi Pembelian to dense Accurate look. User approved.
- Applied GLOBAL compact density layer scoped to `<main>` (`.erp-dense` in index.css) → all authenticated pages/forms/tables match Input Transaksi sizing. Verified Store/Master List/Input.
- Incoming Goods: compacted title + 2 shortcut cards (slim horizontal tiles) + filter card → data table now sits near top. Verified via screenshot.

## Phase 5: Backup upgrade (Status: COMPLETED)
- backup.py rewritten self-contained (no missing script dep):
  - `GET /full-download`: builds tar.gz on the fly = manifest.json + data/mks_data_backup.json + code/ (excludes node_modules/.git/etc). super_admin only. (~3.9MB, 400 entries verified)
  - `POST /full-restore`: restores DATA to Mongo (merge/replace) + extracts CODE to /app/_full_restore_<ts>/ staging (never overwrites live code). Confirm phrase 'RESTORE-FULL'. Verified (3333 docs + 366 files; bad phrase→400).
  - `GET /version`: real git info (commit/branch/date/message + update check).
- AdminPage BackupTab UI: Version/Build panel, "Full Backup (Kode+Data)" download button, "Restore Full Backup" (file + mode + phrase). Verified via screenshot; esbuild clean.
- Note: Radix dialog inputs (portaled) not covered by `.erp-dense` scope — optional follow-up.
