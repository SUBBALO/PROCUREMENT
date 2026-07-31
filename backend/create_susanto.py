"""One-off: create/ensure super-admin user 'susanto' exists (password: admin123)."""
import asyncio
import uuid
from db import db
from deps import _now_iso
from security import hash_password


async def main():
    username = "susanto"
    password = "admin123"
    existing = await db.users.find_one({"username": username})
    if existing:
        await db.users.update_one(
            {"username": username},
            {"$set": {
                "password_hash": hash_password(password),
                "role": "super_admin",
                "active": True,
                "is_super_admin": True,
                "perms": list(set((existing.get("perms") or []) + ["approve_store_requests"])),
            }},
        )
        print(f"UPDATED existing user '{username}' -> super_admin, password reset to '{password}'")
    else:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "username": username,
            "password_hash": hash_password(password),
            "name": "Susanto",
            "role": "super_admin",
            "active": True,
            "is_super_admin": True,
            "perms": ["approve_store_requests"],
            "created_at": _now_iso(),
        })
        print(f"CREATED super-admin user '{username}' with password '{password}'")


if __name__ == "__main__":
    asyncio.run(main())
