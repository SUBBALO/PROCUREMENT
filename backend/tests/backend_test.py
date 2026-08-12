"""
Backend API Tests for Engineering Phase 1 Flow
Tests: DRF accept-assign, generate-drawings, ECR/ECN module
"""
import requests
import sys
from datetime import datetime

BASE_URL = "https://error-fix-dev.preview.emergentagent.com/api"

class EngineeringPhase1Tester:
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
                response = session.get(url, headers=headers, params=params, timeout=10)
            elif method == 'POST':
                response = session.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PUT':
                response = session.put(url, json=data, headers=headers, timeout=10)
            
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
                    self.log(f"Response: {response.json()}", "fail")
                except Exception:
                    self.log(f"Response text: {response.text[:200]}", "fail")
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
            self.log(f"Login successful for {username}", "pass")
            return True
        self.log(f"Login failed for {username}", "fail")
        return False
    
    def test_engineering_users_list(self):
        """Test GET /api/drawing-requests/engineering-users"""
        self.log("\n=== Testing Engineering Users List ===", "info")
        session = self.sessions.get('riski')
        success, response = self.run_test(
            "Get engineering users list",
            "GET",
            "drawing-requests/engineering-users",
            200,
            session=session
        )
        if success:
            items = response.get('items', [])
            self.log(f"Found {len(items)} engineering users", "pass")
            # Store for later use
            self.test_data['engineering_users'] = items
            # Verify engstaff is in the list
            engstaff = next((u for u in items if u.get('username') == 'engstaff'), None)
            if engstaff:
                self.log(f"Found engstaff user: {engstaff.get('name')}", "pass")
                self.test_data['engstaff_id'] = engstaff.get('id')
            else:
                self.log("engstaff user not found in list", "warn")
        return success
    
    def test_accept_assign_drf(self):
        """Test POST /api/drawing-requests/{drf_id}/accept-assign"""
        self.log("\n=== Testing Accept & Assign DRF ===", "info")
        session = self.sessions.get('riski')
        
        # First, get list of DRFs to find one to accept
        success, response = self.run_test(
            "Get DRF list for engineering",
            "GET",
            "drawing-requests",
            200,
            session=session,
            params={"scope": "for_engineering"}
        )
        
        if not success:
            self.log("Cannot get DRF list", "fail")
            return False
        
        items = response.get('items', [])
        # Find a submitted DRF (MKS-F-ENG-001/003/VII/2026 mentioned in requirements)
        target_drf = next((d for d in items if d.get('form_no') == 'MKS-F-ENG-001/003/VII/2026'), None)
        if not target_drf:
            # Try to find any submitted DRF
            target_drf = next((d for d in items if d.get('status') == 'submitted'), None)
        
        if not target_drf:
            self.log("No submitted DRF found to test accept-assign", "warn")
            return False
        
        drf_id = target_drf.get('id')
        self.log(f"Testing with DRF: {target_drf.get('form_no')}", "info")
        self.test_data['test_drf_id'] = drf_id
        
        # Get engstaff ID
        engstaff_id = self.test_data.get('engstaff_id')
        if not engstaff_id:
            self.log("engstaff_id not available", "fail")
            return False
        
        # Accept and assign to engstaff
        success, response = self.run_test(
            "Accept & Assign DRF to engstaff",
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
            self.log(f"DRF accepted and assigned. Status: {response.get('status')}", "pass")
            self.log(f"Assigned to: {response.get('assigned_engineer_name')}", "pass")
            # Verify status is 'accepted'
            if response.get('status') == 'accepted':
                self.log("Status correctly set to 'accepted'", "pass")
            else:
                self.log(f"Status is {response.get('status')}, expected 'accepted'", "warn")
            
            # Verify assigned_engineer_id is set
            if response.get('assigned_engineer_id') == engstaff_id:
                self.log("Engineer ID correctly assigned", "pass")
            else:
                self.log("Engineer ID not correctly assigned", "fail")
        
        return success
    
    def test_generate_drawings(self):
        """Test POST /api/drawing-requests/{drf_id}/generate-drawings"""
        self.log("\n=== Testing Generate Drawings ===", "info")
        session = self.sessions.get('engstaff')
        
        drf_id = self.test_data.get('test_drf_id')
        if not drf_id:
            self.log("No DRF ID available for testing", "warn")
            return False
        
        # Generate 2 drawings with shared BOM
        success, response = self.run_test(
            "Generate 2 drawings for DRF",
            "POST",
            f"drawing-requests/{drf_id}/generate-drawings",
            200,
            data={
                "class_material": "RAW MATERIAL FOR QTY 2 PCS",
                "drawings": [
                    {
                        "project_initial": "FL",
                        "drawing_type": "Assembly",
                        "title": "Test Assembly",
                        "customer_drawing_no": "CUST-001"
                    },
                    {
                        "project_initial": "FL",
                        "drawing_type": "Part",
                        "title": "Test Part",
                        "customer_drawing_no": "CUST-002"
                    }
                ]
            },
            session=session
        )
        
        if success:
            drawings = response.get('drawings', [])
            shared_bom_id = response.get('shared_bom_id')
            self.log(f"Generated {len(drawings)} drawings", "pass")
            self.log(f"Shared BOM ID: {shared_bom_id}", "pass")
            
            # Verify all drawings share the same BOM
            if len(drawings) == 2:
                bom_id_1 = drawings[0].get('bom_id')
                bom_id_2 = drawings[1].get('bom_id')
                if bom_id_1 == bom_id_2 == shared_bom_id:
                    self.log("All drawings share the same BOM ✓", "pass")
                else:
                    self.log(f"BOM IDs don't match: {bom_id_1}, {bom_id_2}, {shared_bom_id}", "fail")
                
                # Store drawing IDs for later tests
                self.test_data['test_drawing_ids'] = [d.get('id') for d in drawings]
                self.test_data['test_drawing_nos'] = [d.get('drawing_no') for d in drawings]
                
                # Verify customer_drawing_no is stored
                if drawings[0].get('customer_drawing_no') == 'CUST-001':
                    self.log("Customer drawing number stored correctly", "pass")
                else:
                    self.log("Customer drawing number not stored", "fail")
        
        return success
    
    def test_get_drawings_by_drf(self):
        """Test GET /api/drawings?from_drf_id={id}"""
        self.log("\n=== Testing Get Drawings by DRF ID ===", "info")
        session = self.sessions.get('engstaff')
        
        drf_id = self.test_data.get('test_drf_id')
        if not drf_id:
            self.log("No DRF ID available", "warn")
            return False
        
        success, response = self.run_test(
            "Get drawings filtered by DRF ID",
            "GET",
            "drawings",
            200,
            session=session,
            params={"from_drf_id": drf_id}
        )
        
        if success:
            items = response.get('items', [])
            self.log(f"Found {len(items)} drawings for this DRF", "pass")
            
            # Verify these are the drawings we created
            expected_count = len(self.test_data.get('test_drawing_ids', []))
            if len(items) >= expected_count:
                self.log(f"Drawing count matches (expected >= {expected_count})", "pass")
            else:
                self.log(f"Drawing count mismatch: got {len(items)}, expected >= {expected_count}", "fail")
        
        return success
    
    def test_search_drawings_by_customer_dwg_no(self):
        """Test GET /api/drawings?q=<customer_drawing_no>"""
        self.log("\n=== Testing Search Drawings by Customer DWG No ===", "info")
        session = self.sessions.get('engstaff')
        
        success, response = self.run_test(
            "Search drawings by customer drawing number",
            "GET",
            "drawings",
            200,
            session=session,
            params={"q": "CUST-001"}
        )
        
        if success:
            items = response.get('items', [])
            self.log(f"Found {len(items)} drawings matching 'CUST-001'", "pass")
            
            # Verify at least one result contains our customer drawing number
            if any(d.get('customer_drawing_no') == 'CUST-001' for d in items):
                self.log("Search correctly found drawing with customer_drawing_no", "pass")
            else:
                self.log("Search did not find expected customer_drawing_no", "fail")
        
        return success
    
    def test_next_drawing_number(self):
        """Test GET /api/drawings/next-number"""
        self.log("\n=== Testing Next Drawing Number Preview ===", "info")
        session = self.sessions.get('engstaff')
        
        success, response = self.run_test(
            "Get next drawing number preview",
            "GET",
            "drawings/next-number",
            200,
            session=session,
            params={
                "customer_code": "THIES",
                "project_initial": "BR",
                "drawing_type": "Assembly"
            }
        )
        
        if success:
            preview = response.get('preview')
            self.log(f"Next number preview: {preview}", "pass")
            
            # Verify format: DWG.YY.MM.NN_CUSTOMER.INITIAL.TYPE.SEQ
            if preview and 'THIES' in preview and 'BR' in preview:
                self.log("Preview format looks correct", "pass")
            else:
                self.log(f"Preview format unexpected: {preview}", "warn")
        
        return success
    
    def test_ecn_create_ecr(self):
        """Test POST /api/ecn with kind='ecr'"""
        self.log("\n=== Testing Create ECR ===", "info")
        session = self.sessions.get('engstaff')
        
        success, response = self.run_test(
            "Create ECR (customer change request)",
            "POST",
            "ecn",
            200,
            data={
                "kind": "ecr",
                "change_type": "drawing",
                "drawing_no": "DWG.26.01.01_TEST.BR.A.00",
                "so_no": "SO-TEST-001",
                "customer_name": "Test Customer",
                "reason": "Customer requested dimension change",
                "description": "Change hole diameter from 10mm to 12mm",
                "priority": "high",
                "submit": False
            },
            session=session
        )
        
        if success:
            ecn_no = response.get('ecn_no')
            ecn_id = response.get('id')
            kind = response.get('kind')
            
            self.log(f"ECR created: {ecn_no}", "pass")
            self.test_data['test_ecr_id'] = ecn_id
            self.test_data['test_ecr_no'] = ecn_no
            
            # Verify ECR number starts with 'ECR-'
            if ecn_no and ecn_no.startswith('ECR-'):
                self.log("ECR number format correct (starts with 'ECR-')", "pass")
            else:
                self.log(f"ECR number format incorrect: {ecn_no}", "fail")
            
            # Verify kind is 'ecr'
            if kind == 'ecr':
                self.log("Kind correctly set to 'ecr'", "pass")
            else:
                self.log(f"Kind incorrect: {kind}", "fail")
        
        return success
    
    def test_ecn_create_ecn(self):
        """Test POST /api/ecn with kind='ecn'"""
        self.log("\n=== Testing Create ECN ===", "info")
        session = self.sessions.get('engstaff')
        
        success, response = self.run_test(
            "Create ECN (internal change)",
            "POST",
            "ecn",
            200,
            data={
                "kind": "ecn",
                "change_type": "bom",
                "bom_no": "BOM001-01-2026",
                "so_no": "SO-TEST-002",
                "reason": "Material optimization",
                "description": "Change material from SS304 to SS316",
                "priority": "normal",
                "submit": False
            },
            session=session
        )
        
        if success:
            ecn_no = response.get('ecn_no')
            ecn_id = response.get('id')
            kind = response.get('kind')
            
            self.log(f"ECN created: {ecn_no}", "pass")
            self.test_data['test_ecn_id'] = ecn_id
            self.test_data['test_ecn_no'] = ecn_no
            
            # Verify ECN number starts with 'ECN-'
            if ecn_no and ecn_no.startswith('ECN-'):
                self.log("ECN number format correct (starts with 'ECN-')", "pass")
            else:
                self.log(f"ECN number format incorrect: {ecn_no}", "fail")
            
            # Verify kind is 'ecn'
            if kind == 'ecn':
                self.log("Kind correctly set to 'ecn'", "pass")
            else:
                self.log(f"Kind incorrect: {kind}", "fail")
        
        return success
    
    def test_ecn_filter_by_kind(self):
        """Test GET /api/ecn?kind=ecr"""
        self.log("\n=== Testing Filter ECN by Kind ===", "info")
        session = self.sessions.get('engstaff')
        
        success, response = self.run_test(
            "Get ECN list filtered by kind=ecr",
            "GET",
            "ecn",
            200,
            session=session,
            params={"kind": "ecr"}
        )
        
        if success:
            items = response.get('items', [])
            self.log(f"Found {len(items)} ECR items", "pass")
            
            # Verify all items are ECR
            all_ecr = all(item.get('kind') == 'ecr' for item in items)
            if all_ecr:
                self.log("All items are ECR (filter working)", "pass")
            else:
                self.log("Filter not working correctly - found non-ECR items", "fail")
        
        return success
    
    def test_ecn_submit(self):
        """Test POST /api/ecn/{id}/submit"""
        self.log("\n=== Testing Submit ECN ===", "info")
        session = self.sessions.get('engstaff')
        
        ecn_id = self.test_data.get('test_ecn_id')
        if not ecn_id:
            self.log("No ECN ID available", "warn")
            return False
        
        success, response = self.run_test(
            "Submit ECN (draft -> submitted)",
            "POST",
            f"ecn/{ecn_id}/submit",
            200,
            session=session
        )
        
        if success:
            self.log("ECN submitted successfully", "pass")
            
            # Verify by getting the ECN again
            success2, response2 = self.run_test(
                "Verify ECN status changed to submitted",
                "GET",
                f"ecn/{ecn_id}",
                200,
                session=session
            )
            
            if success2 and response2.get('status') == 'submitted':
                self.log("ECN status correctly changed to 'submitted'", "pass")
            else:
                self.log(f"ECN status not updated correctly: {response2.get('status')}", "fail")
        
        return success
    
    def test_ecn_review(self):
        """Test POST /api/ecn/{id}/review"""
        self.log("\n=== Testing Review ECN ===", "info")
        session = self.sessions.get('riski')  # Eng leader
        
        ecn_id = self.test_data.get('test_ecn_id')
        if not ecn_id:
            self.log("No ECN ID available", "warn")
            return False
        
        success, response = self.run_test(
            "Review and approve ECN",
            "POST",
            f"ecn/{ecn_id}/review",
            200,
            data={
                "action": "approve",
                "notes": "Approved - change is reasonable"
            },
            session=session
        )
        
        if success:
            self.log("ECN reviewed successfully", "pass")
            
            # Verify status changed to approved
            success2, response2 = self.run_test(
                "Verify ECN status changed to approved",
                "GET",
                f"ecn/{ecn_id}",
                200,
                session=session
            )
            
            if success2 and response2.get('status') == 'approved':
                self.log("ECN status correctly changed to 'approved'", "pass")
            else:
                self.log(f"ECN status not updated correctly: {response2.get('status')}", "fail")
        
        return success
    
    def test_permission_non_assignee(self):
        """Test that non-assignee (sales) cannot generate drawings"""
        self.log("\n=== Testing Permission: Non-Assignee Access ===", "info")
        session = self.sessions.get('salesuser')
        
        drf_id = self.test_data.get('test_drf_id')
        if not drf_id:
            self.log("No DRF ID available", "warn")
            return False
        
        # Sales user should get 403 when trying to generate drawings
        success, response = self.run_test(
            "Sales user tries to generate drawings (should fail with 403)",
            "POST",
            f"drawing-requests/{drf_id}/generate-drawings",
            403,  # Expecting 403 Forbidden
            data={
                "class_material": "TEST",
                "drawings": [{"project_initial": "XX", "drawing_type": "Assembly"}]
            },
            session=session
        )
        
        if success:
            self.log("Permission check working - sales user correctly denied", "pass")
        else:
            self.log("Permission check failed - sales user should not be able to generate drawings", "fail")
        
        return success
    
    def run_all_tests(self):
        """Run all tests in sequence"""
        print("\n" + "="*70)
        print("BACKEND API TESTS - Engineering Phase 1 Flow")
        print("="*70)
        
        # Login all users
        print("\n### AUTHENTICATION ###")
        if not self.login('riski', 'test123456'):
            print("❌ Cannot proceed without riski login")
            return False
        if not self.login('engstaff', 'test123456'):
            print("❌ Cannot proceed without engstaff login")
            return False
        if not self.login('salesuser', 'test123456'):
            print("⚠️ Sales user login failed, some tests will be skipped")
        
        # Run tests
        print("\n### DRAWING REQUEST FLOW ###")
        self.test_engineering_users_list()
        self.test_accept_assign_drf()
        self.test_generate_drawings()
        self.test_get_drawings_by_drf()
        self.test_search_drawings_by_customer_dwg_no()
        self.test_next_drawing_number()
        
        print("\n### ECR/ECN MODULE ###")
        self.test_ecn_create_ecr()
        self.test_ecn_create_ecn()
        self.test_ecn_filter_by_kind()
        self.test_ecn_submit()
        self.test_ecn_review()
        
        print("\n### PERMISSION TESTS ###")
        if 'salesuser' in self.sessions:
            self.test_permission_non_assignee()
        
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
    tester = EngineeringPhase1Tester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())
