#!/usr/bin/env python3
"""
Backend API Testing for Engineering Department Comprehensive Audit
Tests all critical endpoints for eng_leader and eng_staff roles
"""
import requests
import sys
from datetime import datetime

class EngineeringAPITester:
    def __init__(self, base_url="https://error-fix-dev.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.session = requests.Session()
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.errors = []
        self.current_role = ""

    def log(self, message, level="INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {level}: {message}")

    def run_test(self, name, method, endpoint, expected_status, data=None):
        """Run a single API test"""
        url = f"{self.base_url}{endpoint}"
        headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        self.log(f"Testing {name} ({self.current_role})...")
        
        try:
            if method == 'GET':
                response = self.session.get(url, headers=headers, timeout=15)
            elif method == 'POST':
                response = self.session.post(url, json=data, headers=headers, timeout=15)
            else:
                response = self.session.request(method, url, json=data, headers=headers, timeout=15)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                self.log(f"✅ PASSED - Status: {response.status_code}")
                return True, response
            else:
                self.tests_failed += 1
                error_msg = f"❌ FAILED - Expected {expected_status}, got {response.status_code}"
                self.log(error_msg)
                try:
                    error_detail = response.json()
                    self.log(f"   Error detail: {error_detail}")
                    self.errors.append({"test": name, "role": self.current_role, "status": response.status_code, "detail": error_detail})
                except Exception:
                    self.errors.append({"test": name, "role": self.current_role, "status": response.status_code, "detail": response.text[:200]})
                return False, response

        except requests.exceptions.Timeout:
            self.tests_failed += 1
            error_msg = f"❌ FAILED - Request timeout"
            self.log(error_msg)
            self.errors.append({"test": name, "role": self.current_role, "error": "timeout"})
            return False, None
        except Exception as e:
            self.tests_failed += 1
            error_msg = f"❌ FAILED - Error: {str(e)}"
            self.log(error_msg)
            self.errors.append({"test": name, "role": self.current_role, "error": str(e)})
            return False, None

    def login(self, username, password):
        """Login and establish session"""
        self.log(f"Logging in as {username}...")
        success, response = self.run_test(
            f"Login as {username}",
            "POST",
            "/auth/login",
            200,
            data={"username": username, "password": password}
        )
        if success:
            self.log(f"✅ Successfully logged in as {username}")
            return True
        else:
            self.log(f"❌ Login failed for {username}")
            return False

    def logout(self):
        """Logout current session"""
        try:
            self.session.post(f"{self.base_url}/auth/logout", timeout=5)
            self.session.cookies.clear()
            self.log("Logged out")
        except Exception:
            pass

    def test_engineering_endpoints(self):
        """Test all critical engineering endpoints"""
        self.log(f"\n{'='*70}")
        self.log(f"Testing Engineering Endpoints as {self.current_role}")
        self.log(f"{'='*70}\n")

        # Test 1: Drawing Requests for Engineering
        self.run_test(
            "GET Drawing Requests (for_engineering scope)",
            "GET",
            "/drawing-requests?scope=for_engineering",
            200
        )

        # Test 2: Inquiries
        self.run_test(
            "GET Inquiries",
            "GET",
            "/inquiries",
            200
        )

        # Test 3: Pending My Approval
        self.run_test(
            "GET Drawings Pending My Approval",
            "GET",
            "/drawings/pending-my-approval",
            200
        )

        # Test 4: My Signature History
        self.run_test(
            "GET My Signature History",
            "GET",
            "/drawings/my-signature-history",
            200
        )

        # Test 5: BOM by SO (test SO)
        self.run_test(
            "GET BOM by SO (SO-TEST-9001)",
            "GET",
            "/bom/by-so?so_no=SO-TEST-9001",
            200
        )

        # Test 6: Notifications
        self.run_test(
            "GET Notifications",
            "GET",
            "/notifications",
            200
        )

        # Test 7: Engineering KPI
        self.run_test(
            "GET Engineering KPI",
            "GET",
            "/engineering/kpi",
            200
        )

        # Test 8: Engineering Workload
        self.run_test(
            "GET Engineering Workload",
            "GET",
            "/engineering/workload",
            200
        )

        # Test 9: Material Costing Materials
        self.run_test(
            "GET Material Costing Materials",
            "GET",
            "/material-costing/materials",
            200
        )

        # Test 10: Pending Leader Verification (eng_leader only)
        if "leader" in self.current_role.lower():
            self.run_test(
                "GET Pending Leader Verification",
                "GET",
                "/engineering/pending-leader-verification",
                200
            )

        # Test 11: Drawings list
        self.run_test(
            "GET Drawings List",
            "GET",
            "/drawings?limit=10",
            200
        )

        # Test 12: BOM List
        self.run_test(
            "GET BOM List",
            "GET",
            "/bom?limit=10",
            200
        )

        # Test 13: Drawing Requests My Queue
        self.run_test(
            "GET Drawing Requests My Queue",
            "GET",
            "/drawing-requests/my-queue",
            200
        )

        # Test 14: Engineering Users List
        self.run_test(
            "GET Engineering Users",
            "GET",
            "/drawing-requests/engineering-users",
            200
        )

    def print_summary(self):
        """Print test summary"""
        self.log(f"\n{'='*70}")
        self.log("TEST SUMMARY")
        self.log(f"{'='*70}")
        self.log(f"Total Tests Run: {self.tests_run}")
        self.log(f"Tests Passed: {self.tests_passed} ✅")
        self.log(f"Tests Failed: {self.tests_failed} ❌")
        if self.tests_run > 0:
            self.log(f"Success Rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        if self.errors:
            self.log(f"\n{'='*70}")
            self.log("FAILED TESTS DETAILS:")
            self.log(f"{'='*70}")
            for i, error in enumerate(self.errors, 1):
                self.log(f"\n{i}. {error.get('test', 'Unknown')} ({error.get('role', 'Unknown')})")
                if 'status' in error:
                    self.log(f"   Status Code: {error['status']}")
                if 'detail' in error:
                    self.log(f"   Detail: {error['detail']}")
                if 'error' in error:
                    self.log(f"   Error: {error['error']}")

def main():
    tester = EngineeringAPITester()
    
    print("\n" + "="*70)
    print("ENGINEERING DEPARTMENT BACKEND API COMPREHENSIVE AUDIT")
    print("="*70 + "\n")

    # Test with eng_leader credentials
    print("\n" + "="*70)
    print("PHASE 1: Testing with ENG_LEADER credentials")
    print("="*70 + "\n")
    
    tester.current_role = "ENG_LEADER"
    if tester.login("qa_eng_leader", "QaTest#2026"):
        tester.test_engineering_endpoints()
        tester.logout()
    else:
        print("❌ Failed to login as qa_eng_leader, trying alternative credentials...")
        if tester.login("riski", "eng123"):
            tester.current_role = "ENG_LEADER (riski)"
            tester.test_engineering_endpoints()
            tester.logout()
        else:
            print("❌ Failed to login with eng_leader credentials")

    # Test with eng_staff credentials
    print("\n" + "="*70)
    print("PHASE 2: Testing with ENG_STAFF credentials")
    print("="*70 + "\n")
    
    tester.current_role = "ENG_STAFF"
    if tester.login("qa_eng_staff", "QaTest#2026"):
        tester.test_engineering_endpoints()
        tester.logout()
    else:
        print("❌ Failed to login as qa_eng_staff, trying alternative credentials...")
        if tester.login("engstaff", "eng123"):
            tester.current_role = "ENG_STAFF (engstaff)"
            tester.test_engineering_endpoints()
            tester.logout()
        else:
            print("❌ Failed to login with eng_staff credentials")

    # Print final summary
    tester.print_summary()
    
    # Return exit code based on results
    return 0 if tester.tests_failed == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
