#!/usr/bin/env python3
"""
Backend API Testing for Edit & Delete Drawing Feature
Tests PATCH /api/drawings/{drawing_id}/basic-info and DELETE /api/drawings/{drawing_id}
"""
import requests
import sys
from datetime import datetime

class DrawingEditDeleteTester:
    def __init__(self, base_url="https://error-fix-dev.preview.emergentagent.com"):
        self.base_url = base_url
        self.session = requests.Session()  # Use session for cookie-based auth
        self.user_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_result(self, test_name, passed, details=""):
        """Log test result"""
        self.tests_run += 1
        if passed:
            self.tests_passed += 1
            print(f"✅ PASS: {test_name}")
            if details:
                print(f"   {details}")
        else:
            print(f"❌ FAIL: {test_name}")
            if details:
                print(f"   {details}")
        self.test_results.append({
            "test": test_name,
            "passed": passed,
            "details": details
        })

    def login(self, username, password):
        """Login and get session cookie"""
        print(f"\n🔐 Logging in as {username}...")
        try:
            response = self.session.post(
                f"{self.base_url}/api/auth/login",
                json={"username": username, "password": password},
                timeout=10
            )
            if response.status_code == 200:
                data = response.json()
                self.user_id = data.get("id")
                print(f"✅ Login successful - User ID: {self.user_id}, Role: {data.get('role')}")
                return True
            else:
                print(f"❌ Login failed - Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            print(f"❌ Login error: {str(e)}")
            return False

    def get_headers(self):
        """Get headers (cookies are handled by session)"""
        return {
            'Content-Type': 'application/json'
        }

    def create_test_drf(self):
        """Create a test Drawing Request Form"""
        print("\n📝 Creating test DRF...")
        try:
            payload = {
                "form_no": f"DRF-TEST-{datetime.now().strftime('%Y%m%d%H%M%S')}",
                "so_no": f"SO-TEST-{datetime.now().strftime('%H%M%S')}",
                "customer_name": "Test Customer",
                "project_name": "Test Project Edit Delete",
                "qty_order": 5,
                "unit": "PCS",
                "material": "Steel",
                "expected_due_date": "2026-12-31",
                "request_type": "new_order",
                "requested_by_id": self.user_id,
                "requested_by_name": "Test User"
            }
            response = self.session.post(
                f"{self.base_url}/api/drawing-requests",
                json=payload,
                headers=self.get_headers(),
                timeout=10
            )
            if response.status_code in [200, 201]:
                drf = response.json()
                print(f"✅ DRF created: {drf.get('id')} - {drf.get('form_no')}")
                return drf
            else:
                print(f"❌ DRF creation failed - Status: {response.status_code}, Response: {response.text}")
                return None
        except Exception as e:
            print(f"❌ DRF creation error: {str(e)}")
            return None

    def assign_engineer_to_drf(self, drf_id):
        """Assign current user as engineer to DRF"""
        print(f"\n👤 Assigning engineer to DRF {drf_id}...")
        try:
            response = self.session.post(
                f"{self.base_url}/api/drawing-requests/{drf_id}/assign",
                json={"assigned_engineer_id": self.user_id},
                headers=self.get_headers(),
                timeout=10
            )
            if response.status_code == 200:
                print(f"✅ Engineer assigned successfully")
                return True
            else:
                print(f"⚠️  Assignment status: {response.status_code}")
                return True  # Continue even if assignment fails
        except Exception as e:
            print(f"⚠️  Assignment error: {str(e)}")
            return True  # Continue even if assignment fails

    def generate_drawing(self, drf_id, project_initial="TST"):
        """Generate a drawing for the DRF"""
        print(f"\n🎨 Generating drawing for DRF {drf_id} with initial {project_initial}...")
        try:
            payload = {
                "class_material": "RAW MATERIAL FOR QTY 5 PCS",
                "drawings": [
                    {
                        "project_initial": project_initial,
                        "drawing_type": "Assembly",
                        "title": f"Test Drawing {project_initial}",
                        "customer_drawing_no": f"CUST-{project_initial}"
                    }
                ]
            }
            response = self.session.post(
                f"{self.base_url}/api/drawing-requests/{drf_id}/generate-drawings",
                json=payload,
                headers=self.get_headers(),
                timeout=10
            )
            if response.status_code in [200, 201]:
                data = response.json()
                drawings = data.get("drawings", [])
                if drawings:
                    drawing = drawings[0]
                    print(f"✅ Drawing generated: {drawing.get('id')} - {drawing.get('drawing_no')}")
                    return drawing
                else:
                    print(f"❌ No drawings in response")
                    return None
            else:
                print(f"❌ Drawing generation failed - Status: {response.status_code}, Response: {response.text}")
                return None
        except Exception as e:
            print(f"❌ Drawing generation error: {str(e)}")
            return None

    def test_patch_basic_info_draft(self, drawing_id, drawing_no):
        """Test PATCH basic-info for DRAFT drawing (should succeed)"""
        print(f"\n🧪 Test: PATCH basic-info for DRAFT drawing {drawing_no}")
        try:
            payload = {
                "title": "Updated Title via PATCH",
                "drawing_type": "Part",
                "customer_drawing_no": "CUST-002-UPDATED",
                "project_name": "Updated Project Name"
            }
            response = self.session.patch(
                f"{self.base_url}/api/drawings/{drawing_id}/basic-info",
                json=payload,
                headers=self.get_headers(),
                timeout=10
            )
            
            if response.status_code == 200:
                # Verify the update
                get_response = self.session.get(
                    f"{self.base_url}/api/drawings/{drawing_id}",
                    headers=self.get_headers(),
                    timeout=10
                )
                if get_response.status_code == 200:
                    updated = get_response.json()
                    if (updated.get("title") == payload["title"] and
                        updated.get("drawing_type") == payload["drawing_type"] and
                        updated.get("customer_drawing_no") == payload["customer_drawing_no"] and
                        updated.get("project_name") == payload["project_name"]):
                        self.log_result(
                            "PATCH basic-info for DRAFT drawing",
                            True,
                            f"Successfully updated: title={payload['title']}, type={payload['drawing_type']}"
                        )
                        return True
                    else:
                        self.log_result(
                            "PATCH basic-info for DRAFT drawing",
                            False,
                            f"Update succeeded but values not reflected correctly"
                        )
                        return False
                else:
                    self.log_result(
                        "PATCH basic-info for DRAFT drawing",
                        False,
                        f"Could not verify update - GET failed with {get_response.status_code}"
                    )
                    return False
            else:
                self.log_result(
                    "PATCH basic-info for DRAFT drawing",
                    False,
                    f"Expected 200, got {response.status_code}: {response.text}"
                )
                return False
        except Exception as e:
            self.log_result(
                "PATCH basic-info for DRAFT drawing",
                False,
                f"Exception: {str(e)}"
            )
            return False

    def test_patch_basic_info_non_draft(self, drawing_id, drawing_no):
        """Test PATCH basic-info for non-DRAFT drawing (should return 409)"""
        print(f"\n🧪 Test: PATCH basic-info for non-DRAFT drawing {drawing_no}")
        
        # First, submit the drawing to move it out of DRAFT status
        print("   Submitting drawing to move out of DRAFT status...")
        try:
            # Submit to eng_head
            submit_response = self.session.post(
                f"{self.base_url}/api/drawings/{drawing_id}/submit-for-approval",
                json={"notes": "Test submission"},
                headers=self.get_headers(),
                timeout=10
            )
            if submit_response.status_code not in [200, 201]:
                self.log_result(
                    "PATCH basic-info for non-DRAFT drawing",
                    False,
                    f"Could not submit drawing to change status: {submit_response.status_code}"
                )
                return False
            
            # Now try to PATCH (should fail with 409)
            payload = {
                "title": "Should Not Update",
                "drawing_type": "Assembly"
            }
            response = self.session.patch(
                f"{self.base_url}/api/drawings/{drawing_id}/basic-info",
                json=payload,
                headers=self.get_headers(),
                timeout=10
            )
            
            if response.status_code == 409:
                self.log_result(
                    "PATCH basic-info for non-DRAFT drawing",
                    True,
                    f"Correctly rejected with 409: {response.json().get('detail', '')}"
                )
                return True
            else:
                self.log_result(
                    "PATCH basic-info for non-DRAFT drawing",
                    False,
                    f"Expected 409, got {response.status_code}: {response.text}"
                )
                return False
        except Exception as e:
            self.log_result(
                "PATCH basic-info for non-DRAFT drawing",
                False,
                f"Exception: {str(e)}"
            )
            return False

    def test_patch_basic_info_unauthorized(self, drawing_id, drawing_no):
        """Test PATCH basic-info with unauthorized user (should return 403)"""
        print(f"\n🧪 Test: PATCH basic-info with unauthorized user")
        
        # Save current session
        original_session = self.session
        self.session = requests.Session()  # Create new session for sales user
        
        # Login as a different user (sales) who shouldn't have access
        if not self.login("salesuser", "sales123"):
            self.log_result(
                "PATCH basic-info unauthorized",
                False,
                "Could not login as sales user for unauthorized test"
            )
            self.session = original_session
            return False
        
        try:
            payload = {
                "title": "Should Not Update - Unauthorized"
            }
            response = self.session.patch(
                f"{self.base_url}/api/drawings/{drawing_id}/basic-info",
                json=payload,
                headers=self.get_headers(),
                timeout=10
            )
            
            # Restore original session
            self.session = original_session
            
            if response.status_code == 403:
                self.log_result(
                    "PATCH basic-info unauthorized",
                    True,
                    f"Correctly rejected with 403: {response.json().get('detail', '')}"
                )
                return True
            else:
                self.log_result(
                    "PATCH basic-info unauthorized",
                    False,
                    f"Expected 403, got {response.status_code}: {response.text}"
                )
                return False
        except Exception as e:
            self.session = original_session
            self.log_result(
                "PATCH basic-info unauthorized",
                False,
                f"Exception: {str(e)}"
            )
            return False

    def test_delete_draft_drawing(self, drawing_id, drawing_no):
        """Test DELETE for DRAFT drawing (should succeed)"""
        print(f"\n🧪 Test: DELETE DRAFT drawing {drawing_no}")
        try:
            response = self.session.delete(
                f"{self.base_url}/api/drawings/{drawing_id}",
                headers=self.get_headers(),
                timeout=10
            )
            
            if response.status_code == 200:
                # Verify deletion (should return 404 or have deleted_at)
                get_response = self.session.get(
                    f"{self.base_url}/api/drawings/{drawing_id}",
                    headers=self.get_headers(),
                    timeout=10
                )
                if get_response.status_code == 404:
                    self.log_result(
                        "DELETE DRAFT drawing",
                        True,
                        f"Successfully deleted drawing {drawing_no}"
                    )
                    return True
                elif get_response.status_code == 200:
                    data = get_response.json()
                    if data.get("deleted_at"):
                        self.log_result(
                            "DELETE DRAFT drawing",
                            True,
                            f"Successfully soft-deleted drawing {drawing_no}"
                        )
                        return True
                    else:
                        self.log_result(
                            "DELETE DRAFT drawing",
                            False,
                            "Delete succeeded but drawing still accessible without deleted_at"
                        )
                        return False
                else:
                    self.log_result(
                        "DELETE DRAFT drawing",
                        False,
                        f"Unexpected GET status after delete: {get_response.status_code}"
                    )
                    return False
            else:
                self.log_result(
                    "DELETE DRAFT drawing",
                    False,
                    f"Expected 200, got {response.status_code}: {response.text}"
                )
                return False
        except Exception as e:
            self.log_result(
                "DELETE DRAFT drawing",
                False,
                f"Exception: {str(e)}"
            )
            return False

    def test_delete_non_draft_drawing(self, test_prefix):
        """Test DELETE for non-DRAFT drawing (should return 409)"""
        print(f"\n🧪 Test: DELETE non-DRAFT drawing")
        
        # Login as Sales to create a new DRF
        original_session = self.session
        self.session = requests.Session()
        if not self.login("salesuser", "sales123"):
            self.log_result("DELETE non-DRAFT drawing", False, "Could not login as sales")
            self.session = original_session
            return False
        
        drf = self.create_test_drf()
        if not drf:
            self.log_result("DELETE non-DRAFT drawing", False, "Could not create test DRF")
            self.session = original_session
            return False
        
        # Submit the DRF
        try:
            self.session.post(
                f"{self.base_url}/api/drawing-requests/{drf['id']}/submit",
                headers=self.get_headers(),
                timeout=10
            )
        except:
            pass
        
        # Login as Eng Leader to assign
        self.session = requests.Session()
        if not self.login("riski", "eng123"):
            self.log_result("DELETE non-DRAFT drawing", False, "Could not login as eng leader")
            self.session = original_session
            return False
        
        engstaff_id = "8839b8ce-17e9-44d4-b149-e05b13927629"
        try:
            self.session.post(
                f"{self.base_url}/api/drawing-requests/{drf['id']}/accept-assign",
                json={"assigned_engineer_id": engstaff_id},
                headers=self.get_headers(),
                timeout=10
            )
        except:
            pass
        
        # Login as engstaff to generate and submit drawing
        self.session = requests.Session()
        if not self.login("engstaff", "eng123"):
            self.log_result("DELETE non-DRAFT drawing", False, "Could not login as engstaff")
            self.session = original_session
            return False
        
        drawing = self.generate_drawing(drf["id"], f"T{test_prefix}5")  # Unique initial
        if not drawing:
            self.log_result("DELETE non-DRAFT drawing", False, "Could not generate drawing")
            self.session = original_session
            return False
        
        drawing_id = drawing["id"]
        drawing_no = drawing["drawing_no"]
        
        # Submit to move out of DRAFT
        try:
            submit_response = self.session.post(
                f"{self.base_url}/api/drawings/{drawing_id}/submit-for-approval",
                json={"notes": "Test submission for delete"},
                headers=self.get_headers(),
                timeout=10
            )
            if submit_response.status_code not in [200, 201]:
                self.log_result(
                    "DELETE non-DRAFT drawing",
                    False,
                    f"Could not submit drawing: {submit_response.status_code}"
                )
                self.session = original_session
                return False
            
            # Now try to delete (should fail with 409)
            response = self.session.delete(
                f"{self.base_url}/api/drawings/{drawing_id}",
                headers=self.get_headers(),
                timeout=10
            )
            
            # Restore original session
            self.session = original_session
            
            if response.status_code == 409:
                self.log_result(
                    "DELETE non-DRAFT drawing",
                    True,
                    f"Correctly rejected with 409: {response.json().get('detail', '')}"
                )
                return True
            else:
                self.log_result(
                    "DELETE non-DRAFT drawing",
                    False,
                    f"Expected 409, got {response.status_code}: {response.text}"
                )
                return False
        except Exception as e:
            self.session = original_session
            self.log_result(
                "DELETE non-DRAFT drawing",
                False,
                f"Exception: {str(e)}"
            )
            return False

    def run_all_tests(self):
        """Run all backend tests"""
        print("=" * 80)
        print("🧪 BACKEND API TESTING: Edit & Delete Drawing Feature")
        print("=" * 80)
        
        # Generate unique prefix for this test run
        test_prefix = datetime.now().strftime("%H%M%S")[-4:]  # Last 4 digits of timestamp
        
        # Step 1: Login as Sales to create DRF
        print("\n📋 Step 1: Creating DRF as Sales user...")
        if not self.login("salesuser", "sales123"):
            print("\n❌ Cannot proceed without sales login")
            return False
        
        # Create test DRF
        drf = self.create_test_drf()
        if not drf:
            print("\n❌ Cannot proceed without DRF")
            return False
        
        drf_id = drf["id"]
        
        # Submit the DRF
        print(f"\n📤 Submitting DRF {drf_id}...")
        try:
            response = self.session.post(
                f"{self.base_url}/api/drawing-requests/{drf_id}/submit",
                headers=self.get_headers(),
                timeout=10
            )
            if response.status_code == 200:
                print(f"✅ DRF submitted successfully")
            else:
                print(f"⚠️  Submit status: {response.status_code}, continuing anyway...")
        except Exception as e:
            print(f"⚠️  Submit error: {str(e)}, continuing anyway...")
        
        # Step 2: Login as Eng Leader to assign engineer
        print("\n📋 Step 2: Assigning engineer as Eng Leader...")
        if not self.login("riski", "eng123"):
            print("\n❌ Cannot proceed without eng leader login")
            return False
        
        # Get engstaff user ID
        engstaff_id = "8839b8ce-17e9-44d4-b149-e05b13927629"  # From earlier query
        
        # Accept and assign engstaff to the DRF
        try:
            response = self.session.post(
                f"{self.base_url}/api/drawing-requests/{drf_id}/accept-assign",
                json={"assigned_engineer_id": engstaff_id},
                headers=self.get_headers(),
                timeout=10
            )
            if response.status_code == 200:
                print(f"✅ Engineer assigned successfully")
            else:
                print(f"⚠️  Assignment status: {response.status_code}, continuing anyway...")
        except Exception as e:
            print(f"⚠️  Assignment error: {str(e)}, continuing anyway...")
        
        # Step 3: Login as engstaff to work on drawings
        print("\n📋 Step 3: Working on drawings as Engineering Staff...")
        if not self.login("engstaff", "eng123"):
            print("\n❌ Cannot proceed without engstaff login")
            return False
        
        # Generate first drawing for PATCH tests
        drawing1 = self.generate_drawing(drf_id, f"T{test_prefix}1")  # Unique initial
        if not drawing1:
            print("\n❌ Cannot proceed without drawing")
            return False
        
        drawing1_id = drawing1["id"]
        drawing1_no = drawing1["drawing_no"]
        
        # Test 1: PATCH basic-info for DRAFT drawing (should succeed)
        self.test_patch_basic_info_draft(drawing1_id, drawing1_no)
        
        # Test 2: PATCH basic-info for non-DRAFT drawing (should return 409)
        # Generate a new drawing for this test
        drawing2 = self.generate_drawing(drf_id, f"T{test_prefix}2")
        if drawing2:
            self.test_patch_basic_info_non_draft(drawing2["id"], drawing2["drawing_no"])
        
        # Test 3: PATCH basic-info unauthorized (should return 403)
        # Generate a new drawing for this test
        drawing3 = self.generate_drawing(drf_id, f"T{test_prefix}3")
        if drawing3:
            self.test_patch_basic_info_unauthorized(drawing3["id"], drawing3["drawing_no"])
        
        # Test 4: DELETE DRAFT drawing (should succeed)
        # Generate a new drawing for this test
        drawing4 = self.generate_drawing(drf_id, f"T{test_prefix}4")
        if drawing4:
            self.test_delete_draft_drawing(drawing4["id"], drawing4["drawing_no"])
        
        # Test 5: DELETE non-DRAFT drawing (should return 409)
        self.test_delete_non_draft_drawing(test_prefix)
        
        # Print summary
        print("\n" + "=" * 80)
        print(f"📊 TEST SUMMARY")
        print("=" * 80)
        print(f"Total Tests: {self.tests_run}")
        print(f"Passed: {self.tests_passed}")
        print(f"Failed: {self.tests_run - self.tests_passed}")
        print(f"Success Rate: {(self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0:.1f}%")
        print("=" * 80)
        
        return self.tests_passed == self.tests_run

def main():
    tester = DrawingEditDeleteTester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())
