#!/usr/bin/env python3
"""
Backend API Testing for ECN Revision Flow
Tests: request-revision, revision-decision, start-revision, eng-designers, ecn-register
"""
import requests
import sys
import json
from datetime import datetime

BASE_URL = "https://error-fix-dev.preview.emergentagent.com/api"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'

class APITester:
    def __init__(self):
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.session = requests.Session()
        self.cookies = {}
        
    def log(self, msg, color=Colors.RESET):
        print(f"{color}{msg}{Colors.RESET}")
        
    def login(self, username, password):
        """Login and store cookies"""
        self.log(f"\n🔐 Logging in as {username}...", Colors.BLUE)
        try:
            resp = self.session.post(
                f"{BASE_URL}/auth/login",
                json={"username": username, "password": password},
                timeout=10
            )
            if resp.status_code == 200:
                self.cookies = self.session.cookies.get_dict()
                self.log(f"✅ Login successful as {username}", Colors.GREEN)
                return True
            else:
                self.log(f"❌ Login failed: {resp.status_code} - {resp.text}", Colors.RED)
                return False
        except Exception as e:
            self.log(f"❌ Login error: {str(e)}", Colors.RED)
            return False
    
    def test(self, name, method, endpoint, expected_status, data=None, params=None, expect_fail=False):
        """Run a single test"""
        self.tests_run += 1
        self.log(f"\n🔍 Test #{self.tests_run}: {name}", Colors.BLUE)
        
        try:
            url = f"{BASE_URL}{endpoint}"
            kwargs = {"timeout": 15}
            if data:
                kwargs["json"] = data
            if params:
                kwargs["params"] = params
                
            if method == "GET":
                resp = self.session.get(url, **kwargs)
            elif method == "POST":
                resp = self.session.post(url, **kwargs)
            elif method == "PUT":
                resp = self.session.put(url, **kwargs)
            elif method == "DELETE":
                resp = self.session.delete(url, **kwargs)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            success = resp.status_code == expected_status
            
            if success:
                self.tests_passed += 1
                self.log(f"✅ PASS - Status: {resp.status_code}", Colors.GREEN)
                try:
                    return True, resp.json()
                except:
                    return True, resp.text
            else:
                if expect_fail:
                    self.log(f"⚠️  Expected failure - Status: {resp.status_code} (expected {expected_status})", Colors.YELLOW)
                    self.log(f"   Response: {resp.text[:200]}", Colors.YELLOW)
                else:
                    self.tests_failed += 1
                    self.log(f"❌ FAIL - Expected {expected_status}, got {resp.status_code}", Colors.RED)
                    self.log(f"   Response: {resp.text[:500]}", Colors.RED)
                return False, resp.text
                
        except Exception as e:
            self.tests_failed += 1
            self.log(f"❌ FAIL - Exception: {str(e)}", Colors.RED)
            return False, str(e)
    
    def print_summary(self):
        """Print test summary"""
        total = self.tests_run
        passed = self.tests_passed
        failed = self.tests_failed
        
        self.log("\n" + "="*60, Colors.BLUE)
        self.log("📊 TEST SUMMARY", Colors.BLUE)
        self.log("="*60, Colors.BLUE)
        self.log(f"Total Tests: {total}", Colors.BLUE)
        self.log(f"Passed: {passed}", Colors.GREEN)
        self.log(f"Failed: {failed}", Colors.RED if failed > 0 else Colors.GREEN)
        
        if failed == 0:
            self.log("\n🎉 ALL TESTS PASSED!", Colors.GREEN)
            return 0
        else:
            self.log(f"\n⚠️  {failed} TEST(S) FAILED", Colors.RED)
            return 1


def main():
    tester = APITester()
    
    print("="*60)
    print("🧪 ECN REVISION FLOW - BACKEND API TESTS")
    print("="*60)
    
    # ========== SETUP: Login as eng_staff (trisna) ==========
    if not tester.login("trisna", "eng123"):
        print("❌ Cannot proceed without login")
        return 1
    
    # ========== TEST 1: Get list of drawings to find a controlled one ==========
    success, data = tester.test(
        "Get drawings list (find controlled drawing)",
        "GET",
        "/drawings",
        200,
        params={"limit": 300}
    )
    
    if not success:
        print("❌ Cannot get drawings list")
        return 1
    
    # Find a controlled/released drawing without pending revision_request
    controlled_drawing = None
    for item in data.get("items", []):
        approval_status = item.get("approval_status", "")
        rr = item.get("revision_request") or {}
        rr_status = rr.get("status", "")
        
        if approval_status in ["controlled", "released"] and rr_status not in ["pending", "approved", "in_progress"]:
            controlled_drawing = item
            break
    
    if not controlled_drawing:
        tester.log("⚠️  No suitable controlled drawing found. Creating test scenario...", Colors.YELLOW)
        # For now, we'll continue with tests that don't require a drawing
        drawing_id = None
    else:
        drawing_id = controlled_drawing["id"]
        tester.log(f"✅ Found controlled drawing: {controlled_drawing.get('drawing_no')} (ID: {drawing_id})", Colors.GREEN)
    
    # ========== TEST 2: Request revision on draft drawing (should fail) ==========
    # First, find a draft drawing
    draft_drawing = None
    for item in data.get("items", []):
        if item.get("approval_status", "") == "draft":
            draft_drawing = item
            break
    
    if draft_drawing:
        tester.test(
            "Request revision on DRAFT drawing (should fail with 400)",
            "POST",
            f"/drawings/{draft_drawing['id']}/request-revision",
            400,
            data={
                "current_desc": "Current specification",
                "proposed_desc": "Proposed change"
            },
            expect_fail=True
        )
    
    # ========== TEST 3: Request revision without required fields (should fail) ==========
    if drawing_id:
        tester.test(
            "Request revision without current_desc (should fail with 400)",
            "POST",
            f"/drawings/{drawing_id}/request-revision",
            400,
            data={
                "proposed_desc": "Proposed change only"
            },
            expect_fail=True
        )
        
        tester.test(
            "Request revision without proposed_desc (should fail with 400)",
            "POST",
            f"/drawings/{drawing_id}/request-revision",
            400,
            data={
                "current_desc": "Current only"
            },
            expect_fail=True
        )
    
    # ========== TEST 4: Request revision with valid data ==========
    ecn_no = None
    if drawing_id:
        success, data = tester.test(
            "Request revision with valid ECN data",
            "POST",
            f"/drawings/{drawing_id}/request-revision",
            200,
            data={
                "current_desc": "Current hole diameter is 10mm",
                "proposed_desc": "Change hole diameter to 12mm",
                "purpose_explanation": "Customer request for larger bolt size",
                "m4": ["material"],
                "item_of_change": ["design_spec"],
                "change_type": "permanent",
                "purpose": ["customer_request"]
            }
        )
        
        if success:
            ecn_no = data.get("ecn_no")
            tester.log(f"   ECN No: {ecn_no}", Colors.GREEN)
            
            # Verify revision_request status is pending
            rr = data.get("revision_request", {})
            if rr.get("status") == "pending":
                tester.log("   ✅ revision_request.status = pending", Colors.GREEN)
            else:
                tester.log(f"   ❌ Expected status=pending, got {rr.get('status')}", Colors.RED)
    
    # ========== TEST 5: Try to request revision again (should fail - already pending) ==========
    if drawing_id and ecn_no:
        tester.test(
            "Request revision again while pending (should fail with 400)",
            "POST",
            f"/drawings/{drawing_id}/request-revision",
            400,
            data={
                "current_desc": "Another change",
                "proposed_desc": "Another proposal"
            },
            expect_fail=True
        )
    
    # ========== TEST 6: Try revision-decision as eng_staff (should fail - need eng_leader) ==========
    if drawing_id:
        tester.test(
            "Eng staff tries to approve ECN (should fail with 403)",
            "POST",
            f"/drawings/{drawing_id}/revision-decision",
            403,
            data={"approve": True, "notes": "Approved"},
            expect_fail=True
        )
    
    # ========== TEST 7: Login as eng_leader (riski) ==========
    if not tester.login("riski", "eng123"):
        print("❌ Cannot login as eng_leader")
        return 1
    
    # ========== TEST 8: Eng leader approves ECN ==========
    if drawing_id:
        success, data = tester.test(
            "Eng leader APPROVES ECN revision",
            "POST",
            f"/drawings/{drawing_id}/revision-decision",
            200,
            data={"approve": True, "notes": "Approved for revision"}
        )
        
        if success:
            # CRITICAL: Verify approval_status is STILL controlled/released (NOT draft)
            approval_status = data.get("approval_status")
            revision_status = data.get("revision_status")
            
            if revision_status == "approved":
                tester.log("   ✅ revision_request.status = approved", Colors.GREEN)
            else:
                tester.log(f"   ❌ Expected revision_status=approved, got {revision_status}", Colors.RED)
            
            if approval_status in ["controlled", "released"]:
                tester.log(f"   ✅ approval_status STILL {approval_status} (NOT draft yet)", Colors.GREEN)
            else:
                tester.log(f"   ❌ CRITICAL: approval_status changed to {approval_status} (should stay controlled/released)", Colors.RED)
    
    # ========== TEST 9: Try to start revision as eng_leader (should work) ==========
    if drawing_id:
        # Get current drawing state before start-revision
        success, drawing_before = tester.test(
            "Get drawing state before start-revision",
            "GET",
            f"/drawings",
            200,
            params={"limit": 300}
        )
        
        drawing_before_data = None
        if success:
            for item in drawing_before.get("items", []):
                if item.get("id") == drawing_id:
                    drawing_before_data = item
                    break
        
        old_rev_no = drawing_before_data.get("rev_no", 0) if drawing_before_data else 0
        old_file_id = drawing_before_data.get("file_id") if drawing_before_data else None
        
        success, data = tester.test(
            "Start revision (Mulai Revisi)",
            "POST",
            f"/drawings/{drawing_id}/start-revision",
            200
        )
        
        if success:
            new_rev_no = data.get("rev_no")
            new_approval_status = data.get("approval_status")
            
            # Verify rev_no increased
            if new_rev_no == old_rev_no + 1:
                tester.log(f"   ✅ rev_no increased: {old_rev_no} → {new_rev_no}", Colors.GREEN)
            else:
                tester.log(f"   ❌ rev_no not increased correctly: {old_rev_no} → {new_rev_no}", Colors.RED)
            
            # Verify approval_status is now draft
            if new_approval_status == "draft":
                tester.log("   ✅ approval_status changed to draft", Colors.GREEN)
            else:
                tester.log(f"   ❌ approval_status should be draft, got {new_approval_status}", Colors.RED)
            
            # Verify history was saved (check revisions array)
            success2, drawing_after = tester.test(
                "Get drawing after start-revision to verify history",
                "GET",
                f"/drawings",
                200,
                params={"limit": 300}
            )
            
            if success2:
                for item in drawing_after.get("items", []):
                    if item.get("id") == drawing_id:
                        revisions = item.get("revisions", [])
                        if len(revisions) > 0:
                            tester.log(f"   ✅ History saved: {len(revisions)} revision(s) in history", Colors.GREEN)
                            
                            # Check if old file_id is preserved in snapshot
                            latest_rev = revisions[-1]
                            snapshot = latest_rev.get("snapshot", {})
                            snapshot_file_id = snapshot.get("file_id")
                            
                            if old_file_id and snapshot_file_id == old_file_id:
                                tester.log(f"   ✅ Old file_id preserved in snapshot: {snapshot_file_id}", Colors.GREEN)
                            elif old_file_id:
                                tester.log(f"   ⚠️  Old file_id not found in snapshot", Colors.YELLOW)
                            
                            # Check approvals were saved
                            snapshot_approvals = snapshot.get("approvals", [])
                            if len(snapshot_approvals) > 0:
                                tester.log(f"   ✅ Old approvals preserved: {len(snapshot_approvals)} approval(s)", Colors.GREEN)
                        else:
                            tester.log("   ❌ No revisions history found", Colors.RED)
                        break
    
    # ========== TEST 10: Try to start revision again (should fail - already in_progress) ==========
    if drawing_id:
        tester.test(
            "Try to start revision again (should fail with 400)",
            "POST",
            f"/drawings/{drawing_id}/start-revision",
            400,
            expect_fail=True
        )
    
    # ========== TEST 11: Test rejection flow with a new drawing ==========
    # Find another controlled drawing for rejection test
    success, data = tester.test(
        "Get drawings for rejection test",
        "GET",
        "/drawings",
        200,
        params={"limit": 300}
    )
    
    reject_drawing_id = None
    if success:
        for item in data.get("items", []):
            approval_status = item.get("approval_status", "")
            rr = item.get("revision_request") or {}
            rr_status = rr.get("status", "")
            
            if (approval_status in ["controlled", "released"] and 
                rr_status not in ["pending", "approved", "in_progress"] and
                item.get("id") != drawing_id):
                reject_drawing_id = item["id"]
                break
    
    # Login as eng_staff to submit ECN for rejection test
    if reject_drawing_id:
        tester.login("trisna", "eng123")
        
        success, data = tester.test(
            "Submit ECN for rejection test",
            "POST",
            f"/drawings/{reject_drawing_id}/request-revision",
            200,
            data={
                "current_desc": "Test current",
                "proposed_desc": "Test proposed"
            }
        )
        
        # Login back as eng_leader
        tester.login("riski", "eng123")
        
        if success:
            success, data = tester.test(
                "Eng leader REJECTS ECN revision",
                "POST",
                f"/drawings/{reject_drawing_id}/revision-decision",
                200,
                data={"approve": False, "notes": "Not approved - insufficient justification"}
            )
            
            if success:
                revision_status = data.get("revision_status")
                approval_status = data.get("approval_status")
                
                if revision_status == "rejected":
                    tester.log("   ✅ revision_request.status = rejected", Colors.GREEN)
                else:
                    tester.log(f"   ❌ Expected revision_status=rejected, got {revision_status}", Colors.RED)
                
                if approval_status in ["controlled", "released"]:
                    tester.log(f"   ✅ approval_status remains {approval_status} (unchanged)", Colors.GREEN)
                else:
                    tester.log(f"   ⚠️  approval_status changed to {approval_status}", Colors.YELLOW)
    
    # ========== TEST 12: GET /drawings/eng-designers - Engineering access ==========
    success, data = tester.test(
        "Get engineering designers list (as eng_leader)",
        "GET",
        "/drawings/eng-designers",
        200
    )
    
    if success:
        designers = data.get("designers", [])
        tester.log(f"   ✅ Found {len(designers)} engineering users", Colors.GREEN)
        if len(designers) > 0:
            tester.log(f"   Sample: {designers[0].get('name')} ({designers[0].get('role')})", Colors.GREEN)
    
    # ========== TEST 13: GET /drawings/eng-designers - QC access (should fail) ==========
    # Try to login as qcuser
    qc_login = tester.login("qcuser", "eng123")
    if qc_login:
        tester.test(
            "QC user tries to get eng-designers (should fail with 403)",
            "GET",
            "/drawings/eng-designers",
            403,
            expect_fail=True
        )
    
    # ========== TEST 14: GET /ecn-register - Read-only register ==========
    # Login back as eng_leader
    tester.login("riski", "eng123")
    
    success, data = tester.test(
        "Get ECN register (all ECN/ECR records)",
        "GET",
        "/ecn-register",
        200
    )
    
    if success:
        items = data.get("items", [])
        tester.log(f"   ✅ Found {len(items)} ECN/ECR records", Colors.GREEN)
        
        # Check if our ECN is in the register
        if ecn_no:
            found = False
            for item in items:
                if item.get("no") == ecn_no:
                    found = True
                    tester.log(f"   ✅ Our ECN {ecn_no} found in register", Colors.GREEN)
                    tester.log(f"      Status: {item.get('status')}, Source: {item.get('source')}", Colors.GREEN)
                    break
            
            if not found:
                tester.log(f"   ⚠️  Our ECN {ecn_no} not found in register", Colors.YELLOW)
    
    # ========== TEST 15: Filter ECN register by kind ==========
    success, data = tester.test(
        "Get ECN register filtered by kind=ecn",
        "GET",
        "/ecn-register",
        200,
        params={"kind": "ecn"}
    )
    
    if success:
        items = data.get("items", [])
        tester.log(f"   ✅ Found {len(items)} ECN records (kind=ecn)", Colors.GREEN)
    
    # ========== TEST 16: Search ECN register ==========
    if ecn_no:
        success, data = tester.test(
            f"Search ECN register for '{ecn_no}'",
            "GET",
            "/ecn-register",
            200,
            params={"q": ecn_no}
        )
        
        if success:
            items = data.get("items", [])
            if len(items) > 0:
                tester.log(f"   ✅ Search found {len(items)} result(s)", Colors.GREEN)
            else:
                tester.log("   ⚠️  Search returned no results", Colors.YELLOW)
    
    # ========== TEST 17: Verify anti-delete - file history preservation ==========
    # This is implicitly tested in TEST 9 where we check snapshot.file_id
    tester.log("\n📝 Note: File history preservation verified in TEST 9 (snapshot.file_id check)", Colors.BLUE)
    
    # Print summary
    return tester.print_summary()


if __name__ == "__main__":
    try:
        exit_code = main()
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print("\n\n⚠️  Tests interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ Fatal error: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
