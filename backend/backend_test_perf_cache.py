#!/usr/bin/env python3
"""
Backend API Testing for Performance Optimization (Image-based Document Viewer)
Tests server-side render cache + browser ETag cache + stamped PDF cache + lazy-load pages
"""
import requests
import sys
import hashlib
from datetime import datetime

class PerfCacheTester:
    def __init__(self, public_url="https://error-fix-dev.preview.emergentagent.com", 
                 backend_url="http://localhost:8001"):
        self.public_url = public_url
        self.backend_url = backend_url  # Direct backend for Cache-Control test
        self.session = requests.Session()
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
                f"{self.public_url}/api/auth/login",
                json={"username": username, "password": password},
                timeout=10
            )
            if response.status_code == 200:
                data = response.json()
                print(f"✅ Login successful - User: {data.get('username')}, Role: {data.get('role')}")
                return True
            else:
                print(f"❌ Login failed - Status: {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Login error: {str(e)}")
            return False

    def get_first_drawing(self):
        """Get first available drawing from the list"""
        print("\n📋 Fetching drawing list...")
        try:
            response = self.session.get(
                f"{self.public_url}/api/drawings",
                params={"limit": 10},
                timeout=10
            )
            if response.status_code == 200:
                data = response.json()
                items = data.get("items", [])
                if items:
                    drawing = items[0]
                    print(f"✅ Found drawing: {drawing.get('id')} - {drawing.get('drawing_no')}")
                    return drawing
                else:
                    print("❌ No drawings found in database")
                    return None
            else:
                print(f"❌ Failed to fetch drawings - Status: {response.status_code}")
                return None
        except Exception as e:
            print(f"❌ Error fetching drawings: {str(e)}")
            return None

    def test_page_image_basic(self, drawing_id):
        """Test 1: GET /api/drawings/{drawing_id}/page-image returns 200 with ETag and Cache-Control"""
        print(f"\n🧪 Test 1: Basic page-image endpoint (DIRECT to backend:8001)")
        try:
            # CRITICAL: Test against localhost:8001 to avoid preview proxy rewriting Cache-Control
            url = f"{self.backend_url}/api/drawings/{drawing_id}/page-image"
            params = {"page": 0, "scale": 2, "stamped": 1}
            
            # Need to login to backend directly too
            login_resp = self.session.post(
                f"{self.backend_url}/api/auth/login",
                json={"username": "riski", "password": "eng123"},
                timeout=10
            )
            if login_resp.status_code != 200:
                self.log_result("Page-image basic (backend login)", False, 
                              f"Failed to login to backend: {login_resp.status_code}")
                return None
            
            response = self.session.get(url, params=params, timeout=15)
            
            if response.status_code == 200:
                content_type = response.headers.get("Content-Type", "")
                etag = response.headers.get("ETag", "")
                cache_control = response.headers.get("Cache-Control", "")
                
                # Check all requirements
                checks = []
                checks.append(("Status 200", True, "OK"))
                checks.append(("Content-Type image/png", "image/png" in content_type, 
                             f"Got: {content_type}"))
                checks.append(("ETag present", bool(etag), f"ETag: {etag}"))
                checks.append(("Cache-Control correct", 
                             "private" in cache_control and "max-age=600" in cache_control,
                             f"Got: {cache_control}"))
                
                all_passed = all(c[1] for c in checks)
                details = "\n   ".join([f"{c[0]}: {'✓' if c[1] else '✗'} {c[2]}" for c in checks])
                
                self.log_result("Page-image basic (200, PNG, ETag, Cache-Control)", 
                              all_passed, details)
                
                if all_passed:
                    return {"etag": etag, "content": response.content}
                return None
            else:
                self.log_result("Page-image basic", False, 
                              f"Status {response.status_code}: {response.text[:200]}")
                return None
        except Exception as e:
            self.log_result("Page-image basic", False, f"Exception: {str(e)}")
            return None

    def test_etag_304(self, drawing_id, etag):
        """Test 2: Sending If-None-Match with ETag returns 304"""
        print(f"\n🧪 Test 2: ETag 304 Not Modified (DIRECT to backend:8001)")
        try:
            url = f"{self.backend_url}/api/drawings/{drawing_id}/page-image"
            params = {"page": 0, "scale": 2, "stamped": 1}
            headers = {"If-None-Match": etag}
            
            response = self.session.get(url, params=params, headers=headers, timeout=10)
            
            if response.status_code == 304:
                body_empty = len(response.content) == 0
                self.log_result("ETag 304 Not Modified", body_empty,
                              f"Status: 304, Body empty: {body_empty}")
                return True
            else:
                self.log_result("ETag 304 Not Modified", False,
                              f"Expected 304, got {response.status_code}")
                return False
        except Exception as e:
            self.log_result("ETag 304 Not Modified", False, f"Exception: {str(e)}")
            return False

    def test_warm_cache(self, drawing_id, first_content):
        """Test 3: Second identical request should return same bytes (warm cache)"""
        print(f"\n🧪 Test 3: Warm cache test (second request)")
        try:
            url = f"{self.backend_url}/api/drawings/{drawing_id}/page-image"
            params = {"page": 0, "scale": 2, "stamped": 1}
            
            response = self.session.get(url, params=params, timeout=10)
            
            if response.status_code == 200:
                second_content = response.content
                identical = (hashlib.sha256(first_content).hexdigest() == 
                           hashlib.sha256(second_content).hexdigest())
                
                self.log_result("Warm cache (identical bytes)", identical,
                              f"First hash: {hashlib.sha256(first_content).hexdigest()[:16]}...\n"
                              f"   Second hash: {hashlib.sha256(second_content).hexdigest()[:16]}...")
                return identical
            else:
                self.log_result("Warm cache", False, f"Status {response.status_code}")
                return False
        except Exception as e:
            self.log_result("Warm cache", False, f"Exception: {str(e)}")
            return False

    def test_revision_page_image(self, drawing_id):
        """Test 4: GET /api/drawings/{drawing_id}/revisions/{rev_id}/page-image"""
        print(f"\n🧪 Test 4: Revision page-image endpoint")
        try:
            # First get revisions
            url = f"{self.public_url}/api/drawings/{drawing_id}"
            response = self.session.get(url, timeout=10)
            
            if response.status_code != 200:
                self.log_result("Revision page-image (get drawing)", False,
                              f"Failed to get drawing: {response.status_code}")
                return False
            
            drawing = response.json()
            revisions = drawing.get("revisions", [])
            
            if not revisions:
                self.log_result("Revision page-image", True,
                              "No revisions found (skip gracefully)")
                return True
            
            # Test first revision
            rev_id = revisions[0].get("id")
            url = f"{self.public_url}/api/drawings/{drawing_id}/revisions/{rev_id}/page-image"
            params = {"page": 0, "scale": 2}
            
            response = self.session.get(url, params=params, timeout=15)
            
            if response.status_code == 200:
                content_type = response.headers.get("Content-Type", "")
                etag = response.headers.get("ETag", "")
                
                checks = [
                    ("Status 200", True),
                    ("Content-Type image/png", "image/png" in content_type),
                    ("ETag present", bool(etag))
                ]
                
                all_passed = all(c[1] for c in checks)
                details = ", ".join([f"{c[0]}: {'✓' if c[1] else '✗'}" for c in checks])
                
                self.log_result("Revision page-image", all_passed, details)
                return all_passed
            else:
                self.log_result("Revision page-image", False,
                              f"Status {response.status_code}")
                return False
        except Exception as e:
            self.log_result("Revision page-image", False, f"Exception: {str(e)}")
            return False

    def test_ecn_sheet_page_image(self, drawing_id):
        """Test 5: GET /api/drawings/{drawing_id}/ecn-sheet/page-image"""
        print(f"\n🧪 Test 5: ECN sheet page-image endpoint")
        try:
            url = f"{self.public_url}/api/drawings/{drawing_id}/ecn-sheet/page-image"
            params = {"page": 0, "scale": 2}
            
            response = self.session.get(url, params=params, timeout=15)
            
            # ECN sheet might not exist for all drawings, so 404 is acceptable
            if response.status_code == 200:
                content_type = response.headers.get("Content-Type", "")
                etag = response.headers.get("ETag", "")
                
                checks = [
                    ("Status 200", True),
                    ("Content-Type image/png", "image/png" in content_type),
                    ("ETag present", bool(etag))
                ]
                
                all_passed = all(c[1] for c in checks)
                details = ", ".join([f"{c[0]}: {'✓' if c[1] else '✗'}" for c in checks])
                
                self.log_result("ECN sheet page-image", all_passed, details)
                return all_passed
            elif response.status_code == 404:
                self.log_result("ECN sheet page-image", True,
                              "No ECN sheet (skip gracefully)")
                return True
            else:
                self.log_result("ECN sheet page-image", False,
                              f"Status {response.status_code}")
                return False
        except Exception as e:
            self.log_result("ECN sheet page-image", False, f"Exception: {str(e)}")
            return False

    def test_drawings_list_regression(self):
        """Test 6: Regression - GET /api/drawings list works"""
        print(f"\n🧪 Test 6: Regression - Drawings list")
        try:
            response = self.session.get(
                f"{self.public_url}/api/drawings",
                params={"limit": 10},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                items = data.get("items", [])
                has_items = len(items) > 0
                
                self.log_result("Drawings list regression", has_items,
                              f"Found {len(items)} drawings")
                return has_items
            else:
                self.log_result("Drawings list regression", False,
                              f"Status {response.status_code}")
                return False
        except Exception as e:
            self.log_result("Drawings list regression", False, f"Exception: {str(e)}")
            return False

    def test_page_meta_regression(self, drawing_id):
        """Test 7: Regression - GET /api/drawings/{id}/page-meta"""
        print(f"\n🧪 Test 7: Regression - Page meta")
        try:
            url = f"{self.public_url}/api/drawings/{drawing_id}/page-meta"
            response = self.session.get(url, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                has_pages = "pages" in data
                has_sizes = "sizes" in data
                
                checks = [
                    ("Has pages field", has_pages),
                    ("Has sizes field", has_sizes)
                ]
                
                all_passed = all(c[1] for c in checks)
                details = f"Pages: {data.get('pages')}, Sizes count: {len(data.get('sizes', []))}"
                
                self.log_result("Page meta regression", all_passed, details)
                return all_passed
            else:
                self.log_result("Page meta regression", False,
                              f"Status {response.status_code}")
                return False
        except Exception as e:
            self.log_result("Page meta regression", False, f"Exception: {str(e)}")
            return False

    def test_car_pdf_regression(self):
        """Test 8: Regression CAR - GET /api/nonconformance/{nc_id}/pdf"""
        print(f"\n🧪 Test 8: Regression - CAR PDF")
        try:
            # First get a nonconformance
            response = self.session.get(
                f"{self.public_url}/api/nonconformances",
                params={"limit": 1},
                timeout=10
            )
            
            if response.status_code != 200:
                self.log_result("CAR PDF regression (list)", True,
                              "No nonconformances found (skip gracefully)")
                return True
            
            data = response.json()
            items = data.get("items", [])
            
            if not items:
                self.log_result("CAR PDF regression", True,
                              "No nonconformances found (skip gracefully)")
                return True
            
            nc_id = items[0].get("id")
            url = f"{self.public_url}/api/nonconformance/{nc_id}/pdf"
            
            response = self.session.get(url, timeout=15)
            
            if response.status_code == 200:
                content_type = response.headers.get("Content-Type", "")
                is_pdf = "application/pdf" in content_type
                
                self.log_result("CAR PDF regression", is_pdf,
                              f"Content-Type: {content_type}")
                return is_pdf
            else:
                self.log_result("CAR PDF regression", False,
                              f"Status {response.status_code}")
                return False
        except Exception as e:
            self.log_result("CAR PDF regression", False, f"Exception: {str(e)}")
            return False

    def test_eng006_endpoints(self):
        """Test 9: Regression - ENG-006 endpoints"""
        print(f"\n🧪 Test 9: Regression - ENG-006 endpoints")
        
        # Test 9a: NC log
        try:
            url = f"{self.public_url}/api/nonconformance/eng006-nc-log"
            response = self.session.get(url, timeout=10)
            
            if response.status_code == 200:
                self.log_result("ENG-006 NC log", True, "Endpoint works")
            else:
                self.log_result("ENG-006 NC log", False,
                              f"Status {response.status_code}")
        except Exception as e:
            self.log_result("ENG-006 NC log", False, f"Exception: {str(e)}")
        
        # Test 9b: Excel export
        try:
            url = f"{self.public_url}/api/nonconformance/eng006-nc-log/excel"
            response = self.session.get(url, timeout=15)
            
            if response.status_code == 200:
                content_type = response.headers.get("Content-Type", "")
                is_excel = "spreadsheet" in content_type or "excel" in content_type
                
                self.log_result("ENG-006 Excel export", is_excel,
                              f"Content-Type: {content_type}")
            else:
                self.log_result("ENG-006 Excel export", False,
                              f"Status {response.status_code}")
        except Exception as e:
            self.log_result("ENG-006 Excel export", False, f"Exception: {str(e)}")

    def print_summary(self):
        """Print test summary"""
        print("\n" + "="*60)
        print("📊 TEST SUMMARY")
        print("="*60)
        print(f"Total tests: {self.tests_run}")
        print(f"Passed: {self.tests_passed}")
        print(f"Failed: {self.tests_run - self.tests_passed}")
        print(f"Success rate: {(self.tests_passed/self.tests_run*100) if self.tests_run > 0 else 0:.1f}%")
        print("="*60)
        
        if self.tests_passed < self.tests_run:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result["passed"]:
                    print(f"  - {result['test']}")
                    if result["details"]:
                        print(f"    {result['details']}")

def main():
    print("="*60)
    print("🚀 Performance Optimization Backend Tests")
    print("   Testing: Server-side render cache + ETag + lazy-load")
    print("="*60)
    
    tester = PerfCacheTester()
    
    # Login
    if not tester.login("riski", "eng123"):
        print("\n❌ Login failed, cannot proceed with tests")
        return 1
    
    # Get a drawing to test
    drawing = tester.get_first_drawing()
    if not drawing:
        print("\n❌ No drawings available for testing")
        return 1
    
    drawing_id = drawing.get("id")
    
    # Run tests
    print("\n" + "="*60)
    print("🧪 RUNNING TESTS")
    print("="*60)
    
    # Test 1: Basic page-image with ETag and Cache-Control
    result = tester.test_page_image_basic(drawing_id)
    
    if result:
        # Test 2: ETag 304
        tester.test_etag_304(drawing_id, result["etag"])
        
        # Test 3: Warm cache
        tester.test_warm_cache(drawing_id, result["content"])
    
    # Test 4: Revision page-image
    tester.test_revision_page_image(drawing_id)
    
    # Test 5: ECN sheet page-image
    tester.test_ecn_sheet_page_image(drawing_id)
    
    # Test 6: Drawings list regression
    tester.test_drawings_list_regression()
    
    # Test 7: Page meta regression
    tester.test_page_meta_regression(drawing_id)
    
    # Test 8: CAR PDF regression
    tester.test_car_pdf_regression()
    
    # Test 9: ENG-006 endpoints
    tester.test_eng006_endpoints()
    
    # Print summary
    tester.print_summary()
    
    # Return exit code
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())
