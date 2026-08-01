#!/usr/bin/env python3
"""
Backend API Test for BOM Revision Workflow
Tests: request-reopen, reopen-requests list, approve reopen, history with items
"""
import requests
import sys
from datetime import datetime

BASE_URL = "https://error-fix-dev.preview.emergentagent.com/api"

class BOMRevisionTester:
    def __init__(self):
        self.tests_run = 0
        self.tests_passed = 0
        self.eng_staff_token = None
        self.eng_leader_token = None
        self.test_bom_id = None
        self.test_so_no = None
        self.reopen_request_id = None

    def log(self, msg, level="INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {level}: {msg}")

    def run_test(self, name, func):
        """Run a single test"""
        self.tests_run += 1
        self.log(f"🔍 Testing: {name}")
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

    def login(self, username, password):
        """Login and return token"""
        self.log(f"Logging in as {username}...")
        resp = requests.post(f"{BASE_URL}/auth/login", json={"username": username, "password": password})
        assert resp.status_code == 200, f"Login failed: {resp.status_code} - {resp.text}"
        # Cookie auth - extract from cookies
        cookies = resp.cookies
        self.log(f"✓ Logged in as {username}")
        return cookies

    def test_login_eng_staff(self):
        """Test login as eng_staff"""
        self.eng_staff_token = self.login("engstaff", "Test@123")
        assert self.eng_staff_token is not None

    def test_login_eng_leader(self):
        """Test login as eng_leader"""
        self.eng_leader_token = self.login("riski", "Test@123")
        assert self.eng_leader_token is not None

    def test_find_approved_bom(self):
        """Find an APPROVED BOM to test reopen workflow"""
        self.log("Finding an APPROVED BOM...")
        resp = requests.get(f"{BASE_URL}/bom", params={"engineering_status": "approved", "limit": 10}, cookies=self.eng_staff_token)
        assert resp.status_code == 200, f"Failed to fetch BOMs: {resp.status_code}"
        data = resp.json()
        items = data.get("items", [])
        
        if not items:
            self.log("⚠️  No APPROVED BOMs found. Creating a test scenario note.", "WARN")
            # Try to find any BOM
            resp2 = requests.get(f"{BASE_URL}/bom", params={"limit": 5}, cookies=self.eng_staff_token)
            if resp2.status_code == 200:
                all_items = resp2.json().get("items", [])
                if all_items:
                    self.log(f"Found {len(all_items)} BOMs but none approved. Using first one for reference.", "WARN")
                    self.test_bom_id = all_items[0].get("id")
                    self.test_so_no = all_items[0].get("so_no")
                    self.log(f"Note: BOM {self.test_bom_id} status: {all_items[0].get('engineering_status', 'unknown')}", "WARN")
                    return
            raise AssertionError("No BOMs found in system to test")
        
        # Pick first approved BOM
        bom = items[0]
        self.test_bom_id = bom.get("id")
        self.test_so_no = bom.get("so_no")
        status = bom.get("engineering_status", "unknown")
        self.log(f"✓ Found BOM: {bom.get('bom_no')} (SO: {self.test_so_no}, status: {status})")
        assert self.test_bom_id is not None
        assert status == "approved", f"BOM status is {status}, expected 'approved'"

    def test_request_reopen_no_reason(self):
        """Test request-reopen without reason (should fail)"""
        self.log("Testing request-reopen without reason...")
        resp = requests.post(
            f"{BASE_URL}/bom/{self.test_bom_id}/request-reopen",
            json={"reason": ""},
            cookies=self.eng_staff_token
        )
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        self.log("✓ Correctly rejected empty reason")

    def test_request_reopen_short_reason(self):
        """Test request-reopen with short reason (< 8 chars, should fail)"""
        self.log("Testing request-reopen with short reason...")
        resp = requests.post(
            f"{BASE_URL}/bom/{self.test_bom_id}/request-reopen",
            json={"reason": "short"},
            cookies=self.eng_staff_token
        )
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        detail = resp.json().get("detail", "")
        assert "minimal 8 karakter" in detail.lower() or "8 karakter" in detail.lower(), f"Unexpected error: {detail}"
        self.log("✓ Correctly rejected short reason")

    def test_request_reopen_valid(self):
        """Test request-reopen with valid reason"""
        self.log("Testing request-reopen with valid reason...")
        reason = "Need to update material specification for item 3 as per customer request"
        resp = requests.post(
            f"{BASE_URL}/bom/{self.test_bom_id}/request-reopen",
            json={"reason": reason},
            cookies=self.eng_staff_token
        )
        assert resp.status_code == 200, f"Failed to create reopen request: {resp.status_code} - {resp.text}"
        data = resp.json()
        assert data.get("success") is True
        request = data.get("request", {})
        self.reopen_request_id = request.get("id")
        assert self.reopen_request_id is not None, "No request ID returned"
        assert request.get("bom_id") == self.test_bom_id
        assert request.get("reason") == reason
        assert request.get("status") == "pending"
        self.log(f"✓ Created reopen request: {self.reopen_request_id}")

    def test_list_reopen_requests_as_staff(self):
        """Test listing reopen requests as eng_staff (should see own)"""
        self.log("Testing list reopen requests as eng_staff...")
        resp = requests.get(f"{BASE_URL}/bom/_/reopen-requests", params={"status": "pending"}, cookies=self.eng_staff_token)
        assert resp.status_code == 200, f"Failed to list requests: {resp.status_code}"
        data = resp.json()
        items = data.get("items", [])
        assert len(items) > 0, "No pending requests found"
        # Should find our request
        found = any(r.get("id") == self.reopen_request_id for r in items)
        assert found, f"Our request {self.reopen_request_id} not found in list"
        self.log(f"✓ Found {len(items)} pending request(s) including ours")

    def test_list_reopen_requests_as_leader(self):
        """Test listing reopen requests as eng_leader (should see all)"""
        self.log("Testing list reopen requests as eng_leader...")
        resp = requests.get(f"{BASE_URL}/bom/_/reopen-requests", params={"status": "pending"}, cookies=self.eng_leader_token)
        assert resp.status_code == 200, f"Failed to list requests: {resp.status_code}"
        data = resp.json()
        items = data.get("items", [])
        assert len(items) > 0, "No pending requests found"
        # Should find our request
        found = any(r.get("id") == self.reopen_request_id for r in items)
        assert found, f"Our request {self.reopen_request_id} not found in leader's list"
        self.log(f"✓ Leader sees {len(items)} pending request(s)")

    def test_approve_reopen_request(self):
        """Test approving reopen request as eng_leader"""
        self.log("Testing approve reopen request...")
        # First, get BOM state before approve
        resp_before = requests.get(f"{BASE_URL}/bom/{self.test_bom_id}", cookies=self.eng_leader_token)
        assert resp_before.status_code == 200
        bom_before = resp_before.json()
        items_before = bom_before.get("items", [])
        status_before = bom_before.get("engineering_status")
        self.log(f"BOM before approve: status={status_before}, items={len(items_before)}")
        
        # Approve the reopen request
        resp = requests.post(
            f"{BASE_URL}/bom/_/reopen-requests/{self.reopen_request_id}/approve",
            cookies=self.eng_leader_token
        )
        assert resp.status_code == 200, f"Failed to approve: {resp.status_code} - {resp.text}"
        data = resp.json()
        assert data.get("success") is True
        assert data.get("engineering_status") == "draft", f"Expected draft, got {data.get('engineering_status')}"
        rev_no = data.get("rev_no")
        assert rev_no is not None, "No revision number returned"
        self.log(f"✓ Approved reopen request, BOM now draft, rev_no={rev_no}")
        
        # Verify BOM is now draft
        resp_after = requests.get(f"{BASE_URL}/bom/{self.test_bom_id}", cookies=self.eng_leader_token)
        assert resp_after.status_code == 200
        bom_after = resp_after.json()
        assert bom_after.get("engineering_status") == "draft", "BOM should be draft after reopen"
        
        # Verify revision entry was created
        revisions = bom_after.get("revisions", [])
        assert len(revisions) > 0, "No revision entries found"
        latest_rev = revisions[-1]  # Last revision
        assert latest_rev.get("rev_no") == rev_no
        assert "items_before" in latest_rev, "Revision should have items_before snapshot"
        items_snapshot = latest_rev.get("items_before", [])
        self.log(f"✓ Revision entry created with {len(items_snapshot)} items snapshot")

    def test_bom_history_endpoint(self):
        """Test GET /bom/history/{so_no} returns revisions with items"""
        self.log(f"Testing BOM history endpoint for SO {self.test_so_no}...")
        resp = requests.get(f"{BASE_URL}/bom/history/{self.test_so_no}", cookies=self.eng_staff_token)
        assert resp.status_code == 200, f"Failed to get history: {resp.status_code}"
        data = resp.json()
        assert data.get("so_no") == self.test_so_no
        revisions = data.get("revisions", [])
        assert len(revisions) > 0, "No revisions found in history"
        
        # Check each revision has required fields
        for rev in revisions:
            assert "rev_no" in rev, "Revision missing rev_no"
            assert "items" in rev, "Revision missing items array"
            assert isinstance(rev.get("items"), list), "items should be an array"
            # revision_reason may be empty for initial upload
            assert "revision_reason" in rev, "Revision missing revision_reason field"
        
        self.log(f"✓ History endpoint returned {len(revisions)} revision(s), all with items array")
        
        # Log sample revision info
        for i, rev in enumerate(revisions[:3]):  # Show first 3
            self.log(f"  Rev.{rev.get('rev_no')}: {len(rev.get('items', []))} items, reason: '{rev.get('revision_reason', '(none)')}'")

    def run_all_tests(self):
        """Run all tests in sequence"""
        print("\n" + "="*80)
        print("BOM REVISION WORKFLOW - BACKEND API TESTS")
        print("="*80 + "\n")
        
        # Login tests
        self.run_test("Login as eng_staff", self.test_login_eng_staff)
        self.run_test("Login as eng_leader", self.test_login_eng_leader)
        
        # Find test BOM
        self.run_test("Find APPROVED BOM for testing", self.test_find_approved_bom)
        
        if not self.test_bom_id:
            self.log("⚠️  Cannot continue without a test BOM", "ERROR")
            return
        
        # Reopen request tests
        self.run_test("Request reopen without reason (should fail)", self.test_request_reopen_no_reason)
        self.run_test("Request reopen with short reason (should fail)", self.test_request_reopen_short_reason)
        self.run_test("Request reopen with valid reason", self.test_request_reopen_valid)
        
        if not self.reopen_request_id:
            self.log("⚠️  Cannot continue without a reopen request", "ERROR")
            return
        
        # List requests
        self.run_test("List reopen requests as eng_staff", self.test_list_reopen_requests_as_staff)
        self.run_test("List reopen requests as eng_leader", self.test_list_reopen_requests_as_leader)
        
        # Approve reopen
        self.run_test("Approve reopen request as eng_leader", self.test_approve_reopen_request)
        
        # History endpoint
        self.run_test("GET /bom/history/{so_no} with items", self.test_bom_history_endpoint)
        
        # Summary
        print("\n" + "="*80)
        print(f"📊 BACKEND TEST SUMMARY: {self.tests_passed}/{self.tests_run} tests passed")
        print("="*80 + "\n")
        
        return 0 if self.tests_passed == self.tests_run else 1

def main():
    tester = BOMRevisionTester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())
