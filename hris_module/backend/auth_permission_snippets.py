# Snippet perubahan Auth/Permission untuk mendukung modul HRD
# (Salin/adaptasi ke proyek HRIS baru: models.py, routers/auth.py, deps.py)

# =========================================================
# 1) models.py — tambahkan field `access` pada UserCreate & UserUpdate
# =========================================================
"""
class UserCreate(BaseModel):
    username: str
    password: str
    name: Optional[str] = ""
    role: Optional[str] = "staff"
    perms: Optional[List[str]] = None
    access: Optional[dict] = None                 # <-- permission matrix HRD
    must_change_password: Optional[bool] = None   # <-- paksa ganti password saat login pertama

class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    active: Optional[bool] = None
    password: Optional[str] = None
    perms: Optional[List[str]] = None
    access: Optional[dict] = None                 # <-- permission matrix HRD
"""

# =========================================================
# 2) routers/auth.py
# =========================================================
# a) VALID_ROLES: tambahkan role "hrd"
# b) Response LOGIN & /me: sertakan  "access": user.get("access") or {}
# c) _sanitize_user(): sertakan  "access": u.get("access") or {}
# d) create_user(): simpan  "access": payload.access or {},  "must_change_password": bool(payload.must_change_password)
# e) update_user(): jika payload.access is not None -> updates["access"] = dict(payload.access)

# =========================================================
# 3) deps.py — dipakai hrd.py
# =========================================================
# hrd.py meng-import:  from deps import get_current_user, log_action, is_super_admin_user
#  - is_super_admin_user(user): True jika user adalah super admin (username == SUPER_ADMIN_USERNAME)
#  - log_action(actor, action, entity, entity_id, details): tulis ke koleksi activity_logs
# get_current_user() harus mengembালikan dokumen user MENTAH (termasuk field `access` & `hrd_pin_hash`).

# =========================================================
# 4) security.py — dipakai hrd.py
# =========================================================
#  - hash_password(pin/pw), verify_password(plain, hash)
#  - JWT_SECRET, JWT_ALGORITHM  (untuk token PIN portal & PIN gaji)

# =========================================================
# 5) services/soft_delete.py — dipakai hrd.py
# =========================================================
#  - NOT_DELETED_FILTER  (dict filter mongo, mis. {"is_deleted": {"$ne": True}})
#  - soft_delete_one(collection, id)

# =========================================================
# 6) server.py — daftarkan router
# =========================================================
# from routers import hrd as hrd_router
# api_router.include_router(hrd_router.router)   # api_router sudah prefix "/api"
