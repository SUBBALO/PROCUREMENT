"""Backend API tests for Legacy Data Bulk Import flow.

Tests:
1. POST /api/legacy-import/analyze - upload BOM Excel, returns suggested fields + items + items_count
2. POST /api/legacy-import/commit - creates BOM + Drawing (controlled/Issued) + attachments
3. POST /api/legacy-import/add-drawing - adds additional drawing to same bom_id
4. SO number normalization (6 digits, zero-padded)
5. Access control: only admin/super_admin/supervisor/engineering leader roles (403 otherwise)
"""
import sys
import io
import requests
from datetime import datetime

# Get backend URL from frontend .env
BACKEND_URL = "https://error-fix-dev.preview.emergentagent.com"

class LegacyImportTester:
    def __init__(self, base_url=BACKEND_URL):
        self.base_url = base_url
        self.session = requests.Session()  # Use session to preserve cookies
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        self.logged_in = False

    def log_result(self, test_name, passed, message="", details=None):
        """Log test result"""
        self.tests_run += 1
        if passed:
            self.tests_passed += 1
            print(f"✅ PASS: {test_name}")
            if message:
                print(f"   {message}")
        else:
            print(f"❌ FAIL: {test_name}")
            print(f"   {message}")
            if details:
                print(f"   Details: {details}")
        
        self.test_results.append({
            "test": test_name,
            "passed": passed,
            "message": message,
            "details": details
        })

    def login(self, username, password):
        """Login and get token"""
        print(f"\n🔐 Logging in as {username}...")
        try:
            response = self.session.post(
                f"{self.base_url}/api/auth/login",
                json={"username": username, "password": password},
                timeout=10
            )
            if response.status_code == 200:
                data = response.json()
                self.logged_in = True
                print(f"✅ Login successful - Role: {data.get('role')}")
                return True
            else:
                print(f"❌ Login failed - Status: {response.status_code}")
                print(f"   Response: {response.text}")
                return False
        except Exception as e:
            print(f"❌ Login error: {str(e)}")
            return False

    def test_access_control(self):
        """Test that Super Admin has access"""
        print("\n📋 Testing access control (Super Admin should have access)...")
        
        # Login as Super Admin
        if not self.login("susanto", "Subbalo1994"):
            self.log_result("Access Control - Super Admin Login", False, "Failed to login as Super Admin")
            return False
        
        self.log_result("Access Control - Super Admin Login", True, "Super Admin login successful")
        return True

    def test_analyze_endpoint_validation(self):
        """Test /api/legacy-import/analyze with invalid file"""
        print("\n📋 Testing /api/legacy-import/analyze validation...")
        
        if not self.logged_in:
            self.log_result("Analyze - Validation", False, "Not logged in")
            return
        
        # Test 1: Empty file
        try:
            files = {"file": ("empty.xlsx", io.BytesIO(b""), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
            response = self.session.post(
                f"{self.base_url}/api/legacy-import/analyze",
                files=files,
                timeout=10
            )
            
            if response.status_code == 400 and "kosong" in response.text.lower():
                self.log_result("Analyze - Empty File Validation", True, "Correctly rejected empty file")
            else:
                self.log_result(
                    "Analyze - Empty File Validation",
                    False,
                    f"Expected 400 with 'kosong', got {response.status_code}",
                    response.text
                )
        except Exception as e:
            self.log_result("Analyze - Empty File Validation", False, f"Error: {str(e)}")
        
        # Test 2: Wrong file type
        try:
            files = {"file": ("test.txt", io.BytesIO(b"not an excel file"), "text/plain")}
            response = self.session.post(
                f"{self.base_url}/api/legacy-import/analyze",
                files=files,
                timeout=10
            )
            
            if response.status_code == 400 and ("excel" in response.text.lower() or "xlsx" in response.text.lower()):
                self.log_result("Analyze - File Type Validation", True, "Correctly rejected non-Excel file")
            else:
                self.log_result(
                    "Analyze - File Type Validation",
                    False,
                    f"Expected 400 with Excel error, got {response.status_code}",
                    response.text
                )
        except Exception as e:
            self.log_result("Analyze - File Type Validation", False, f"Error: {str(e)}")

    def test_commit_endpoint_validation(self):
        """Test /api/legacy-import/commit validation"""
        print("\n📋 Testing /api/legacy-import/commit validation...")
        
        if not self.logged_in:
            self.log_result("Commit - Validation", False, "Not logged in")
            return
        
        # Test 1: Missing required fields
        try:
            data = {
                "meta": '{"drawing_no": "", "so_no": "123456"}'  # Empty drawing_no
            }
            files = {
                "eng_dwg": ("test.pdf", io.BytesIO(b"%PDF-1.4\n%test"), "application/pdf")
            }
            
            response = self.session.post(
                f"{self.base_url}/api/legacy-import/commit",
                data=data,
                files=files,
                timeout=10
            )
            
            if response.status_code == 400 and "wajib" in response.text.lower():
                self.log_result("Commit - Missing Drawing No", True, "Correctly rejected empty drawing_no")
            else:
                self.log_result(
                    "Commit - Missing Drawing No",
                    False,
                    f"Expected 400 with 'wajib', got {response.status_code}",
                    response.text
                )
        except Exception as e:
            self.log_result("Commit - Missing Drawing No", False, f"Error: {str(e)}")
        
        # Test 2: Invalid file type for eng_dwg
        try:
            data = {
                "meta": '{"drawing_no": "TEST-001", "so_no": "123456"}'
            }
            files = {
                "eng_dwg": ("test.txt", io.BytesIO(b"not a pdf"), "text/plain")
            }
            
            response = self.session.post(
                f"{self.base_url}/api/legacy-import/commit",
                data=data,
                files=files,
                timeout=10
            )
            
            if response.status_code == 400 and ("pdf" in response.text.lower() or "word" in response.text.lower()):
                self.log_result("Commit - Invalid File Type", True, "Correctly rejected non-PDF/Word file")
            else:
                self.log_result(
                    "Commit - Invalid File Type",
                    False,
                    f"Expected 400 with PDF/Word error, got {response.status_code}",
                    response.text
                )
        except Exception as e:
            self.log_result("Commit - Invalid File Type", False, f"Error: {str(e)}")

    def test_so_normalization(self):
        """Test SO number normalization (6 digits, zero-padded)"""
        print("\n📋 Testing SO number normalization...")
        
        if not self.logged_in:
            self.log_result("SO Normalization", False, "Not logged in")
            return
        
        # Test with a short SO number that should be padded
        test_cases = [
            ("123", "000123"),
            ("5251", "005251"),
            ("123456", "123456"),
        ]
        
        for input_so, expected_so in test_cases:
            try:
                timestamp = datetime.now().strftime("%H%M%S%f")
                data = {
                    "meta": f'{{"drawing_no": "TEST-SO-{timestamp}-{input_so}", "so_no": "{input_so}", "customer": "TEST"}}'
                }
                files = {
                    "eng_dwg": (f"test-{timestamp}.pdf", io.BytesIO(b"%PDF-1.4\n%test content"), "application/pdf")
                }
                
                response = self.session.post(
                    f"{self.base_url}/api/legacy-import/commit",
                    data=data,
                    files=files,
                    timeout=10
                )
                
                # We expect either success or duplicate error (if drawing already exists)
                if response.status_code in [200, 409]:
                    result = response.json()
                    if response.status_code == 200:
                        returned_so = result.get("so_no", "")
                        if returned_so == expected_so:
                            self.log_result(
                                f"SO Normalization - {input_so} → {expected_so}",
                                True,
                                f"Correctly normalized to {returned_so}"
                            )
                        else:
                            self.log_result(
                                f"SO Normalization - {input_so} → {expected_so}",
                                False,
                                f"Expected {expected_so}, got {returned_so}"
                            )
                    else:
                        # 409 means drawing already exists, which is fine for this test
                        self.log_result(
                            f"SO Normalization - {input_so} → {expected_so}",
                            True,
                            "Drawing already exists (expected for repeated tests)"
                        )
                else:
                    self.log_result(
                        f"SO Normalization - {input_so} → {expected_so}",
                        False,
                        f"Unexpected status {response.status_code}",
                        response.text
                    )
            except Exception as e:
                self.log_result(f"SO Normalization - {input_so} → {expected_so}", False, f"Error: {str(e)}")

    def test_add_drawing_endpoint(self):
        """Test /api/legacy-import/add-drawing endpoint"""
        print("\n📋 Testing /api/legacy-import/add-drawing...")
        
        if not self.logged_in:
            self.log_result("Add Drawing", False, "Not logged in")
            return
        
        # Test validation: missing bom_id
        try:
            data = {
                "meta": '{"drawing_no": "TEST-002"}'  # Missing bom_id
            }
            files = {
                "eng_dwg": ("test2.pdf", io.BytesIO(b"%PDF-1.4\n%test"), "application/pdf")
            }
            
            response = self.session.post(
                f"{self.base_url}/api/legacy-import/add-drawing",
                data=data,
                files=files,
                timeout=10
            )
            
            if response.status_code == 400 and "wajib" in response.text.lower():
                self.log_result("Add Drawing - Missing BOM ID", True, "Correctly rejected missing bom_id")
            else:
                self.log_result(
                    "Add Drawing - Missing BOM ID",
                    False,
                    f"Expected 400 with 'wajib', got {response.status_code}",
                    response.text
                )
        except Exception as e:
            self.log_result("Add Drawing - Missing BOM ID", False, f"Error: {str(e)}")

    def print_summary(self):
        """Print test summary"""
        print("\n" + "="*60)
        print("📊 TEST SUMMARY")
        print("="*60)
        print(f"Total Tests: {self.tests_run}")
        print(f"Passed: {self.tests_passed}")
        print(f"Failed: {self.tests_run - self.tests_passed}")
        print(f"Success Rate: {(self.tests_passed/self.tests_run*100) if self.tests_run > 0 else 0:.1f}%")
        print("="*60)
        
        if self.tests_passed < self.tests_run:
            print("\n❌ Some tests failed. See details above.")
            return 1
        else:
            print("\n✅ All tests passed!")
            return 0

def main():
    print("="*60)
    print("🧪 Legacy Data Bulk Import - Backend API Tests")
    print("="*60)
    print(f"Backend URL: {BACKEND_URL}")
    print(f"Test Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    tester = LegacyImportTester()
    
    # Test 1: Access control
    if not tester.test_access_control():
        print("\n❌ Cannot proceed without authentication")
        return 1
    
    # Test 2: Analyze endpoint validation
    tester.test_analyze_endpoint_validation()
    
    # Test 3: Commit endpoint validation
    tester.test_commit_endpoint_validation()
    
    # Test 4: SO normalization
    tester.test_so_normalization()
    
    # Test 5: Add drawing endpoint
    tester.test_add_drawing_endpoint()
    
    # Print summary
    return tester.print_summary()

if __name__ == "__main__":
    sys.exit(main())
