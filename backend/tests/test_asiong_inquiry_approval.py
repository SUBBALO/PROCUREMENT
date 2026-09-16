"""
Test Suite: Asiong (sales_head) Inquiry Approval Feature
Testing that asiong sees "Menunggu Approval Inquiry" card instead of "Review & TTD Drawing"
"""
import requests
import sys

BASE_URL = "https://error-fix-dev.preview.emergentagent.com/api"

class TestAsiongInquiryApproval:
    def __init__(self):
        self.base_url = BASE_URL
        self.asiong_token = None
        self.nicholas_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.failures = []

    def log_test(self, name, passed, message=""):
        """Log test result"""
        self.tests_run += 1
        if passed:
            self.tests_passed += 1
            print(f"✅ PASS: {name}")
            if message:
                print(f"   → {message}")
        else:
            self.tests_failed += 1
            self.failures.append(f"{name}: {message}")
            print(f"❌ FAIL: {name}")
            print(f"   → {message}")

    def login(self, username, password):
        """Login and return token"""
        try:
            response = requests.post(
                f"{self.base_url}/auth/login",
                json={"username": username, "password": password},
                timeout=10
            )
            if response.status_code == 200:
                # Check if token is in cookies
                if 'access_token' in response.cookies:
                    return response.cookies.get('access_token')
                # Or in response body
                data = response.json()
                if 'access_token' in data:
                    return data['access_token']
                print(f"⚠️  Login successful but no token found for {username}")
                return None
            else:
                print(f"❌ Login failed for {username}: {response.status_code}")
                print(f"   Response: {response.text}")
                return None
        except Exception as e:
            print(f"❌ Login error for {username}: {str(e)}")
            return None

    def test_backend_pending_count_asiong(self):
        """Test GET /api/inquiries/pending-count as asiong (sales_head)"""
        print("\n🔍 Testing Backend: GET /api/inquiries/pending-count as asiong...")
        
        if not self.asiong_token:
            self.log_test(
                "Backend - Asiong pending-count",
                False,
                "Cannot test: asiong not logged in"
            )
            return

        try:
            # Use cookies for authentication
            cookies = {'access_token': self.asiong_token}
            response = requests.get(
                f"{self.base_url}/inquiries/pending-count",
                cookies=cookies,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                role = data.get('role')
                kind = data.get('kind')
                count = data.get('count', 0)
                
                # Check that kind is 'pending_boss_review' for sales_head
                if kind == 'pending_boss_review':
                    self.log_test(
                        "Backend - Asiong pending-count returns kind='pending_boss_review'",
                        True,
                        f"✓ role={role}, kind={kind}, count={count}"
                    )
                else:
                    self.log_test(
                        "Backend - Asiong pending-count returns kind='pending_boss_review'",
                        False,
                        f"Expected kind='pending_boss_review', got kind='{kind}' (role={role}, count={count})"
                    )
            else:
                self.log_test(
                    "Backend - Asiong pending-count",
                    False,
                    f"Expected 200, got {response.status_code}: {response.text}"
                )
        except Exception as e:
            self.log_test(
                "Backend - Asiong pending-count",
                False,
                f"Exception: {str(e)}"
            )

    def test_backend_pending_count_nicholas(self):
        """Test GET /api/inquiries/pending-count as nicholas (sales) - regression test"""
        print("\n🔍 Testing Backend: GET /api/inquiries/pending-count as nicholas (regression)...")
        
        if not self.nicholas_token:
            self.log_test(
                "Backend - Nicholas pending-count (regression)",
                False,
                "Cannot test: nicholas not logged in"
            )
            return

        try:
            cookies = {'access_token': self.nicholas_token}
            response = requests.get(
                f"{self.base_url}/inquiries/pending-count",
                cookies=cookies,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                role = data.get('role')
                kind = data.get('kind')
                count = data.get('count', 0)
                
                # For normal sales, kind should be 'awaiting_review'
                if kind == 'awaiting_review':
                    self.log_test(
                        "Backend - Nicholas pending-count returns kind='awaiting_review'",
                        True,
                        f"✓ role={role}, kind={kind}, count={count}"
                    )
                else:
                    self.log_test(
                        "Backend - Nicholas pending-count returns kind='awaiting_review'",
                        False,
                        f"Expected kind='awaiting_review', got kind='{kind}' (role={role}, count={count})"
                    )
            else:
                self.log_test(
                    "Backend - Nicholas pending-count (regression)",
                    False,
                    f"Expected 200, got {response.status_code}: {response.text}"
                )
        except Exception as e:
            self.log_test(
                "Backend - Nicholas pending-count (regression)",
                False,
                f"Exception: {str(e)}"
            )

    def run_all_tests(self):
        """Run all backend tests"""
        print("=" * 70)
        print("🧪 BACKEND TEST SUITE: Asiong Inquiry Approval Feature")
        print("=" * 70)
        
        # Login as asiong
        print("\n🔐 Logging in as asiong (sales_head)...")
        self.asiong_token = self.login("asiong", "Asiong2026")
        if self.asiong_token:
            print("✅ Asiong login successful")
        else:
            print("❌ Asiong login failed - cannot proceed with tests")
            return False
        
        # Login as nicholas for regression test
        print("\n🔐 Logging in as nicholas (sales)...")
        self.nicholas_token = self.login("nicholas", "sales123")
        if self.nicholas_token:
            print("✅ Nicholas login successful")
        else:
            print("⚠️  Nicholas login failed - regression test will be skipped")
        
        # Run backend tests
        self.test_backend_pending_count_asiong()
        if self.nicholas_token:
            self.test_backend_pending_count_nicholas()
        
        # Print summary
        print("\n" + "=" * 70)
        print("📊 BACKEND TEST SUMMARY")
        print("=" * 70)
        print(f"Total Tests: {self.tests_run}")
        print(f"✅ Passed: {self.tests_passed}")
        print(f"❌ Failed: {self.tests_failed}")
        
        if self.failures:
            print("\n❌ Failed Tests:")
            for failure in self.failures:
                print(f"   • {failure}")
        
        print("=" * 70)
        
        return self.tests_failed == 0


def main():
    tester = TestAsiongInquiryApproval()
    success = tester.run_all_tests()
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
