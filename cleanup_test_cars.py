"""Cleanup script to remove test CAR records from database
As instructed: Delete all CAR records created during testing, attachments, and counters
"""
import os
import sys
from pymongo import MongoClient
from dotenv import load_dotenv

# Load environment
load_dotenv(os.path.join(os.path.dirname(__file__), "backend", ".env"))

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "procurement_mks")

print("=== Cleanup Test CAR Records ===\n")

try:
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    
    # 1. Get all test NC IDs (created today during testing)
    print("1. Finding test CAR records...")
    
    # Get all NCs created today (test records)
    from datetime import datetime, timezone
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    test_ncs = list(db.nonconformances.find(
        {"created_at": {"$regex": f"^{today}"}},
        {"_id": 0, "id": 1, "nc_no": 1}
    ))
    
    print(f"   Found {len(test_ncs)} CAR records created today")
    for nc in test_ncs[:5]:  # Show first 5
        print(f"   - {nc.get('nc_no')}")
    if len(test_ncs) > 5:
        print(f"   ... and {len(test_ncs) - 5} more")
    
    # 2. Delete attachments for these NCs
    print("\n2. Deleting attachments...")
    nc_ids = [nc["id"] for nc in test_ncs]
    
    if nc_ids:
        att_result = db.nc_attachments.delete_many({"nc_id": {"$in": nc_ids}})
        print(f"   Deleted {att_result.deleted_count} attachments")
    
    # 3. Delete NC records
    print("\n3. Deleting CAR records...")
    if nc_ids:
        nc_result = db.nonconformances.delete_many({"id": {"$in": nc_ids}})
        print(f"   Deleted {nc_result.deleted_count} CAR records")
    
    # 4. Remove CAR counters
    print("\n4. Removing CAR counters...")
    counter_result = db.counters.delete_many({"_id": {"$regex": "^car_"}})
    print(f"   Deleted {counter_result.deleted_count} counter records")
    
    print("\n✅ Cleanup complete!")
    print(f"\nSummary:")
    print(f"  - CAR records deleted: {nc_result.deleted_count if nc_ids else 0}")
    print(f"  - Attachments deleted: {att_result.deleted_count if nc_ids else 0}")
    print(f"  - Counters deleted: {counter_result.deleted_count}")
    
except Exception as e:
    print(f"\n❌ Error during cleanup: {str(e)}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
finally:
    client.close()

print("\n✅ Database cleaned - ready for production use")
