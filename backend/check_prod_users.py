import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def check_users():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    db = client['procurement_mks']
    
    # Find users with production-related roles
    prod_users = await db.users.find(
        {'role': {'$in': ['production', 'produksi']}},
        {'_id': 0, 'username': 1, 'name': 1, 'role': 1, 'active': 1}
    ).to_list(length=100)
    
    print('Production users found:')
    for u in prod_users:
        print(f"  - {u.get('username')} (name: {u.get('name')}, role: {u.get('role')}, active: {u.get('active')})")
    
    if not prod_users:
        print('  No production users found!')
        print('\nCreating test production user...')
        from security import hash_password
        await db.users.insert_one({
            'id': 'test-prod-user-001',
            'username': 'prodtest',
            'password': hash_password('prod123'),
            'name': 'Production Test User',
            'role': 'production',
            'active': True
        })
        print('  Created: prodtest / prod123 (role: production)')
    
    client.close()

asyncio.run(check_users())
