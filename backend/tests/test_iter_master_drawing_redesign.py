"""
Test Master Drawing List Redesign (MKS-F-ENG-005)
- Backend: page-image with stamped=1&hide_so=1 removes SO stamp
- Backend regression: pdf-stamped still works
"""
import requests
import sys

BASE_URL = "https://error-fix-dev.preview.emergentagent.com/api"

# Test drawing with SO stamp
TEST_DRAWING_ID = "8c57af85-84e8-4c72-baea-6a0e96274f45"  # MKS-TEST-A.00

class TestMasterDrawingRedesign:
    def __init__(self):
        self.session = requests.Session()
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.failures = []

    def log(self, msg):
        print(f"  {msg}")

    def test(self, name, condition, error_msg=""):
        self.tests_run += 1
        if condition:
            self.tests_passed += 1
            self.log(f"✅ {name}")
            return True
        else:
            self.tests_failed += 1
            self.failures.append(f"{name}: {error_msg}")
            self.log(f"❌ {name}: {error_msg}")
            return False

    def login(self, username, password):
        """Login and get session cookie"""
        try:
            resp = self.session.post(
                f"{BASE_URL}/auth/login",
                json={"username": username, "password": password}
            )
            if resp.status_code == 200:
                self.log(f"✅ Logged in as {username}")
                return True
            else:
                self.log(f"❌ Login failed: {resp.status_code} - {resp.text}")
                return False
        except Exception as e:
            self.log(f"❌ Login error: {e}")
            return False

    def test_page_image_with_hide_so(self):
        """Test GET /api/drawings/{id}/page-image with stamped=1&hide_so=1"""
        self.log("\n🔍 Testing page-image with hide_so parameter...")
        
        # Test 1: Get page-image WITH SO stamp (stamped=1, hide_so=0)
        try:
            resp_with_so = self.session.get(
                f"{BASE_URL}/drawings/{TEST_DRAWING_ID}/page-image",
                params={"page": 0, "target": "mks", "stamped": "1", "hide_so": "0", "scale": "2"}
            )
            self.test(
                "page-image with SO stamp returns 200",
                resp_with_so.status_code == 200,
                f"Got {resp_with_so.status_code}"
            )
            self.test(
                "page-image with SO stamp returns PNG",
                resp_with_so.headers.get("content-type") == "image/png",
                f"Got {resp_with_so.headers.get('content-type')}"
            )
            size_with_so = len(resp_with_so.content)
            self.log(f"   Size WITH SO stamp: {size_with_so} bytes")
        except Exception as e:
            self.test("page-image with SO stamp", False, str(e))
            return

        # Test 2: Get page-image WITHOUT SO stamp (stamped=1, hide_so=1)
        try:
            resp_without_so = self.session.get(
                f"{BASE_URL}/drawings/{TEST_DRAWING_ID}/page-image",
                params={"page": 0, "target": "mks", "stamped": "1", "hide_so": "1", "scale": "2"}
            )
            self.test(
                "page-image with hide_so=1 returns 200",
                resp_without_so.status_code == 200,
                f"Got {resp_without_so.status_code}"
            )
            self.test(
                "page-image with hide_so=1 returns PNG",
                resp_without_so.headers.get("content-type") == "image/png",
                f"Got {resp_without_so.headers.get('content-type')}"
            )
            size_without_so = len(resp_without_so.content)
            self.log(f"   Size WITHOUT SO stamp: {size_without_so} bytes")
            
            # Test 3: Verify sizes are different (SO stamp removed)
            # Main agent verified: 32392 vs 44094 bytes difference
            self.test(
                "hide_so=1 produces different output (SO stamp removed)",
                size_with_so != size_without_so,
                f"Sizes are identical: {size_with_so} bytes"
            )
            
            # Typically, removing stamp should reduce size slightly
            # But with PNG compression, it might vary. Just check they're different.
            if size_with_so != size_without_so:
                self.log(f"   ✓ Size difference: {abs(size_with_so - size_without_so)} bytes")
                
        except Exception as e:
            self.test("page-image with hide_so=1", False, str(e))

    def test_pdf_stamped_regression(self):
        """Test GET /api/drawings/{id}/pdf-stamped still works (regression)"""
        self.log("\n🔍 Testing pdf-stamped endpoint (regression)...")
        
        try:
            resp = self.session.get(f"{BASE_URL}/drawings/{TEST_DRAWING_ID}/pdf-stamped")
            self.test(
                "pdf-stamped returns 200",
                resp.status_code == 200,
                f"Got {resp.status_code}"
            )
            self.test(
                "pdf-stamped returns PDF",
                resp.headers.get("content-type") == "application/pdf",
                f"Got {resp.headers.get('content-type')}"
            )
            self.test(
                "pdf-stamped has content",
                len(resp.content) > 1000,
                f"Got {len(resp.content)} bytes"
            )
            self.log(f"   PDF size: {len(resp.content)} bytes")
        except Exception as e:
            self.test("pdf-stamped endpoint", False, str(e))

    def test_page_meta(self):
        """Test GET /api/drawings/{id}/page-meta returns valid metadata"""
        self.log("\n🔍 Testing page-meta endpoint...")
        
        try:
            resp = self.session.get(
                f"{BASE_URL}/drawings/{TEST_DRAWING_ID}/page-meta",
                params={"target": "mks"}
            )
            self.test(
                "page-meta returns 200",
                resp.status_code == 200,
                f"Got {resp.status_code}"
            )
            
            if resp.status_code == 200:
                data = resp.json()
                self.test(
                    "page-meta has 'pages' field",
                    "pages" in data,
                    f"Response: {data}"
                )
                self.test(
                    "page-meta has 'sizes' field",
                    "sizes" in data,
                    f"Response: {data}"
                )
                if "pages" in data:
                    self.log(f"   Pages: {data['pages']}")
        except Exception as e:
            self.test("page-meta endpoint", False, str(e))

    def run_all_tests(self):
        print("\n" + "="*70)
        print("🧪 Master Drawing List Redesign - Backend API Tests")
        print("="*70)
        
        # Login as super admin
        if not self.login("susanto", "Subbalo1994"):
            print("\n❌ Login failed, cannot proceed with tests")
            return False
        
        # Run tests
        self.test_page_meta()
        self.test_page_image_with_hide_so()
        self.test_pdf_stamped_regression()
        
        # Summary
        print("\n" + "="*70)
        print(f"📊 Test Summary: {self.tests_passed}/{self.tests_run} passed")
        if self.tests_failed > 0:
            print(f"\n❌ Failed tests ({self.tests_failed}):")
            for failure in self.failures:
                print(f"   - {failure}")
        print("="*70)
        
        return self.tests_failed == 0


if __name__ == "__main__":
    tester = TestMasterDrawingRedesign()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)
