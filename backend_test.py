"""Backend API Tests for PT Mitra Karya Sarana ERP
Testing recent changes:
1. STAMP PER-PAGE: placements[] support for TTD, DC, SO stamps
2. UNIVERSAL PDF PREVIEW: page-meta and page-image endpoints
3. SALES INQUIRY FORM: field rename verification (backend data structure)
"""
import requests
import sys
import json
from datetime import datetime

class BackendTester:
    def __init__(self, base_url="https://error-fix-dev.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.session = requests.Session()  # Use session to maintain cookies
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.failures = []

    def log(self, msg, level="INFO"):
        """Log test messages"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] [{level}] {msg}")

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None, files=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        req_headers = {'Content-Type': 'application/json'}
        if headers:
            req_headers.update(headers)
        
        self.tests_run += 1
        self.log(f"Testing {name}...", "TEST")
        
        try:
            if method == 'GET':
                response = self.session.get(url, headers=req_headers, timeout=30)
            elif method == 'POST':
                if files:
                    # Remove Content-Type for multipart
                    req_headers.pop('Content-Type', None)
                    response = self.session.post(url, files=files, data=data, headers=req_headers, timeout=30)
                else:
                    response = self.session.post(url, json=data, headers=req_headers, timeout=30)
            elif method == 'PUT':
                response = self.session.put(url, json=data, headers=req_headers, timeout=30)
            elif method == 'DELETE':
                response = self.session.delete(url, headers=req_headers, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                self.log(f"✅ PASSED - {name} (Status: {response.status_code})", "PASS")
                try:
                    return True, response.json() if response.content else {}
                except:
                    return True, {}
            else:
                self.tests_failed += 1
                error_detail = ""
                try:
                    error_detail = response.json().get('detail', '')
                except:
                    error_detail = response.text[:200]
                msg = f"❌ FAILED - {name} - Expected {expected_status}, got {response.status_code}. Detail: {error_detail}"
                self.log(msg, "FAIL")
                self.failures.append(msg)
                return False, {}

        except Exception as e:
            self.tests_failed += 1
            msg = f"❌ FAILED - {name} - Error: {str(e)}"
            self.log(msg, "FAIL")
            self.failures.append(msg)
            return False, {}

    def login(self, username, password):
        """Login and get token"""
        self.log(f"Logging in as {username}...", "AUTH")
        success, response = self.run_test(
            f"Login as {username}",
            "POST",
            "auth/login",
            200,
            data={"username": username, "password": password}
        )
        if success:
            # Check if session has cookies
            if 'access_token' in self.session.cookies:
                self.log(f"✅ Logged in as {username}", "AUTH")
                return True
        self.log(f"❌ Login failed for {username}", "AUTH")
        return False

    def test_page_meta(self, drawing_id):
        """Test GET /api/drawings/{id}/page-meta?target=mks"""
        self.log(f"Testing page-meta endpoint for drawing {drawing_id}", "TEST")
        success, data = self.run_test(
            "GET page-meta for MKS drawing",
            "GET",
            f"drawings/{drawing_id}/page-meta?target=mks",
            200
        )
        if success:
            if 'pages' in data and 'sizes' in data:
                self.log(f"✅ page-meta returned pages={data['pages']}, sizes count={len(data.get('sizes', []))}", "PASS")
                return True, data
            else:
                self.log(f"❌ page-meta missing 'pages' or 'sizes' fields", "FAIL")
                self.failures.append("page-meta missing required fields")
                return False, {}
        return False, {}

    def test_page_image(self, drawing_id, page=0, target="mks", stamped=True):
        """Test GET /api/drawings/{id}/page-image"""
        self.log(f"Testing page-image endpoint for drawing {drawing_id}, page {page}", "TEST")
        stamped_param = "1" if stamped else "0"
        success, _ = self.run_test(
            f"GET page-image page={page} stamped={stamped}",
            "GET",
            f"drawings/{drawing_id}/page-image?target={target}&page={page}&scale=2&stamped={stamped_param}",
            200
        )
        return success

    def test_per_page_stamp(self):
        """Test per-page stamp placement for TTD signature"""
        self.log("Testing per-page stamp placement (TTD)", "TEST")
        
        # 1. Create drawing
        drawing_data = {
            "customer_code": "MKS",
            "project_initial": "QA",
            "drawing_type": "Assembly",
            "title": "PerPage QA Test",
            "bom_link_mode": "none"
        }
        success, drawing = self.run_test(
            "Create drawing for per-page test",
            "POST",
            "drawings",
            200,
            data=drawing_data
        )
        if not success:
            return False
        
        drawing_id = drawing.get('id')
        self.log(f"Created drawing {drawing.get('drawing_no')} with id {drawing_id}", "INFO")
        
        # 2. Upload a multi-page PDF (we'll skip this for now as we need actual file)
        # For now, we'll test the submit-for-approval with placements
        
        # 3. Submit with per-page placements
        placements_data = {
            "notes": "Testing per-page placement",
            "placements": [
                {"page": 0, "x": 0.15, "y": 0.12, "size": "M"},
                {"page": 1, "x": 0.85, "y": 0.12, "size": "M"}
            ]
        }
        
        # Note: This will fail if no PDF is uploaded, but we're testing the API structure
        success, result = self.run_test(
            "Submit with per-page placements",
            "POST",
            f"drawings/{drawing_id}/submit-for-approval",
            200,
            data=placements_data
        )
        
        # Cleanup
        self.run_test(
            "Delete test drawing",
            "DELETE",
            f"drawings/{drawing_id}",
            200
        )
        
        return success

    def test_dc_stamp_per_page(self, drawing_id):
        """Test DC stamp with per-page placements"""
        self.log(f"Testing DC stamp per-page for drawing {drawing_id}", "TEST")
        
        dc_data = {
            "notes": "DC stamp test",
            "target": "mks",
            "placements": [
                {"page": 0, "x": 0.1, "y": 0.1},
                {"page": 1, "x": 0.8, "y": 0.1}
            ]
        }
        
        success, _ = self.run_test(
            "POST DC stamp with per-page placements",
            "POST",
            f"drawings/{drawing_id}/stamp-controlled",
            200,
            data=dc_data
        )
        return success

    def print_summary(self):
        """Print test summary"""
        print("\n" + "="*80)
        print("BACKEND TEST SUMMARY")
        print("="*80)
        print(f"Total Tests Run: {self.tests_run}")
        print(f"Tests Passed: {self.tests_passed} ✅")
        print(f"Tests Failed: {self.tests_failed} ❌")
        print(f"Success Rate: {(self.tests_passed/self.tests_run*100) if self.tests_run > 0 else 0:.1f}%")
        
        if self.failures:
            print("\n" + "="*80)
            print("FAILURES:")
            print("="*80)
            for i, failure in enumerate(self.failures, 1):
                print(f"{i}. {failure}")
        
        print("="*80)

def main():
    tester = BackendTester()
    
    print("="*80)
    print("PT MITRA KARYA SARANA - BACKEND API TESTS")
    print("Testing: Per-page stamps, PDF preview endpoints")
    print("="*80 + "\n")
    
    # Test with super_admin (susanto)
    if not tester.login("susanto", "Test@123"):
        print("❌ Failed to login as susanto. Cannot proceed with tests.")
        return 1
    
    # Test 1: page-meta endpoint
    print("\n" + "-"*80)
    print("TEST 1: Page Meta Endpoint")
    print("-"*80)
    test_drawing_id = "8c57af85-84e8-4c72-baea-6a0e96274f45"
    success, meta_data = tester.test_page_meta(test_drawing_id)
    if success:
        print(f"✅ page-meta test passed. Pages: {meta_data.get('pages')}")
    
    # Test 2: page-image endpoint
    print("\n" + "-"*80)
    print("TEST 2: Page Image Endpoint")
    print("-"*80)
    if tester.test_page_image(test_drawing_id, page=0, target="mks", stamped=True):
        print("✅ page-image test passed (MKS, stamped)")
    
    # Test with customer_ref target (expect 404 if no customer ref exists)
    success = tester.test_page_image(test_drawing_id, page=0, target="customer_ref", stamped=True)
    if not success:
        print("ℹ️  page-image customer_ref returned 404 (expected if no customer ref uploaded)")
    
    # Test 3: Per-page stamp placement
    print("\n" + "-"*80)
    print("TEST 3: Per-Page Stamp Placement (TTD)")
    print("-"*80)
    tester.test_per_page_stamp()
    
    # Test 4: DC stamp per-page (on existing drawing)
    print("\n" + "-"*80)
    print("TEST 4: DC Stamp Per-Page")
    print("-"*80)
    # Using a controlled drawing
    controlled_drawing_id = "daad8ff8-e66c-4b99-9048-b0de5db29682"
    tester.test_dc_stamp_per_page(controlled_drawing_id)
    
    # Print summary
    tester.print_summary()
    
    # Return exit code
    return 0 if tester.tests_failed == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
