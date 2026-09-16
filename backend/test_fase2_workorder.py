"""
Test suite for Engineering Work Order Fase 2/3/4 features.
Tests BOM locking, workgroup status, and review functionality.
"""
import requests
import sys
from datetime import datetime

BASE_URL = "https://error-fix-dev.preview.emergentagent.com/api"

# Test data from review request
LOCKED_DRF_ID = "15905b80-4c69-4145-954b-7433186ac679"
LOCKED_BOM_ID = "13457d0b-4df8-4646-9cd0-3f5c137f8af3"
UNLOCKED_DRF_ID = "4e58b362-9991-4f95-99b7-65b63a959a26"
UNLOCKED_DRAFT_DRAWING_ID = "743e21ce-61b6-4c70-93df-6f9563306008"

# Test credentials
ENG_LEADER_CREDS = {"username": "qaleader", "password": "QaLeader2026"}
ENG_STAFF_CREDS = {"username": "qastaff", "password": "QaStaff2026"}

class TestRunner:
    def __init__(self):
        self.session = requests.Session()
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.failures = []
        
    def login(self, username, password):
        """Login and store cookies"""
        print(f"\n🔐 Logging in as {username}...")
        try:
            resp = self.session.post(
                f"{BASE_URL}/auth/login",
                json={"username": username, "password": password},
                timeout=10
            )
            if resp.status_code == 200:
                print(f"✅ Login successful as {username}")
                return True
            else:
                print(f"❌ Login failed: {resp.status_code} - {resp.text[:200]}")
                return False
        except Exception as e:
            print(f"❌ Login error: {e}")
            return False
    
    def test(self, name, func):
        """Run a single test"""
        self.tests_run += 1
        print(f"\n🔍 Test {self.tests_run}: {name}")
        try:
            func()
            self.tests_passed += 1
            print(f"✅ PASSED")
        except AssertionError as e:
            self.tests_failed += 1
            self.failures.append({"test": name, "error": str(e)})
            print(f"❌ FAILED: {e}")
        except Exception as e:
            self.tests_failed += 1
            self.failures.append({"test": name, "error": f"Exception: {e}"})
            print(f"❌ ERROR: {e}")
    
    def assert_status(self, resp, expected, msg=""):
        """Assert response status code"""
        if resp.status_code != expected:
            raise AssertionError(
                f"{msg} Expected status {expected}, got {resp.status_code}. "
                f"Response: {resp.text[:300]}"
            )
    
    def assert_true(self, condition, msg):
        """Assert condition is true"""
        if not condition:
            raise AssertionError(msg)
    
    def assert_in(self, key, data, msg=""):
        """Assert key exists in data"""
        if key not in data:
            raise AssertionError(f"{msg} Key '{key}' not found in response. Keys: {list(data.keys())}")

def main():
    runner = TestRunner()
    
    # ========== Backend Tests ==========
    print("\n" + "="*60)
    print("BACKEND API TESTS - Engineering Work Order Fase 2/3/4")
    print("="*60)
    
    # Login as eng_staff first
    if not runner.login(ENG_STAFF_CREDS["username"], ENG_STAFF_CREDS["password"]):
        print("\n❌ Cannot proceed without login")
        return 1
    
    # Test 1: GET workgroup-status for LOCKED DRF
    def test_workgroup_status_locked():
        resp = runner.session.get(f"{BASE_URL}/drawing-requests/{LOCKED_DRF_ID}/workgroup-status", timeout=10)
        runner.assert_status(resp, 200, "Workgroup status for locked DRF")
        data = resp.json()
        runner.assert_in("locked", data)
        runner.assert_in("total_drawings", data)
        runner.assert_in("draft_count", data)
        runner.assert_in("counts", data)
        runner.assert_true(data["locked"] == True, f"Expected locked=True, got {data.get('locked')}")
        runner.assert_true(data["draft_count"] == 0, f"Expected draft_count=0 for locked SO, got {data.get('draft_count')}")
        counts = data.get("counts", {})
        runner.assert_in("bom_items", counts)
        runner.assert_in("nesting", counts)
        runner.assert_in("cad", counts)
        runner.assert_in("costing", counts)
        print(f"   Locked DRF status: total_drawings={data.get('total_drawings')}, draft_count={data.get('draft_count')}, locked={data.get('locked')}")
        print(f"   Counts: bom_items={counts.get('bom_items')}, nesting={counts.get('nesting')}, cad={counts.get('cad')}, costing={counts.get('costing')}")
    
    runner.test("GET workgroup-status for LOCKED DRF", test_workgroup_status_locked)
    
    # Test 2: GET workgroup-status for UNLOCKED DRF
    def test_workgroup_status_unlocked():
        resp = runner.session.get(f"{BASE_URL}/drawing-requests/{UNLOCKED_DRF_ID}/workgroup-status", timeout=10)
        runner.assert_status(resp, 200, "Workgroup status for unlocked DRF")
        data = resp.json()
        runner.assert_in("locked", data)
        runner.assert_true(data["locked"] == False, f"Expected locked=False, got {data.get('locked')}")
        runner.assert_true(data.get("draft_count", 0) > 0, f"Expected draft_count > 0 for unlocked SO, got {data.get('draft_count')}")
        print(f"   Unlocked DRF status: total_drawings={data.get('total_drawings')}, draft_count={data.get('draft_count')}, locked={data.get('locked')}")
    
    runner.test("GET workgroup-status for UNLOCKED DRF", test_workgroup_status_unlocked)
    
    # Test 3: POST BOM attachment upload - should return 409 when locked (non-admin)
    def test_bom_upload_locked_409():
        # Try to upload to locked BOM
        files = {'file': ('test.pdf', b'%PDF-1.4 fake pdf content', 'application/pdf')}
        data = {'category': 'nesting', 'remark': 'Test upload'}
        resp = runner.session.post(
            f"{BASE_URL}/bom/{LOCKED_BOM_ID}/attachments",
            files=files,
            data=data,
            timeout=10
        )
        runner.assert_status(resp, 409, "Upload to locked BOM should return 409")
        resp_data = resp.json()
        runner.assert_true(
            "terkunci" in resp_data.get("detail", "").lower() or "locked" in resp_data.get("detail", "").lower(),
            f"Expected lock error message, got: {resp_data.get('detail')}"
        )
        print(f"   Correctly blocked upload to locked BOM: {resp_data.get('detail')}")
    
    runner.test("POST BOM attachment upload returns 409 when SO locked", test_bom_upload_locked_409)
    
    # Test 4: POST BOM items-bulk - should return 409 when locked (non-admin)
    def test_bom_items_bulk_locked_409():
        payload = {
            "items": [
                {"item_name": "Test Item", "item_specification": "Test", "qty": 1, "uom": "pcs"}
            ]
        }
        resp = runner.session.post(
            f"{BASE_URL}/bom/{LOCKED_BOM_ID}/items-bulk",
            json=payload,
            timeout=10
        )
        runner.assert_status(resp, 409, "BOM items-bulk edit should return 409 when locked")
        resp_data = resp.json()
        runner.assert_true(
            "terkunci" in resp_data.get("detail", "").lower() or "locked" in resp_data.get("detail", "").lower(),
            f"Expected lock error message, got: {resp_data.get('detail')}"
        )
        print(f"   Correctly blocked BOM items edit: {resp_data.get('detail')}")
    
    runner.test("POST BOM items-bulk returns 409 when SO locked", test_bom_items_bulk_locked_409)
    
    # Test 5: Login as eng_leader for review tests
    if not runner.login(ENG_LEADER_CREDS["username"], ENG_LEADER_CREDS["password"]):
        print("\n❌ Cannot test review endpoints without eng_leader login")
    else:
        # Test 6: POST review with action='ok'
        def test_review_mark_ok():
            # First, get attachments to find one to review
            resp = runner.session.get(f"{BASE_URL}/bom/{LOCKED_BOM_ID}/attachments", timeout=10)
            runner.assert_status(resp, 200, "Get BOM attachments")
            data = resp.json()
            items = data.get("items", [])
            if not items:
                print("   ⚠️  No attachments found to test review")
                return
            
            # Find a non-drawing attachment (nesting/cad/costing)
            attach = None
            for item in items:
                if item.get("category") in ["nesting", "cad", "costing"]:
                    attach = item
                    break
            
            if not attach:
                print("   ⚠️  No suitable attachment found for review test")
                return
            
            attach_id = attach["id"]
            # Try to mark as OK
            resp = runner.session.post(
                f"{BASE_URL}/bom/{LOCKED_BOM_ID}/attachments/{attach_id}/review",
                json={"action": "ok"},
                timeout=10
            )
            runner.assert_status(resp, 200, "Review mark OK")
            resp_data = resp.json()
            runner.assert_true(resp_data.get("success"), "Expected success=True")
            runner.assert_true(resp_data.get("review_status") == "ok", f"Expected review_status='ok', got {resp_data.get('review_status')}")
            print(f"   Successfully marked attachment {attach_id} as OK")
        
        runner.test("POST review with action='ok' sets review_status='ok'", test_review_mark_ok)
        
        # Test 7: POST review with action='revise' without notes - should return 400
        def test_review_revise_no_notes_400():
            resp = runner.session.get(f"{BASE_URL}/bom/{LOCKED_BOM_ID}/attachments", timeout=10)
            data = resp.json()
            items = data.get("items", [])
            attach = None
            for item in items:
                if item.get("category") in ["nesting", "cad", "costing"]:
                    attach = item
                    break
            
            if not attach:
                print("   ⚠️  No suitable attachment found")
                return
            
            attach_id = attach["id"]
            resp = runner.session.post(
                f"{BASE_URL}/bom/{LOCKED_BOM_ID}/attachments/{attach_id}/review",
                json={"action": "revise", "notes": ""},
                timeout=10
            )
            runner.assert_status(resp, 400, "Review revise without notes should return 400")
            print(f"   Correctly rejected revise request without notes")
        
        runner.test("POST review with action='revise' and empty notes returns 400", test_review_revise_no_notes_400)
        
        # Test 8: POST review with action='revise' with notes - should set review_status='revise'
        def test_review_revise_with_notes():
            resp = runner.session.get(f"{BASE_URL}/bom/{LOCKED_BOM_ID}/attachments", timeout=10)
            data = resp.json()
            items = data.get("items", [])
            attach = None
            for item in items:
                if item.get("category") in ["nesting", "cad", "costing"]:
                    attach = item
                    break
            
            if not attach:
                print("   ⚠️  No suitable attachment found")
                return
            
            attach_id = attach["id"]
            resp = runner.session.post(
                f"{BASE_URL}/bom/{LOCKED_BOM_ID}/attachments/{attach_id}/review",
                json={"action": "revise", "notes": "Please update the nesting layout"},
                timeout=10
            )
            runner.assert_status(resp, 200, "Review revise with notes")
            resp_data = resp.json()
            runner.assert_true(resp_data.get("success"), "Expected success=True")
            runner.assert_true(resp_data.get("review_status") == "revise", f"Expected review_status='revise', got {resp_data.get('review_status')}")
            runner.assert_in("entry", resp_data, "Expected review_history entry")
            print(f"   Successfully requested revision for attachment {attach_id}")
        
        runner.test("POST review with action='revise' and notes sets review_status='revise'", test_review_revise_with_notes)
        
        # Test 9: POST review as non-privileged role - should return 403
        # Login as eng_staff again
        if runner.login(ENG_STAFF_CREDS["username"], ENG_STAFF_CREDS["password"]):
            def test_review_non_privileged_403():
                resp = runner.session.get(f"{BASE_URL}/bom/{LOCKED_BOM_ID}/attachments", timeout=10)
                data = resp.json()
                items = data.get("items", [])
                attach = None
                for item in items:
                    if item.get("category") in ["nesting", "cad", "costing"]:
                        attach = item
                        break
                
                if not attach:
                    print("   ⚠️  No suitable attachment found")
                    return
                
                attach_id = attach["id"]
                resp = runner.session.post(
                    f"{BASE_URL}/bom/{LOCKED_BOM_ID}/attachments/{attach_id}/review",
                    json={"action": "ok"},
                    timeout=10
                )
                runner.assert_status(resp, 403, "Non-privileged user review should return 403")
                print(f"   Correctly blocked non-privileged user from reviewing")
            
            runner.test("POST review as non-privileged role returns 403", test_review_non_privileged_403)
    
    # ========== Summary ==========
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    print(f"Total tests run: {runner.tests_run}")
    print(f"✅ Passed: {runner.tests_passed}")
    print(f"❌ Failed: {runner.tests_failed}")
    
    if runner.failures:
        print("\n❌ FAILED TESTS:")
        for i, failure in enumerate(runner.failures, 1):
            print(f"\n{i}. {failure['test']}")
            print(f"   Error: {failure['error']}")
    
    return 0 if runner.tests_failed == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
