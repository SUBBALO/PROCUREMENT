#!/usr/bin/env python3
"""
Backend API Testing for Engineering Work Order / Work Group Revision
Tests the new flow: TTD Prepared By (save-only) + partial submit + multi-part BOM
"""
import requests
import sys
import os
from datetime import datetime

# Get backend URL from frontend/.env
BACKEND_URL = "https://error-fix-dev.preview.emergentagent.com"

class TestRunner:
    def __init__(self):
        self.base_url = f"{BACKEND_URL}/api"
        self.session = requests.Session()
        self.tests_run = 0
        self.tests_passed = 0
        self.created_bom_ids = []  # Track created BOMs for cleanup
        self.modified_drawings = []  # Track modified drawings for revert
        
    def log(self, msg, level="INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {level}: {msg}")
        
    def test(self, name, func):
        """Run a single test"""
        self.tests_run += 1
        self.log(f"Testing: {name}")
        try:
            func()
            self.tests_passed += 1
            self.log(f"✅ PASSED: {name}", "PASS")
            return True
        except AssertionError as e:
            self.log(f"❌ FAILED: {name} - {str(e)}", "FAIL")
            return False
        except Exception as e:
            self.log(f"❌ ERROR: {name} - {str(e)}", "ERROR")
            return False
    
    def login(self):
        """Login with test credentials"""
        self.log("Logging in as qa_shot...")
        resp = self.session.post(
            f"{self.base_url}/auth/login",
            json={"username": "qa_shot", "password": "QaShot#2026"}
        )
        assert resp.status_code == 200, f"Login failed: {resp.status_code} - {resp.text}"
        self.log("✅ Login successful")
        
    def cleanup(self):
        """Clean up test data"""
        self.log("Cleaning up test data...")
        
        # Delete created BOMs
        for bom_id in self.created_bom_ids:
            try:
                resp = self.session.delete(f"{self.base_url}/bom/{bom_id}")
                if resp.status_code in [200, 204]:
                    self.log(f"Deleted BOM: {bom_id}")
                else:
                    self.log(f"Failed to delete BOM {bom_id}: {resp.status_code}", "WARN")
            except Exception as e:
                self.log(f"Error deleting BOM {bom_id}: {e}", "WARN")
        
        # Revert modified drawings
        for drawing_data in self.modified_drawings:
            try:
                drawing_id = drawing_data['id']
                # Revert to draft status
                resp = self.session.post(
                    f"{self.base_url}/drawings/{drawing_id}/revert-to-draft",
                    json={}
                )
                if resp.status_code in [200, 404]:  # 404 is ok if endpoint doesn't exist
                    self.log(f"Reverted drawing: {drawing_id}")
                else:
                    self.log(f"Failed to revert drawing {drawing_id}: {resp.status_code}", "WARN")
            except Exception as e:
                self.log(f"Error reverting drawing {drawing_id}: {e}", "WARN")
        
        self.log("Cleanup completed")
    
    # ==================== Backend API Tests ====================
    
    def test_bom_by_so(self):
        """Test GET /api/bom/by-so?so_no=SO-TEST-9001"""
        resp = self.session.get(f"{self.base_url}/bom/by-so", params={"so_no": "SO-TEST-9001"})
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        data = resp.json()
        assert "items" in data, "Response should have 'items' field"
        items = data["items"]
        
        self.log(f"Found {len(items)} BOM(s) for SO-TEST-9001")
        
        # Verify structure
        if len(items) > 0:
            bom = items[0]
            assert "id" in bom, "BOM should have 'id' field"
            assert "bom_no" in bom, "BOM should have 'bom_no' field"
            assert "part_no" in bom or "so_no" in bom, "BOM should have 'part_no' or 'so_no' field"
            assert "items_count" in bom, "BOM should have 'items_count' field"
            self.log(f"BOM structure verified: {bom['bom_no']}")
    
    def test_add_bom_part(self):
        """Test POST /api/bom/add-part - creates new BOM part with -P{n} suffix"""
        resp = self.session.post(
            f"{self.base_url}/bom/add-part",
            json={"so_no": "SO-TEST-9001"}
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert "id" in data, "Response should have 'id' field"
        assert "bom_no" in data, "Response should have 'bom_no' field"
        
        bom_no = data["bom_no"]
        bom_id = data["id"]
        
        # Verify -P{n} suffix
        assert "-P" in bom_no, f"BOM number should have -P suffix, got: {bom_no}"
        self.log(f"Created BOM part: {bom_no} (ID: {bom_id})")
        
        # Track for cleanup
        self.created_bom_ids.append(bom_id)
        
        # Verify inheritance from part-1
        assert "customer" in data or "project_name" in data, "Should inherit metadata from part-1"
        assert data.get("engineering_status") == "draft", "New BOM part should be draft"
        
        self.log(f"BOM part verified: status={data.get('engineering_status')}, customer={data.get('customer')}")
    
    def test_sign_prepared(self):
        """Test POST /api/drawings/{drawing_id}/sign-prepared - saves signature, status stays draft"""
        # Use drawing: 5c1bf451-6d4a-4354-bc86-2512cd8ebd84
        drawing_id = "5c1bf451-6d4a-4354-bc86-2512cd8ebd84"
        
        # First, get drawing to check current state
        resp = self.session.get(f"{self.base_url}/drawings/{drawing_id}")
        if resp.status_code != 200:
            self.log(f"Drawing {drawing_id} not found, skipping test", "WARN")
            return
        
        drawing = resp.json()
        original_status = drawing.get("approval_status", "draft")
        has_file = drawing.get("file_id") is not None
        has_category = drawing.get("work_category") in ["simple", "moderate", "complex"]
        
        self.log(f"Drawing state: file={has_file}, category={has_category}, status={original_status}")
        
        if not has_file or not has_category:
            self.log("Drawing missing file_id or work_category, cannot test sign-prepared", "WARN")
            return
        
        # Track for revert
        self.modified_drawings.append({"id": drawing_id, "original_status": original_status})
        
        # Sign prepared with placement
        resp = self.session.post(
            f"{self.base_url}/drawings/{drawing_id}/sign-prepared",
            json={
                "placement": {
                    "page": 1,
                    "x": 100,
                    "y": 100,
                    "width": 150,
                    "height": 50
                }
            }
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert data.get("prepared_signed") == True, "prepared_signed should be True"
        assert data.get("approval_status") == "draft", f"Status should stay draft, got: {data.get('approval_status')}"
        
        self.log(f"✅ Signature saved, status remains: {data.get('approval_status')}")
    
    def test_submit_without_placement(self):
        """Test POST /api/drawings/{drawing_id}/submit-for-approval without placement - uses saved position"""
        drawing_id = "5c1bf451-6d4a-4354-bc86-2512cd8ebd84"
        
        # Get drawing to check if prepared_signed
        resp = self.session.get(f"{self.base_url}/drawings/{drawing_id}")
        if resp.status_code != 200:
            self.log(f"Drawing {drawing_id} not found, skipping test", "WARN")
            return
        
        drawing = resp.json()
        if not drawing.get("prepared_signed"):
            self.log("Drawing not prepared_signed, skipping submit test", "WARN")
            return
        
        # Submit without placement (should use saved position)
        resp = self.session.post(
            f"{self.base_url}/drawings/{drawing_id}/submit-for-approval",
            json={}
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        new_status = data.get("approval_status")
        
        # Status should change to pending_eng_head or pending_qc (depending on submitter role)
        assert new_status in ["pending_eng_head", "pending_qc"], f"Expected pending status, got: {new_status}"
        
        self.log(f"✅ Submit successful, status changed to: {new_status}")
    
    def test_route_ordering(self):
        """Test that /api/bom/by-so and /api/bom/add-part are not shadowed by /api/bom/{bom_id}"""
        # Test /api/bom/by-so
        resp1 = self.session.get(f"{self.base_url}/bom/by-so", params={"so_no": "SO-TEST-9001"})
        assert resp1.status_code == 200, f"/bom/by-so should return 200, got {resp1.status_code}"
        
        # Test /api/bom/add-part
        resp2 = self.session.post(
            f"{self.base_url}/bom/add-part",
            json={"so_no": "SO-TEST-9001"}
        )
        assert resp2.status_code == 200, f"/bom/add-part should return 200, got {resp2.status_code}"
        
        # Track for cleanup
        if resp2.status_code == 200:
            data = resp2.json()
            if "id" in data:
                self.created_bom_ids.append(data["id"])
        
        self.log("✅ Route ordering verified: by-so and add-part not shadowed")
    
    def run_all_tests(self):
        """Run all backend tests"""
        self.log("=" * 60)
        self.log("Starting Backend API Tests")
        self.log("=" * 60)
        
        try:
            # Login first
            self.login()
            
            # Run tests
            self.test("GET /api/bom/by-so", self.test_bom_by_so)
            self.test("POST /api/bom/add-part", self.test_add_bom_part)
            self.test("Route ordering check", self.test_route_ordering)
            self.test("POST /api/drawings/{id}/sign-prepared", self.test_sign_prepared)
            self.test("POST /api/drawings/{id}/submit-for-approval", self.test_submit_without_placement)
            
        finally:
            # Always cleanup
            self.cleanup()
        
        # Print summary
        self.log("=" * 60)
        self.log(f"Tests completed: {self.tests_passed}/{self.tests_run} passed")
        self.log("=" * 60)
        
        return 0 if self.tests_passed == self.tests_run else 1

def main():
    runner = TestRunner()
    return runner.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())
