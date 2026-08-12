"""
Backend API Tests for Engineering Phase 2 Flow
Tests: Repeat Order auto-pull, QC View-Only + TTD approval
"""
import requests
import sys
from datetime import datetime

BASE_URL = "https://error-fix-dev.preview.emergentagent.com/api"

class EngineeringPhase2Tester:
    def __init__(self):
        self.tests_run = 0
        self.tests_passed = 0
        self.sessions = {}  # Store session objects per user
        self.test_data = {}
        
    def log(self, msg, status="info"):
        prefix = {
            "pass": "✅",
            "fail": "❌",
            "info": "🔍",
            "warn": "⚠️"
        }.get(status, "ℹ️")
        print(f"{prefix} {msg}")
    
    def run_test(self, name, method, endpoint, expected_status, data=None, session=None, params=None):
        """Run a single API test"""
        url = f"{BASE_URL}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        # Use session if provided, otherwise create a new request
        if session is None:
            session = requests.Session()
        
        self.tests_run += 1
        self.log(f"Testing {name}...", "info")
        
        try:
            if method == 'GET':
                response = session.get(url, headers=headers, params=params, timeout=15)
            elif method == 'POST':
                response = session.post(url, json=data, headers=headers, timeout=15)
            elif method == 'PUT':
                response = session.put(url, json=data, headers=headers, timeout=15)
            
            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                self.log(f"PASSED - Status: {response.status_code}", "pass")
                try:
                    return True, response.json()
                except Exception:
                    return True, {}
            else:
                self.log(f"FAILED - Expected {expected_status}, got {response.status_code}", "fail")
                try:
                    error_detail = response.json()
                    self.log(f"Response: {error_detail}", "fail")
                except Exception:
                    self.log(f"Response text: {response.text[:300]}", "fail")
                return False, {}
        
        except Exception as e:
            self.log(f"FAILED - Error: {str(e)}", "fail")
            return False, {}
    
    def login(self, username, password):
        """Login and create session"""
        self.log(f"Logging in as {username}...", "info")
        
        # Create a new session for this user
        session = requests.Session()
        
        success, response = self.run_test(
            f"Login as {username}",
            "POST",
            "auth/login",
            200,
            data={"username": username, "password": password},
            session=session
        )
        if success and response.get('username') == username:
            self.sessions[username] = session
            self.test_data[f'{username}_user'] = response
            self.log(f"Login successful for {username} (role: {response.get('role')})", "pass")
            return True
        self.log(f"Login failed for {username}", "fail")
        return False
    
    def test_repeat_search_drawings(self):
        """Test GET /api/drawings/repeat-search?q=<query>"""
        self.log("\n=== Testing Repeat Order Search ===", "info")
        session = self.sessions.get('engstaff')
        
        # Test search by SO number
        success, response = self.run_test(
            "Search old drawings by SO (SO-QATEST-5555)",
            "GET",
            "drawings/repeat-search",
            200,
            session=session,
            params={"q": "SO-QATEST-5555"}
        )
        
        if success:
            items = response.get('items', [])
            self.log(f"Found {len(items)} old drawings for SO-QATEST-5555", "pass")
            
            # Verify response structure
            if items:
                first = items[0]
                required_fields = ['id', 'drawing_no', 'so_no', 'bom_id', 'bom_no', 
                                 'has_mks', 'has_customer_ref', 'has_nesting', 'has_costing',
                                 'customer_code', 'project_initial', 'drawing_type']
                missing = [f for f in required_fields if f not in first]
                if not missing:
                    self.log("Response structure correct - all required fields present", "pass")
                    self.test_data['old_drawings'] = items
                else:
                    self.log(f"Missing fields in response: {missing}", "fail")
            else:
                self.log("No old drawings found - will test with 'DWG' or 'THIES'", "warn")
        
        # Test search by drawing number pattern
        success2, response2 = self.run_test(
            "Search old drawings by pattern (DWG)",
            "GET",
            "drawings/repeat-search",
            200,
            session=session,
            params={"q": "DWG"}
        )
        
        if success2:
            items2 = response2.get('items', [])
            self.log(f"Found {len(items2)} drawings matching 'DWG'", "pass")
            if items2 and not self.test_data.get('old_drawings'):
                self.test_data['old_drawings'] = items2
        
        # Test search by customer
        success3, response3 = self.run_test(
            "Search old drawings by customer (THIES)",
            "GET",
            "drawings/repeat-search",
            200,
            session=session,
            params={"q": "THIES"}
        )
        
        if success3:
            items3 = response3.get('items', [])
            self.log(f"Found {len(items3)} drawings for customer THIES", "pass")
            if items3 and not self.test_data.get('old_drawings'):
                self.test_data['old_drawings'] = items3
        
        return success or success2 or success3
    
    def test_create_repeat_order_drf(self):
        """Create a repeat_order DRF for testing pull-repeat"""
        self.log("\n=== Creating Repeat Order DRF ===", "info")
        session = self.sessions.get('salesuser')
        
        success, response = self.run_test(
            "Create repeat_order DRF",
            "POST",
            "drawing-requests",
            200,
            data={
                "request_type": "repeat_order",
                "so_no": "SO-TEST-REPEAT-001",
                "ref_so_no": "SO-QATEST-5555",
                "customer_code": "THIES",
                "customer_name": "THIES, PT",
                "project_name": "Test Repeat Order",
                "qty_order": 3,
                "unit": "pcs",
                "material": "TBA"
            },
            session=session
        )
        
        if success:
            drf_id = response.get('id')
            form_no = response.get('form_no')
            self.log(f"Repeat Order DRF created: {form_no}", "pass")
            self.test_data['repeat_drf_id'] = drf_id
            self.test_data['repeat_drf_form_no'] = form_no
            
            # Submit the DRF
            success2, _ = self.run_test(
                "Submit repeat order DRF",
                "POST",
                f"drawing-requests/{drf_id}/submit",
                200,
                session=session
            )
            
            if success2:
                self.log("DRF submitted successfully", "pass")
        
        return success
    
    def test_accept_assign_repeat_drf(self):
        """Accept and assign the repeat order DRF"""
        self.log("\n=== Accept & Assign Repeat Order DRF ===", "info")
        session = self.sessions.get('riski')
        
        drf_id = self.test_data.get('repeat_drf_id')
        if not drf_id:
            self.log("No repeat DRF ID available", "warn")
            return False
        
        # Get engstaff user ID
        engstaff_user = self.test_data.get('engstaff_user')
        if not engstaff_user:
            self.log("engstaff user data not available", "fail")
            return False
        
        engstaff_id = engstaff_user.get('id')
        
        success, response = self.run_test(
            "Accept & assign repeat DRF to engstaff",
            "POST",
            f"drawing-requests/{drf_id}/accept-assign",
            200,
            data={
                "assigned_engineer_id": engstaff_id,
                "assigned_engineer_name": "engstaff"
            },
            session=session
        )
        
        if success:
            self.log(f"DRF accepted and assigned to engstaff", "pass")
            if response.get('status') == 'accepted':
                self.log("Status correctly set to 'accepted'", "pass")
        
        return success
    
    def test_pull_repeat_drawings(self):
        """Test POST /api/drawing-requests/{drf_id}/pull-repeat"""
        self.log("\n=== Testing Pull Repeat Drawings ===", "info")
        session = self.sessions.get('engstaff')
        
        drf_id = self.test_data.get('repeat_drf_id')
        old_drawings = self.test_data.get('old_drawings', [])
        
        if not drf_id:
            self.log("No repeat DRF ID available", "warn")
            return False
        
        if not old_drawings:
            self.log("No old drawings available to pull", "warn")
            return False
        
        # Select first 2 old drawings to pull
        source_ids = [d['id'] for d in old_drawings[:2]]
        
        success, response = self.run_test(
            f"Pull {len(source_ids)} old drawings into new DRF",
            "POST",
            f"drawing-requests/{drf_id}/pull-repeat",
            200,
            data={
                "source_drawing_ids": source_ids,
                "class_material": "RAW MATERIAL FOR QTY 3 PCS"
            },
            session=session
        )
        
        if success:
            drawings = response.get('drawings', [])
            shared_bom_id = response.get('shared_bom_id')
            
            self.log(f"Successfully pulled {len(drawings)} drawings", "pass")
            self.log(f"Shared BOM ID: {shared_bom_id}", "pass")
            
            # Verify all drawings share the same BOM
            if len(drawings) >= 2:
                bom_ids = [d.get('bom_id') for d in drawings]
                if all(bid == shared_bom_id for bid in bom_ids):
                    self.log("All pulled drawings share the same BOM ✓", "pass")
                else:
                    self.log(f"BOM IDs don't match: {bom_ids}", "fail")
            
            # Verify repeat metadata
            first_drawing = drawings[0]
            if first_drawing.get('is_repeat_pulled'):
                self.log("is_repeat_pulled flag set correctly", "pass")
            else:
                self.log("is_repeat_pulled flag not set", "fail")
            
            if first_drawing.get('pulled_from_drawing_no'):
                self.log(f"pulled_from_drawing_no: {first_drawing.get('pulled_from_drawing_no')}", "pass")
            
            # Store for later tests
            self.test_data['pulled_drawing_ids'] = [d.get('id') for d in drawings]
            self.test_data['pulled_drawings'] = drawings
        
        return success
    
    def test_pull_repeat_permission_non_assignee(self):
        """Test that non-assignee cannot pull repeat drawings"""
        self.log("\n=== Testing Pull-Repeat Permission (Non-Assignee) ===", "info")
        session = self.sessions.get('salesuser')  # Sales user is not the assignee
        
        drf_id = self.test_data.get('repeat_drf_id')
        old_drawings = self.test_data.get('old_drawings', [])
        
        if not drf_id or not old_drawings:
            self.log("Test data not available", "warn")
            return False
        
        source_ids = [old_drawings[0]['id']]
        
        # Sales user should get 403
        success, response = self.run_test(
            "Non-assignee tries to pull-repeat (should fail with 403)",
            "POST",
            f"drawing-requests/{drf_id}/pull-repeat",
            403,  # Expecting 403 Forbidden
            data={
                "source_drawing_ids": source_ids,
                "class_material": "TEST"
            },
            session=session
        )
        
        if success:
            self.log("Permission check working - non-assignee correctly denied", "pass")
        else:
            self.log("Permission check failed - non-assignee should not be able to pull-repeat", "fail")
        
        return success
    
    def test_qc_pending_approval(self):
        """Test GET /api/drawings/pending-my-approval for QC role"""
        self.log("\n=== Testing QC Pending Approval List ===", "info")
        session = self.sessions.get('qcuser')
        
        success, response = self.run_test(
            "Get drawings pending QC approval",
            "GET",
            "drawings/pending-my-approval",
            200,
            session=session
        )
        
        if success:
            items = response.get('items', [])
            self.log(f"Found {len(items)} drawings pending QC approval", "pass")
            
            # Verify all items are in pending_qc status
            if items:
                all_pending_qc = all(d.get('approval_status') == 'pending_qc' for d in items)
                if all_pending_qc:
                    self.log("All items are in pending_qc status ✓", "pass")
                    self.test_data['qc_pending_drawings'] = items
                else:
                    self.log("Some items are not in pending_qc status", "fail")
        
        return success
    
    def test_drawing_approval_chain(self):
        """Test the full approval chain: submit -> eng_head -> qc -> sales"""
        self.log("\n=== Testing Drawing Approval Chain ===", "info")
        
        # We need a drawing to test with - use one of the pulled drawings if available
        pulled_drawings = self.test_data.get('pulled_drawings', [])
        if not pulled_drawings:
            self.log("No pulled drawings available for approval chain test", "warn")
            return False
        
        test_drawing_id = pulled_drawings[0].get('id')
        test_drawing_no = pulled_drawings[0].get('drawing_no')
        
        self.log(f"Testing approval chain with drawing: {test_drawing_no}", "info")
        
        # Step 1: Engineer submits for approval
        session_eng = self.sessions.get('engstaff')
        success1, _ = self.run_test(
            "Engineer submits drawing for approval",
            "POST",
            f"drawings/{test_drawing_id}/submit-for-approval",
            200,
            data={"notes": "Ready for review"},
            session=session_eng
        )
        
        if not success1:
            self.log("Failed to submit drawing", "fail")
            return False
        
        # Step 2: Eng Head approves
        session_eng_head = self.sessions.get('riski')
        success2, _ = self.run_test(
            "Eng Head approves drawing",
            "POST",
            f"drawings/{test_drawing_id}/approve/eng_head",
            200,
            data={"notes": "Approved by Eng Head"},
            session=session_eng_head
        )
        
        if not success2:
            self.log("Failed to approve by Eng Head", "fail")
            return False
        
        # Step 3: QC approves
        session_qc = self.sessions.get('qcuser')
        success3, _ = self.run_test(
            "QC approves drawing",
            "POST",
            f"drawings/{test_drawing_id}/approve/qc",
            200,
            data={"notes": "QC approved"},
            session=session_qc
        )
        
        if not success3:
            self.log("Failed to approve by QC", "fail")
            return False
        
        # Verify final status
        success4, response4 = self.run_test(
            "Verify drawing moved to pending_sales",
            "GET",
            f"drawings/{test_drawing_id}",
            200,
            session=session_qc
        )
        
        if success4:
            final_status = response4.get('approval_status')
            if final_status == 'pending_sales':
                self.log(f"Approval chain working correctly - status: {final_status}", "pass")
            else:
                self.log(f"Unexpected final status: {final_status}, expected 'pending_sales'", "fail")
        
        return success1 and success2 and success3
    
    def test_eng_head_pending_approval(self):
        """Test that eng_head can see pending drawings"""
        self.log("\n=== Testing Eng Head Pending Approval ===", "info")
        session = self.sessions.get('riski')
        
        success, response = self.run_test(
            "Get drawings pending Eng Head approval",
            "GET",
            "drawings/pending-my-approval",
            200,
            session=session
        )
        
        if success:
            items = response.get('items', [])
            self.log(f"Found {len(items)} drawings pending Eng Head approval", "pass")
        
        return success
    
    def test_sales_pending_approval(self):
        """Test that sales can see pending drawings"""
        self.log("\n=== Testing Sales Pending Approval ===", "info")
        session = self.sessions.get('salesuser')
        
        success, response = self.run_test(
            "Get drawings pending Sales approval",
            "GET",
            "drawings/pending-my-approval",
            200,
            session=session
        )
        
        if success:
            items = response.get('items', [])
            self.log(f"Found {len(items)} drawings pending Sales approval", "pass")
        
        return success
    
    def run_all_tests(self):
        """Run all tests in sequence"""
        print("\n" + "="*70)
        print("BACKEND API TESTS - Engineering Phase 2 Flow")
        print("="*70)
        
        # Login all users
        print("\n### AUTHENTICATION ###")
        required_users = [
            ('riski', 'Test@123'),
            ('engstaff', 'Test@123'),
            ('salesuser', 'Test@123'),
            ('qcuser', 'Test@123')
        ]
        
        for username, password in required_users:
            if not self.login(username, password):
                print(f"❌ Cannot proceed without {username} login")
                return False
        
        # Run Phase 2A tests: Repeat Order Auto-Pull
        print("\n### PHASE 2A: REPEAT ORDER AUTO-PULL ###")
        self.test_repeat_search_drawings()
        self.test_create_repeat_order_drf()
        self.test_accept_assign_repeat_drf()
        self.test_pull_repeat_drawings()
        self.test_pull_repeat_permission_non_assignee()
        
        # Run Phase 2B tests: QC View-Only + TTD
        print("\n### PHASE 2B: QC VIEW-ONLY + TTD APPROVAL ###")
        self.test_eng_head_pending_approval()
        self.test_qc_pending_approval()
        self.test_sales_pending_approval()
        self.test_drawing_approval_chain()
        
        # Summary
        print("\n" + "="*70)
        print("TEST SUMMARY")
        print("="*70)
        print(f"Total Tests: {self.tests_run}")
        print(f"Passed: {self.tests_passed}")
        print(f"Failed: {self.tests_run - self.tests_passed}")
        print(f"Success Rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        print("="*70)
        
        return self.tests_passed == self.tests_run

def main():
    tester = EngineeringPhase2Tester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())
