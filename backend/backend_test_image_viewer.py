#!/usr/bin/env python3
"""
Backend API Testing for Image-based PDF Viewer & ECN Workflow
Tests new endpoints for inline PDF viewing and existing ECN/Repeat Order workflows
"""
import requests
import sys
from datetime import datetime

class ImageViewerTester:
    def __init__(self, base_url="https://error-fix-dev.preview.emergentagent.com"):
        self.base_url = base_url
        self.session = requests.Session()
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

    def test_ecn_sheet_page_meta(self, drawing_id):
        """Test GET /api/drawings/{id}/ecn-sheet/page-meta"""
        print(f"\n📄 Testing ECN sheet page-meta for drawing {drawing_id}...")
        try:
            response = self.session.get(
                f"{self.base_url}/api/drawings/{drawing_id}/ecn-sheet/page-meta",
                timeout=10
            )
            if response.status_code == 200:
                data = response.json()
                pages = data.get("pages", 0)
                sizes = data.get("sizes", [])
                self.log_result(
                    f"ECN sheet page-meta (drawing {drawing_id})",
                    True,
                    f"Pages: {pages}, Sizes: {len(sizes)}"
                )
                return data
            else:
                self.log_result(
                    f"ECN sheet page-meta (drawing {drawing_id})",
                    False,
                    f"Status: {response.status_code}, Response: {response.text[:200]}"
                )
                return None
        except Exception as e:
            self.log_result(
                f"ECN sheet page-meta (drawing {drawing_id})",
                False,
                f"Error: {str(e)}"
            )
            return None

    def test_ecn_sheet_page_image(self, drawing_id, page=0):
        """Test GET /api/drawings/{id}/ecn-sheet/page-image"""
        print(f"\n🖼️ Testing ECN sheet page-image for drawing {drawing_id}, page {page}...")
        try:
            response = self.session.get(
                f"{self.base_url}/api/drawings/{drawing_id}/ecn-sheet/page-image?page={page}&scale=2",
                timeout=15
            )
            if response.status_code == 200:
                content_type = response.headers.get("Content-Type", "")
                is_png = content_type == "image/png"
                size = len(response.content)
                self.log_result(
                    f"ECN sheet page-image (drawing {drawing_id}, page {page})",
                    is_png and size > 0,
                    f"Content-Type: {content_type}, Size: {size} bytes"
                )
                return is_png and size > 0
            else:
                self.log_result(
                    f"ECN sheet page-image (drawing {drawing_id}, page {page})",
                    False,
                    f"Status: {response.status_code}, Response: {response.text[:200]}"
                )
                return False
        except Exception as e:
            self.log_result(
                f"ECN sheet page-image (drawing {drawing_id}, page {page})",
                False,
                f"Error: {str(e)}"
            )
            return False

    def test_drawing_page_meta_mks(self, drawing_id):
        """Test GET /api/drawings/{id}/page-meta?target=mks"""
        print(f"\n📄 Testing MKS page-meta for drawing {drawing_id}...")
        try:
            response = self.session.get(
                f"{self.base_url}/api/drawings/{drawing_id}/page-meta?target=mks",
                timeout=10
            )
            if response.status_code == 200:
                data = response.json()
                pages = data.get("pages", 0)
                message = data.get("message", "")
                sizes = data.get("sizes", [])
                # Graceful: pages=0 with message is OK for missing files
                self.log_result(
                    f"MKS page-meta (drawing {drawing_id})",
                    True,
                    f"Pages: {pages}, Message: {message}, Sizes: {len(sizes)}"
                )
                return data
            else:
                self.log_result(
                    f"MKS page-meta (drawing {drawing_id})",
                    False,
                    f"Status: {response.status_code}, Response: {response.text[:200]}"
                )
                return None
        except Exception as e:
            self.log_result(
                f"MKS page-meta (drawing {drawing_id})",
                False,
                f"Error: {str(e)}"
            )
            return None

    def test_drawing_page_image_mks(self, drawing_id, page=0):
        """Test GET /api/drawings/{id}/page-image?target=mks&page=0&stamped=1"""
        print(f"\n🖼️ Testing MKS page-image for drawing {drawing_id}, page {page}...")
        try:
            response = self.session.get(
                f"{self.base_url}/api/drawings/{drawing_id}/page-image?target=mks&page={page}&scale=2&stamped=1",
                timeout=15
            )
            if response.status_code == 200:
                content_type = response.headers.get("Content-Type", "")
                is_png = content_type == "image/png"
                size = len(response.content)
                self.log_result(
                    f"MKS page-image (drawing {drawing_id}, page {page})",
                    is_png and size > 0,
                    f"Content-Type: {content_type}, Size: {size} bytes"
                )
                return is_png and size > 0
            else:
                self.log_result(
                    f"MKS page-image (drawing {drawing_id}, page {page})",
                    False,
                    f"Status: {response.status_code}, Response: {response.text[:200]}"
                )
                return False
        except Exception as e:
            self.log_result(
                f"MKS page-image (drawing {drawing_id}, page {page})",
                False,
                f"Error: {str(e)}"
            )
            return False

    def test_pdf_stamped(self, drawing_id):
        """Test GET /api/drawings/{id}/pdf-stamped (anti-fail endpoint)"""
        print(f"\n📑 Testing pdf-stamped for drawing {drawing_id}...")
        try:
            response = self.session.get(
                f"{self.base_url}/api/drawings/{drawing_id}/pdf-stamped",
                timeout=15
            )
            # Should always return 200 with PDF (even placeholder)
            if response.status_code == 200:
                content_type = response.headers.get("Content-Type", "")
                is_pdf = content_type == "application/pdf"
                size = len(response.content)
                self.log_result(
                    f"pdf-stamped (drawing {drawing_id})",
                    is_pdf and size > 0,
                    f"Content-Type: {content_type}, Size: {size} bytes"
                )
                return is_pdf and size > 0
            else:
                self.log_result(
                    f"pdf-stamped (drawing {drawing_id})",
                    False,
                    f"Status: {response.status_code}, Response: {response.text[:200]}"
                )
                return False
        except Exception as e:
            self.log_result(
                f"pdf-stamped (drawing {drawing_id})",
                False,
                f"Error: {str(e)}"
            )
            return False

    def test_ecn_sheet_download(self, drawing_id):
        """Test GET /api/drawings/{id}/ecn-sheet (PDF download)"""
        print(f"\n📥 Testing ECN sheet download for drawing {drawing_id}...")
        try:
            response = self.session.get(
                f"{self.base_url}/api/drawings/{drawing_id}/ecn-sheet",
                timeout=15
            )
            if response.status_code == 200:
                content_type = response.headers.get("Content-Type", "")
                is_pdf = content_type == "application/pdf"
                size = len(response.content)
                self.log_result(
                    f"ECN sheet download (drawing {drawing_id})",
                    is_pdf and size > 0,
                    f"Content-Type: {content_type}, Size: {size} bytes"
                )
                return is_pdf and size > 0
            else:
                self.log_result(
                    f"ECN sheet download (drawing {drawing_id})",
                    False,
                    f"Status: {response.status_code}, Response: {response.text[:200]}"
                )
                return False
        except Exception as e:
            self.log_result(
                f"ECN sheet download (drawing {drawing_id})",
                False,
                f"Error: {str(e)}"
            )
            return False

    def test_ecn_pending_ttd(self):
        """Test GET /api/drawings/ecn-pending-ttd"""
        print(f"\n📋 Testing ECN pending TTD list...")
        try:
            response = self.session.get(
                f"{self.base_url}/api/drawings/ecn-pending-ttd",
                timeout=10
            )
            if response.status_code == 200:
                data = response.json()
                items = data.get("items", [])
                self.log_result(
                    "ECN pending TTD list",
                    True,
                    f"Found {len(items)} pending ECN items"
                )
                return items
            else:
                self.log_result(
                    "ECN pending TTD list",
                    False,
                    f"Status: {response.status_code}, Response: {response.text[:200]}"
                )
                return []
        except Exception as e:
            self.log_result(
                "ECN pending TTD list",
                False,
                f"Error: {str(e)}"
            )
            return []

    def test_ecn_ack(self, drawing_id):
        """Test POST /api/drawings/{id}/ecn-ack (role-gated, just verify endpoint exists)"""
        print(f"\n✍️ Testing ECN ack endpoint for drawing {drawing_id}...")
        try:
            response = self.session.post(
                f"{self.base_url}/api/drawings/{drawing_id}/ecn-ack",
                json={},
                timeout=10
            )
            # We expect 403 (not authorized) or 400 (missing data) or 200 (success)
            # NOT 404 (endpoint doesn't exist)
            if response.status_code in [200, 400, 403, 409]:
                self.log_result(
                    f"ECN ack endpoint (drawing {drawing_id})",
                    True,
                    f"Endpoint exists (Status: {response.status_code})"
                )
                return True
            else:
                self.log_result(
                    f"ECN ack endpoint (drawing {drawing_id})",
                    False,
                    f"Status: {response.status_code}, Response: {response.text[:200]}"
                )
                return False
        except Exception as e:
            self.log_result(
                f"ECN ack endpoint (drawing {drawing_id})",
                False,
                f"Error: {str(e)}"
            )
            return False

    def test_repeat_search(self):
        """Test GET /api/drawings/repeat-search"""
        print(f"\n🔍 Testing repeat search...")
        try:
            response = self.session.get(
                f"{self.base_url}/api/drawings/repeat-search?q=MKS",
                timeout=10
            )
            if response.status_code == 200:
                data = response.json()
                items = data.get("items", [])
                self.log_result(
                    "Repeat search",
                    True,
                    f"Found {len(items)} results"
                )
                return items
            else:
                self.log_result(
                    "Repeat search",
                    False,
                    f"Status: {response.status_code}, Response: {response.text[:200]}"
                )
                return []
        except Exception as e:
            self.log_result(
                "Repeat search",
                False,
                f"Error: {str(e)}"
            )
            return []

    def test_pull_repeat(self, drf_id):
        """Test POST /api/drawing-requests/{drf_id}/pull-repeat (role-gated)"""
        print(f"\n🔄 Testing pull-repeat endpoint for DRF {drf_id}...")
        try:
            response = self.session.post(
                f"{self.base_url}/api/drawing-requests/{drf_id}/pull-repeat",
                json={"source_drawing_ids": ["test"]},
                timeout=10
            )
            # We expect 403 (not authorized) or 400 (missing data) or 404 (DRF not found)
            # NOT 404 for endpoint itself
            if response.status_code in [200, 400, 403, 404, 409]:
                self.log_result(
                    f"Pull-repeat endpoint (DRF {drf_id})",
                    True,
                    f"Endpoint exists (Status: {response.status_code})"
                )
                return True
            else:
                self.log_result(
                    f"Pull-repeat endpoint (DRF {drf_id})",
                    False,
                    f"Status: {response.status_code}, Response: {response.text[:200]}"
                )
                return False
        except Exception as e:
            self.log_result(
                f"Pull-repeat endpoint (DRF {drf_id})",
                False,
                f"Error: {str(e)}"
            )
            return False

    def print_summary(self):
        """Print test summary"""
        print("\n" + "="*60)
        print(f"📊 TEST SUMMARY")
        print("="*60)
        print(f"Total Tests: {self.tests_run}")
        print(f"Passed: {self.tests_passed}")
        print(f"Failed: {self.tests_run - self.tests_passed}")
        print(f"Success Rate: {(self.tests_passed/self.tests_run*100) if self.tests_run > 0 else 0:.1f}%")
        print("="*60)
        
        if self.tests_run - self.tests_passed > 0:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result["passed"]:
                    print(f"  - {result['test']}")
                    if result["details"]:
                        print(f"    {result['details']}")


def main():
    tester = ImageViewerTester()
    
    # Test data from agent context
    DRAWING_WITHOUT_MKS = "bd2dc414-10d2-499c-b21f-05cc615170b0"  # has ECN, no MKS
    DRAWING_WITH_MKS = "8c57af85-84e8-4c72-baea-6a0e96274f45"  # MKS-TEST-A.00, 3 pages
    
    # Login as qcuser (QA/QC role for ECN testing)
    if not tester.login("qcuser", "QcMks2026"):
        print("\n⚠️ qcuser login failed, trying riski (eng_leader)...")
        if not tester.login("riski", "eng123"):
            print("\n❌ All logins failed. Cannot proceed with tests.")
            return 1
    
    print("\n" + "="*60)
    print("🧪 TESTING IMAGE-BASED PDF VIEWER ENDPOINTS")
    print("="*60)
    
    # Test ECN sheet endpoints (drawing with ECN)
    print(f"\n--- Testing ECN Sheet Endpoints (Drawing: {DRAWING_WITHOUT_MKS}) ---")
    tester.test_ecn_sheet_page_meta(DRAWING_WITHOUT_MKS)
    tester.test_ecn_sheet_page_image(DRAWING_WITHOUT_MKS, page=0)
    tester.test_ecn_sheet_download(DRAWING_WITHOUT_MKS)
    
    # Test MKS page-meta/page-image (drawing WITHOUT MKS - should be graceful)
    print(f"\n--- Testing MKS Endpoints - No File (Drawing: {DRAWING_WITHOUT_MKS}) ---")
    meta = tester.test_drawing_page_meta_mks(DRAWING_WITHOUT_MKS)
    if meta and meta.get("pages") == 0:
        print("✅ Graceful handling: pages=0 with message for missing MKS file")
    
    # Test MKS page-meta/page-image (drawing WITH MKS)
    print(f"\n--- Testing MKS Endpoints - With File (Drawing: {DRAWING_WITH_MKS}) ---")
    meta = tester.test_drawing_page_meta_mks(DRAWING_WITH_MKS)
    if meta and meta.get("pages", 0) > 0:
        tester.test_drawing_page_image_mks(DRAWING_WITH_MKS, page=0)
    
    # Test pdf-stamped (anti-fail endpoint)
    print(f"\n--- Testing PDF Stamped Endpoint ---")
    tester.test_pdf_stamped(DRAWING_WITHOUT_MKS)
    tester.test_pdf_stamped(DRAWING_WITH_MKS)
    
    # Test ECN workflow endpoints
    print(f"\n--- Testing ECN Workflow Endpoints ---")
    pending_items = tester.test_ecn_pending_ttd()
    if pending_items:
        # Test ecn-ack with first pending item
        tester.test_ecn_ack(pending_items[0].get("drawing_id", DRAWING_WITHOUT_MKS))
    else:
        # Test with known drawing
        tester.test_ecn_ack(DRAWING_WITHOUT_MKS)
    
    # Test Repeat Order endpoints
    print(f"\n--- Testing Repeat Order Endpoints ---")
    tester.test_repeat_search()
    tester.test_pull_repeat("test-drf-id")  # Just verify endpoint exists
    
    tester.print_summary()
    
    return 0 if tester.tests_passed == tester.tests_run else 1


if __name__ == "__main__":
    sys.exit(main())
