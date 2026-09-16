import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from security import hash_password

async def reset_prod_password():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    db = client['procurement_mks']
    
    # Update agus password
    result = await db.users.update_one(
        {'username': 'agus'},
        {'$set': {'password': hash_password('prod123'), 'role': 'production'}}
    )
    
    if result.modified_count > 0:
        print('✅ Updated agus password to prod123 and role to production')
    else:
        print('⚠️ User agus not found or already has this password')
    
    # Verify
    user = await db.users.find_one({'username': 'agus'}, {'_id': 0, 'username': 1, 'role': 1})
    if user:
        print(f'   User: {user.get("username")}, Role: {user.get("role")}')
    
    client.close()

asyncio.run(reset_prod_password())
