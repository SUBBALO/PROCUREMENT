#!/usr/bin/env python3
"""
Backend API Testing for Engineering Workload & Regression Tests
Tests:
1. NEW: GET /api/engineering/workload (riski/eng123) - 200 with proper structure
2. RBAC: GET /api/engineering/workload (qcuser/QcMks2026) - 403 for non-engineering
3. REGRESSION: ECN sheet endpoints, page-meta, pdf-stamped, merged queues, badges
"""
import requests
import sys
from datetime import datetime

class WorkloadRegressionTester:
    def __init__(self, base_url="https://error-fix-dev.preview.emergentagent.com"):
        self.base_url = base_url
        self.session = requests.Session()
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        self.current_user = None

    def log_result(self, test_name, passed, details=""):
        """Log test result"""
        self.tests_run += 1
        if passed:
            self.tests_passed += 1
            print(f"✅ PASS: {test_name}")
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
        """Login with cookie-based auth"""
        print(f"\n🔐 Logging in as {username}...")
        try:
            response = self.session.post(
                f"{self.base_url}/api/auth/login",
                json={"username": username, "password": password},
                timeout=10
            )
            if response.status_code == 200:
                data = response.json()
                self.current_user = data
                print(f"✅ Login successful - Role: {data.get('role')}, Name: {data.get('name')}")
                return True
            else:
                print(f"❌ Login failed - Status: {response.status_code}")
                print(f"   Response: {response.text[:200]}")
                return False
        except Exception as e:
            print(f"❌ Login error: {str(e)}")
            return False

    def logout(self):
        """Logout to clear session"""
        try:
            self.session.post(f"{self.base_url}/api/auth/logout", timeout=5)
            self.session.cookies.clear()
            self.current_user = None
        except:
            pass

    # ========== NEW FEATURE TESTS ==========
    
    def test_workload_endpoint_engineering(self):
        """Test GET /api/engineering/workload with engineering user (riski)"""
        print("\n📊 Testing workload endpoint with engineering user...")
        try:
            response = self.session.get(
                f"{self.base_url}/api/engineering/workload",
                timeout=10
            )
            
            if response.status_code != 200:
                self.log_result(
                    "Workload endpoint (engineering user)",
                    False,
                    f"Expected 200, got {response.status_code}: {response.text[:200]}"
                )
                return False
            
            data = response.json()
            
            # Validate structure
            required_keys = ["items", "summary", "thresholds"]
            missing_keys = [k for k in required_keys if k not in data]
            if missing_keys:
                self.log_result(
                    "Workload endpoint (engineering user)",
                    False,
                    f"Missing keys in response: {missing_keys}"
                )
                return False
            
            # Validate items structure
            items = data.get("items", [])
            if not isinstance(items, list):
                self.log_result(
                    "Workload endpoint (engineering user)",
                    False,
                    "items should be a list"
                )
                return False
            
            # Check if items have required fields
            if items:
                item = items[0]
                required_item_fields = ["user_id", "name", "username", "role", "drf", "drawing", 
                                       "inquiry", "ecn", "overdue", "total", "level"]
                missing_item_fields = [f for f in required_item_fields if f not in item]
                if missing_item_fields:
                    self.log_result(
                        "Workload endpoint (engineering user)",
                        False,
                        f"Missing fields in item: {missing_item_fields}"
                    )
                    return False
                
                # Validate total calculation
                calculated_total = item["drf"] + item["drawing"] + item["inquiry"] + item["ecn"]
                if item["total"] != calculated_total:
                    self.log_result(
                        "Workload endpoint (engineering user)",
                        False,
                        f"Total mismatch: expected {calculated_total}, got {item['total']}"
                    )
                    return False
                
                # Validate level logic
                expected_level = "overload" if item["total"] > 6 else ("busy" if item["total"] >= 4 else "normal")
                if item["level"] != expected_level:
                    self.log_result(
                        "Workload endpoint (engineering user)",
                        False,
                        f"Level mismatch for total={item['total']}: expected {expected_level}, got {item['level']}"
                    )
                    return False
            
            # Validate summary structure
            summary = data.get("summary", {})
            required_summary_fields = ["engineers", "total_active", "overload", "busy", "normal", "overdue"]
            missing_summary_fields = [f for f in required_summary_fields if f not in summary]
            if missing_summary_fields:
                self.log_result(
                    "Workload endpoint (engineering user)",
                    False,
                    f"Missing fields in summary: {missing_summary_fields}"
                )
                return False
            
            # Validate thresholds
            thresholds = data.get("thresholds", {})
            if "busy" not in thresholds or "overload" not in thresholds:
                self.log_result(
                    "Workload endpoint (engineering user)",
                    False,
                    "Missing threshold values"
                )
                return False
            
            # Validate items are sorted by total desc
            if len(items) > 1:
                for i in range(len(items) - 1):
                    if items[i]["total"] < items[i+1]["total"]:
                        self.log_result(
                            "Workload endpoint (engineering user)",
                            False,
                            "Items not sorted by total descending"
                        )
                        return False
            
            self.log_result(
                "Workload endpoint (engineering user)",
                True,
                f"Found {len(items)} engineers, total_active={summary.get('total_active')}, "
                f"overload={summary.get('overload')}, busy={summary.get('busy')}, normal={summary.get('normal')}"
            )
            return True
            
        except Exception as e:
            self.log_result(
                "Workload endpoint (engineering user)",
                False,
                f"Exception: {str(e)}"
            )
            return False

    def test_workload_endpoint_rbac(self):
        """Test GET /api/engineering/workload with non-engineering user (qcuser) - should be 403"""
        print("\n🔒 Testing workload endpoint RBAC with QC user...")
        
        # Logout current user and login as qcuser
        self.logout()
        if not self.login("qcuser", "QcMks2026"):
            self.log_result(
                "Workload endpoint RBAC (QC user)",
                False,
                "Failed to login as qcuser"
            )
            return False
        
        try:
            response = self.session.get(
                f"{self.base_url}/api/engineering/workload",
                timeout=10
            )
            
            if response.status_code == 403:
                self.log_result(
                    "Workload endpoint RBAC (QC user)",
                    True,
                    "Correctly returned 403 for non-engineering user"
                )
                return True
            else:
                self.log_result(
                    "Workload endpoint RBAC (QC user)",
                    False,
                    f"Expected 403, got {response.status_code}"
                )
                return False
                
        except Exception as e:
            self.log_result(
                "Workload endpoint RBAC (QC user)",
                False,
                f"Exception: {str(e)}"
            )
            return False

    # ========== REGRESSION TESTS ==========
    
    def test_ecn_sheet_endpoints(self):
        """Test ECN sheet endpoints (PDF, page-meta, page-image)"""
        print("\n📄 Testing ECN sheet endpoints...")
        
        # First, login as qcuser to get ECN pending drawings (endpoint requires QC/Production role)
        print("   Logging in as qcuser to access ECN pending drawings...")
        self.logout()
        if not self.login("qcuser", "QcMks2026"):
            self.log_result(
                "ECN sheet endpoints",
                False,
                "Failed to login as qcuser"
            )
            return False
        
        # Get a drawing with ECN using ecn-pending-ttd endpoint
        try:
            response = self.session.get(
                f"{self.base_url}/api/drawings/ecn-pending-ttd",
                timeout=10
            )
            
            if response.status_code != 200:
                self.log_result(
                    "ECN sheet endpoints",
                    False,
                    f"Failed to get ECN pending drawings: {response.status_code}"
                )
                return False
            
            data = response.json()
            items = data.get("items", [])
            
            if not items:
                self.log_result(
                    "ECN sheet endpoints",
                    True,
                    "No ECN pending drawings found (skipping ECN tests)"
                )
                return True
            
            # Use first drawing with ECN
            drawing_id = items[0].get("id")
            print(f"   Testing with drawing ID: {drawing_id}")
            
            # Test 1: GET ecn-sheet (PDF)
            response = self.session.get(
                f"{self.base_url}/api/drawings/{drawing_id}/ecn-sheet",
                timeout=10
            )
            
            if response.status_code != 200:
                self.log_result(
                    "ECN sheet PDF endpoint",
                    False,
                    f"Expected 200, got {response.status_code}"
                )
                return False
            
            if response.headers.get("content-type") != "application/pdf":
                self.log_result(
                    "ECN sheet PDF endpoint",
                    False,
                    f"Expected application/pdf, got {response.headers.get('content-type')}"
                )
                return False
            
            print("   ✓ ECN sheet PDF endpoint OK")
            
            # Test 2: GET ecn-sheet/page-meta
            response = self.session.get(
                f"{self.base_url}/api/drawings/{drawing_id}/ecn-sheet/page-meta",
                timeout=10
            )
            
            if response.status_code != 200:
                self.log_result(
                    "ECN sheet page-meta endpoint",
                    False,
                    f"Expected 200, got {response.status_code}"
                )
                return False
            
            meta = response.json()
            if "pages" not in meta:
                self.log_result(
                    "ECN sheet page-meta endpoint",
                    False,
                    "Missing 'pages' in response"
                )
                return False
            
            print(f"   ✓ ECN sheet page-meta OK (pages={meta.get('pages')})")
            
            # Test 3: GET ecn-sheet/page-image?page=0
            response = self.session.get(
                f"{self.base_url}/api/drawings/{drawing_id}/ecn-sheet/page-image?page=0",
                timeout=10
            )
            
            if response.status_code != 200:
                self.log_result(
                    "ECN sheet page-image endpoint",
                    False,
                    f"Expected 200, got {response.status_code}"
                )
                return False
            
            if not response.headers.get("content-type", "").startswith("image/"):
                self.log_result(
                    "ECN sheet page-image endpoint",
                    False,
                    f"Expected image/*, got {response.headers.get('content-type')}"
                )
                return False
            
            print("   ✓ ECN sheet page-image OK")
            
            self.log_result(
                "ECN sheet endpoints",
                True,
                "All ECN sheet endpoints working correctly"
            )
            return True
            
        except Exception as e:
            self.log_result(
                "ECN sheet endpoints",
                False,
                f"Exception: {str(e)}"
            )
            return False

    def test_page_meta_mks_files(self):
        """Test page-meta for MKS files (valid and invalid)"""
        print("\n📋 Testing page-meta for MKS files...")
        
        # Test with invalid MKS file (should return pages:0 with message)
        invalid_drawing_id = "bd2dc414-10d2-499c-b21f-05cc615170b0"
        
        try:
            response = self.session.get(
                f"{self.base_url}/api/drawings/{invalid_drawing_id}/page-meta?target=mks",
                timeout=10
            )
            
            if response.status_code != 200:
                self.log_result(
                    "Page-meta MKS (invalid file)",
                    False,
                    f"Expected 200, got {response.status_code}"
                )
                return False
            
            data = response.json()
            if data.get("pages") != 0:
                self.log_result(
                    "Page-meta MKS (invalid file)",
                    False,
                    f"Expected pages=0 for invalid file, got {data.get('pages')}"
                )
                return False
            
            if "message" not in data:
                self.log_result(
                    "Page-meta MKS (invalid file)",
                    False,
                    "Expected 'message' field for invalid file"
                )
                return False
            
            print(f"   ✓ Invalid MKS file: pages=0, message={data.get('message')[:50]}...")
            
        except Exception as e:
            self.log_result(
                "Page-meta MKS (invalid file)",
                False,
                f"Exception: {str(e)}"
            )
            return False
        
        # Test with valid MKS file (should return pages>0)
        valid_drawing_id = "8c57af85-84e8-4c72-baea-6a0e96274f45"
        
        try:
            response = self.session.get(
                f"{self.base_url}/api/drawings/{valid_drawing_id}/page-meta?target=mks",
                timeout=10
            )
            
            if response.status_code != 200:
                self.log_result(
                    "Page-meta MKS (valid file)",
                    False,
                    f"Expected 200, got {response.status_code}"
                )
                return False
            
            data = response.json()
            if data.get("pages", 0) <= 0:
                self.log_result(
                    "Page-meta MKS (valid file)",
                    False,
                    f"Expected pages>0 for valid file, got {data.get('pages')}"
                )
                return False
            
            print(f"   ✓ Valid MKS file: pages={data.get('pages')}")
            
            self.log_result(
                "Page-meta MKS files",
                True,
                "Both valid and invalid MKS file handling correct"
            )
            return True
            
        except Exception as e:
            self.log_result(
                "Page-meta MKS (valid file)",
                False,
                f"Exception: {str(e)}"
            )
            return False

    def test_pdf_stamped_endpoint(self):
        """Test pdf-stamped endpoint for both no-file and valid drawings"""
        print("\n🖨️ Testing pdf-stamped endpoint...")
        
        # Test with no-file drawing (placeholder)
        no_file_drawing_id = "bd2dc414-10d2-499c-b21f-05cc615170b0"
        
        try:
            response = self.session.get(
                f"{self.base_url}/api/drawings/{no_file_drawing_id}/pdf-stamped",
                timeout=10
            )
            
            if response.status_code != 200:
                self.log_result(
                    "PDF stamped (no-file drawing)",
                    False,
                    f"Expected 200, got {response.status_code}"
                )
                return False
            
            if response.headers.get("content-type") != "application/pdf":
                self.log_result(
                    "PDF stamped (no-file drawing)",
                    False,
                    f"Expected application/pdf, got {response.headers.get('content-type')}"
                )
                return False
            
            print("   ✓ No-file drawing: placeholder PDF returned")
            
        except Exception as e:
            self.log_result(
                "PDF stamped (no-file drawing)",
                False,
                f"Exception: {str(e)}"
            )
            return False
        
        # Test with valid drawing (stamped)
        valid_drawing_id = "8c57af85-84e8-4c72-baea-6a0e96274f45"
        
        try:
            response = self.session.get(
                f"{self.base_url}/api/drawings/{valid_drawing_id}/pdf-stamped",
                timeout=10
            )
            
            if response.status_code != 200:
                self.log_result(
                    "PDF stamped (valid drawing)",
                    False,
                    f"Expected 200, got {response.status_code}"
                )
                return False
            
            if response.headers.get("content-type") != "application/pdf":
                self.log_result(
                    "PDF stamped (valid drawing)",
                    False,
                    f"Expected application/pdf, got {response.headers.get('content-type')}"
                )
                return False
            
            print("   ✓ Valid drawing: stamped PDF returned")
            
            self.log_result(
                "PDF stamped endpoint",
                True,
                "Both placeholder and stamped PDFs working correctly"
            )
            return True
            
        except Exception as e:
            self.log_result(
                "PDF stamped (valid drawing)",
                False,
                f"Exception: {str(e)}"
            )
            return False

    def test_merged_queue_data_sources(self):
        """Test merged queue data sources (drawing-requests and inquiries)"""
        print("\n📊 Testing merged queue data sources...")
        
        # Test drawing-requests with scope=for_engineering
        try:
            response = self.session.get(
                f"{self.base_url}/api/drawing-requests?scope=for_engineering",
                timeout=10
            )
            
            if response.status_code != 200:
                self.log_result(
                    "Drawing requests (for_engineering)",
                    False,
                    f"Expected 200, got {response.status_code}"
                )
                return False
            
            data = response.json()
            if "items" not in data:
                self.log_result(
                    "Drawing requests (for_engineering)",
                    False,
                    "Missing 'items' in response"
                )
                return False
            
            print(f"   ✓ Drawing requests: {len(data.get('items', []))} items")
            
        except Exception as e:
            self.log_result(
                "Drawing requests (for_engineering)",
                False,
                f"Exception: {str(e)}"
            )
            return False
        
        # Test inquiries endpoint
        try:
            response = self.session.get(
                f"{self.base_url}/api/inquiries",
                timeout=10
            )
            
            if response.status_code != 200:
                self.log_result(
                    "Inquiries endpoint",
                    False,
                    f"Expected 200, got {response.status_code}"
                )
                return False
            
            data = response.json()
            if "items" not in data:
                self.log_result(
                    "Inquiries endpoint",
                    False,
                    "Missing 'items' in response"
                )
                return False
            
            # Check if items have required fields
            items = data.get("items", [])
            if items:
                item = items[0]
                required_fields = ["inquiry_no", "customer_name", "status"]
                missing_fields = [f for f in required_fields if f not in item]
                if missing_fields:
                    self.log_result(
                        "Inquiries endpoint",
                        False,
                        f"Missing fields in inquiry item: {missing_fields}"
                    )
                    return False
                
                # Check for assigned_to_name field (merged data)
                if "assigned_to_name" in item:
                    print(f"   ✓ Inquiries: {len(items)} items with merged data (assigned_to_name present)")
                else:
                    print(f"   ✓ Inquiries: {len(items)} items")
            else:
                print("   ✓ Inquiries: 0 items (empty but endpoint working)")
            
            self.log_result(
                "Merged queue data sources",
                True,
                "Both drawing-requests and inquiries endpoints working correctly"
            )
            return True
            
        except Exception as e:
            self.log_result(
                "Inquiries endpoint",
                False,
                f"Exception: {str(e)}"
            )
            return False

    def test_badge_endpoints(self):
        """Test badge endpoints for counts"""
        print("\n🔔 Testing badge endpoints...")
        
        # Test 1: my-queue
        try:
            response = self.session.get(
                f"{self.base_url}/api/drawing-requests/my-queue",
                timeout=10
            )
            
            if response.status_code != 200:
                self.log_result(
                    "Badge: my-queue",
                    False,
                    f"Expected 200, got {response.status_code}"
                )
                return False
            
            data = response.json()
            if "pending_count" not in data:
                self.log_result(
                    "Badge: my-queue",
                    False,
                    "Missing 'pending_count' in response"
                )
                return False
            
            print(f"   ✓ my-queue: pending_count={data.get('pending_count')}")
            
        except Exception as e:
            self.log_result(
                "Badge: my-queue",
                False,
                f"Exception: {str(e)}"
            )
            return False
        
        # Test 2: pending-count-for-engineering
        try:
            response = self.session.get(
                f"{self.base_url}/api/drawing-requests/pending-count-for-engineering",
                timeout=10
            )
            
            if response.status_code != 200:
                self.log_result(
                    "Badge: pending-count-for-engineering",
                    False,
                    f"Expected 200, got {response.status_code}"
                )
                return False
            
            data = response.json()
            if "count" not in data:
                self.log_result(
                    "Badge: pending-count-for-engineering",
                    False,
                    "Missing 'count' in response"
                )
                return False
            
            print(f"   ✓ pending-count-for-engineering: count={data.get('count')}")
            
        except Exception as e:
            self.log_result(
                "Badge: pending-count-for-engineering",
                False,
                f"Exception: {str(e)}"
            )
            return False
        
        # Test 3: inquiries/pending-count
        try:
            response = self.session.get(
                f"{self.base_url}/api/inquiries/pending-count",
                timeout=10
            )
            
            if response.status_code != 200:
                self.log_result(
                    "Badge: inquiries/pending-count",
                    False,
                    f"Expected 200, got {response.status_code}"
                )
                return False
            
            data = response.json()
            if "count" not in data:
                self.log_result(
                    "Badge: inquiries/pending-count",
                    False,
                    "Missing 'count' in response"
                )
                return False
            
            print(f"   ✓ inquiries/pending-count: count={data.get('count')}")
            
            self.log_result(
                "Badge endpoints",
                True,
                "All badge endpoints working correctly"
            )
            return True
            
        except Exception as e:
            self.log_result(
                "Badge: inquiries/pending-count",
                False,
                f"Exception: {str(e)}"
            )
            return False

    def run_all_tests(self):
        """Run all tests"""
        print("=" * 80)
        print("BACKEND API TESTING: Engineering Workload & Regression Tests")
        print("=" * 80)
        
        # Login as engineering user (riski)
        if not self.login("riski", "eng123"):
            print("\n❌ Failed to login as riski. Cannot proceed with tests.")
            return False
        
        # NEW FEATURE TESTS
        print("\n" + "=" * 80)
        print("NEW FEATURE TESTS")
        print("=" * 80)
        
        self.test_workload_endpoint_engineering()
        self.test_workload_endpoint_rbac()
        
        # Re-login as riski for regression tests
        self.logout()
        if not self.login("riski", "eng123"):
            print("\n❌ Failed to re-login as riski. Skipping regression tests.")
        else:
            # REGRESSION TESTS
            print("\n" + "=" * 80)
            print("REGRESSION TESTS")
            print("=" * 80)
            
            self.test_ecn_sheet_endpoints()
            self.test_page_meta_mks_files()
            self.test_pdf_stamped_endpoint()
            self.test_merged_queue_data_sources()
            self.test_badge_endpoints()
        
        # Print summary
        print("\n" + "=" * 80)
        print("TEST SUMMARY")
        print("=" * 80)
        print(f"Total tests run: {self.tests_run}")
        print(f"Tests passed: {self.tests_passed}")
        print(f"Tests failed: {self.tests_run - self.tests_passed}")
        print(f"Success rate: {(self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0:.1f}%")
        
        # Print failed tests
        failed_tests = [r for r in self.test_results if not r["passed"]]
        if failed_tests:
            print("\n❌ FAILED TESTS:")
            for test in failed_tests:
                print(f"  - {test['test']}")
                if test['details']:
                    print(f"    {test['details']}")
        
        return self.tests_passed == self.tests_run

def main():
    tester = WorkloadRegressionTester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
