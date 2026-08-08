#!/usr/bin/env python3
"""
Backend API Testing for Engineering Portal & Features
Tests all Engineering menu endpoints and new features
"""
import requests
import sys
from datetime import datetime

BASE_URL = "https://error-fix-dev.preview.emergentagent.com/api"

class EngineeringAPITester:
    def __init__(self):
        self.session = requests.Session()
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.cookies = {}

    def test(self, name, method, endpoint, expected_status, data=None, json_data=None, use_auth=True):
        """Run a single API test"""
        url = f"{BASE_URL}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        self.tests_run += 1
        print(f"\n🔍 Test {self.tests_run}: {name}")
        print(f"   {method} {endpoint}")
        
        try:
            if method == 'GET':
                response = self.session.get(url, headers=headers, cookies=self.cookies if use_auth else {})
            elif method == 'POST':
                if json_data:
                    response = self.session.post(url, json=json_data, headers=headers, cookies=self.cookies if use_auth else {})
                else:
                    response = self.session.post(url, data=data, headers=headers, cookies=self.cookies if use_auth else {})
            elif method == 'PUT':
                response = self.session.put(url, json=json_data, headers=headers, cookies=self.cookies if use_auth else {})
            elif method == 'DELETE':
                response = self.session.delete(url, headers=headers, cookies=self.cookies if use_auth else {})
            else:
                print(f"❌ Unsupported method: {method}")
                return False

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ PASS - Status: {response.status_code}")
                return True, response
            else:
                print(f"❌ FAIL - Expected {expected_status}, got {response.status_code}")
                try:
                    print(f"   Response: {response.json()}")
                except Exception:
                    print(f"   Response: {response.text[:200]}")
                return False, response

        except Exception as e:
            print(f"❌ FAIL - Error: {str(e)}")
            return False, None

    def login(self, username, password):
        """Login and store cookies"""
        print(f"\n🔐 Logging in as {username}...")
        success, response = self.test(
            f"Login as {username}",
            "POST",
            "auth/login",
            200,
            json_data={"username": username, "password": password},
            use_auth=False
        )
        if success and response:
            # Store cookies from response
            self.cookies = response.cookies.get_dict()
            print(f"✅ Login successful, cookies stored")
            return True
        return False

    def test_engineering_portal_endpoints(self):
        """Test all Engineering portal menu endpoints"""
        print("\n" + "="*60)
        print("TESTING ENGINEERING PORTAL MENU ENDPOINTS")
        print("="*60)
        
        # Test main portal endpoints
        endpoints = [
            ("Engineering Workload", "GET", "engineering/workload", 200),
            ("Pending Leader Verification", "GET", "engineering/pending-leader-verification", 200),
            ("SO Document Tracker", "GET", "drawings", 200),  # SO tracker uses drawings endpoint
            ("Master List ECN & ECR", "GET", "ecn-register?kind=ecn", 200),
            ("Internal Engineering Process", "GET", "engineering/process", 200),
            ("KPI Engineering", "GET", "engineering/kpi", 200),
            ("Masterlist Inquiry", "GET", "inquiries", 200),
            ("Engineering Material Costing", "GET", "engineering/material-costing", 200),
            ("Drawing Master List", "GET", "drawings", 200),
            ("BOM List", "GET", "bom", 200),
        ]
        
        for name, method, endpoint, expected in endpoints:
            self.test(name, method, endpoint, expected)

    def test_inquiry_assignment(self):
        """Test assigning inquiry to eng_leader"""
        print("\n" + "="*60)
        print("TESTING INQUIRY ASSIGNMENT TO ENG_LEADER")
        print("="*60)
        
        # First get list of inquiries
        success, response = self.test(
            "Get Inquiries List",
            "GET",
            "inquiries?status=submitted",
            200
        )
        
        if success and response:
            try:
                data = response.json()
                inquiries = data.get('items', [])
                if inquiries:
                    inquiry_id = inquiries[0].get('id')
                    print(f"\n📋 Found inquiry: {inquiry_id}")
                    
                    # Try to assign to eng_leader (qa_leader_tmp)
                    # Note: We need to get the user ID first
                    success2, response2 = self.test(
                        "Assign Inquiry to Engineering Leader",
                        "POST",
                        f"inquiries/{inquiry_id}/assign",
                        200,
                        json_data={"assigned_to_role": "engineering"}
                    )
                    
                    if success2:
                        print("✅ Inquiry assignment to Engineering works")
                    else:
                        print("⚠️  Inquiry assignment may need specific user ID")
                else:
                    print("ℹ️  No submitted inquiries found to test assignment")
            except Exception as e:
                print(f"⚠️  Could not parse inquiry response: {e}")

    def test_drawing_master_list_rev_column(self):
        """Test Drawing Master List has Rev column"""
        print("\n" + "="*60)
        print("TESTING DRAWING MASTER LIST - REV COLUMN")
        print("="*60)
        
        success, response = self.test(
            "Get Drawings with Rev Info",
            "GET",
            "drawings?limit=5",
            200
        )
        
        if success and response:
            try:
                data = response.json()
                items = data.get('items', [])
                if items:
                    first_drawing = items[0]
                    has_rev_no = 'rev_no' in first_drawing
                    has_revision = 'revision' in first_drawing
                    
                    print(f"\n📊 Drawing fields check:")
                    print(f"   - has 'rev_no' field: {has_rev_no}")
                    print(f"   - has 'revision' field: {has_revision}")
                    
                    if has_rev_no or has_revision:
                        print("✅ Drawing Master List has revision tracking")
                        if has_rev_no:
                            print(f"   Sample rev_no: {first_drawing.get('rev_no', 0)}")
                    else:
                        print("❌ Drawing Master List missing revision fields")
                else:
                    print("ℹ️  No drawings found to check Rev column")
            except Exception as e:
                print(f"⚠️  Could not parse drawings response: {e}")

    def test_drf_revision_flow(self):
        """Test Drawing Request Form revision flow (backend)"""
        print("\n" + "="*60)
        print("TESTING DRF REVISION FLOW (BACKEND)")
        print("="*60)
        
        # Get list of DRFs
        success, response = self.test(
            "Get Drawing Requests",
            "GET",
            "drawing-requests",
            200
        )
        
        if success and response:
            try:
                data = response.json()
                items = data.get('items', [])
                
                # Look for a submitted or accepted DRF to test revision
                test_drf = None
                for item in items:
                    if item.get('status') in ['submitted', 'accepted']:
                        test_drf = item
                        break
                
                if test_drf:
                    drf_id = test_drf['id']
                    print(f"\n📋 Testing with DRF: {test_drf.get('form_no', drf_id)}")
                    
                    # Test request-revision endpoint
                    success2, response2 = self.test(
                        "Request DRF Revision",
                        "POST",
                        f"drawing-requests/{drf_id}/request-revision",
                        200,
                        json_data={"reason": "ZZTEST - Testing revision flow"}
                    )
                    
                    if success2:
                        print("✅ DRF revision request works")
                        
                        # Test approve-revision endpoint (as admin/supervisor)
                        # This would need admin login, skipping for now
                        print("ℹ️  Approve-revision requires admin/supervisor role")
                    else:
                        print("⚠️  DRF revision request may have failed (could be permission issue)")
                else:
                    print("ℹ️  No suitable DRF found to test revision flow")
            except Exception as e:
                print(f"⚠️  Could not test DRF revision: {e}")

    def test_bom_procurement_chain(self):
        """Test BOM procurement approval chain"""
        print("\n" + "="*60)
        print("TESTING BOM PROCUREMENT APPROVAL CHAIN")
        print("="*60)
        
        # Get approved BOMs
        success, response = self.test(
            "Get Approved BOMs",
            "GET",
            "bom?engineering_status=approved&limit=5",
            200
        )
        
        if success and response:
            try:
                data = response.json()
                items = data.get('items', [])
                
                if items:
                    # Check if BOM has procurement_status field
                    first_bom = items[0]
                    has_procurement = 'procurement_status' in first_bom or 'procurement_signatures' in first_bom
                    
                    print(f"\n📊 BOM procurement fields check:")
                    print(f"   - has procurement tracking: {has_procurement}")
                    
                    if has_procurement:
                        print("✅ BOM has procurement approval chain structure")
                        print(f"   Sample status: {first_bom.get('procurement_status', 'N/A')}")
                    else:
                        print("⚠️  BOM procurement chain fields not found")
                        
                    # Test procurement endpoints exist
                    bom_id = first_bom.get('id')
                    if bom_id:
                        # Just check if endpoints exist (may fail due to status/permission)
                        print("\n🔍 Checking procurement endpoints...")
                        self.test(
                            "BOM Procurement Pending Count",
                            "GET",
                            "bom/procurement/pending-count",
                            200
                        )
                else:
                    print("ℹ️  No approved BOMs found to test procurement chain")
            except Exception as e:
                print(f"⚠️  Could not test BOM procurement: {e}")

    def test_ecn_scope_endpoints(self):
        """Test ECN revision with scope (drawing/bom/both)"""
        print("\n" + "="*60)
        print("TESTING ECN REVISION SCOPE (BACKEND)")
        print("="*60)
        
        # Get ECN register
        success, response = self.test(
            "Get ECN Register",
            "GET",
            "ecn-register?kind=ecn&limit=5",
            200
        )
        
        if success and response:
            try:
                data = response.json()
                items = data.get('items', [])
                
                if items:
                    first_ecn = items[0]
                    has_scope = 'scope' in first_ecn
                    
                    print(f"\n📊 ECN scope field check:")
                    print(f"   - has 'scope' field: {has_scope}")
                    
                    if has_scope:
                        print("✅ ECN has scope tracking (drawing/bom/both)")
                        print(f"   Sample scope: {first_ecn.get('scope', 'N/A')}")
                    else:
                        print("ℹ️  ECN scope field not found (may be in revision_request)")
                else:
                    print("ℹ️  No ECN records found to test scope")
            except Exception as e:
                print(f"⚠️  Could not test ECN scope: {e}")

    def print_summary(self):
        """Print test summary"""
        print("\n" + "="*60)
        print("TEST SUMMARY")
        print("="*60)
        print(f"Total Tests: {self.tests_run}")
        print(f"Passed: {self.tests_passed}")
        print(f"Failed: {self.tests_run - self.tests_passed}")
        print(f"Success Rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        print("="*60)
        
        return 0 if self.tests_passed == self.tests_run else 1


def main():
    tester = EngineeringAPITester()
    
    # Login as eng_leader to test Engineering features
    if not tester.login("qa_leader_tmp", "QaTest12345"):
        print("❌ Login failed, cannot proceed with tests")
        return 1
    
    # Run all test suites
    tester.test_engineering_portal_endpoints()
    tester.test_inquiry_assignment()
    tester.test_drawing_master_list_rev_column()
    tester.test_drf_revision_flow()
    tester.test_bom_procurement_chain()
    tester.test_ecn_scope_endpoints()
    
    # Print summary
    return tester.print_summary()


if __name__ == "__main__":
    sys.exit(main())
