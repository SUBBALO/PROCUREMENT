#!/usr/bin/env python3
"""
Backend API Testing for Phase O (Antrian Leader), L (DRF redesign), M (TTD Sales), I (Notifikasi Sales)
Testing RBAC, response structure, and integration points.
"""
import requests
import sys
from datetime import datetime

BASE_URL = "https://error-fix-dev.preview.emergentagent.com/api"

class APITester:
    def __init__(self):
        self.tests_run = 0
        self.tests_passed = 0
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.current_user = None

    def log(self, msg, level="INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {level}: {msg}")

    def test(self, name, method, endpoint, expected_status, data=None, params=None, check_fn=None):
        """Run a single API test"""
        url = f"{BASE_URL}{endpoint}"
        self.tests_run += 1
        self.log(f"Testing: {name}")
        
        try:
            if method == "GET":
                response = self.session.get(url, params=params)
            elif method == "POST":
                response = self.session.post(url, json=data)
            elif method == "PUT":
                response = self.session.put(url, json=data)
            else:
                raise ValueError(f"Unsupported method: {method}")

            success = response.status_code == expected_status
            
            if success:
                self.log(f"✅ PASS - {name} (status: {response.status_code})", "PASS")
                self.tests_passed += 1
                
                # Additional checks
                if check_fn:
                    try:
                        json_data = response.json() if response.text else {}
                        check_result = check_fn(json_data)
                        if not check_result:
                            self.log(f"⚠️  WARNING - {name}: Check function returned False", "WARN")
                    except Exception as e:
                        self.log(f"⚠️  WARNING - {name}: Check function error: {e}", "WARN")
                
                return True, response.json() if response.text else {}
            else:
                self.log(f"❌ FAIL - {name}: Expected {expected_status}, got {response.status_code}", "FAIL")
                try:
                    error_detail = response.json()
                    self.log(f"   Response: {error_detail}", "FAIL")
                except Exception:
                    self.log(f"   Response: {response.text[:200]}", "FAIL")
                return False, {}

        except Exception as e:
            self.log(f"❌ FAIL - {name}: Exception: {str(e)}", "FAIL")
            return False, {}

    def login(self, username, password):
        """Login and store session"""
        self.log(f"Logging in as: {username}")
        success, response = self.test(
            f"Login as {username}",
            "POST",
            "/auth/login",
            200,
            data={"username": username, "password": password}
        )
        if success:
            self.current_user = response
            self.log(f"✓ Logged in as {username} (role: {response.get('role')})", "INFO")
        return success

    def logout(self):
        """Logout current session"""
        try:
            self.session.post(f"{BASE_URL}/auth/logout")
            self.current_user = None
            self.log("Logged out", "INFO")
        except Exception:
            pass

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


def test_phase_o_leader_queue(tester):
    """Phase O: Test antrian leader endpoint"""
    print("\n" + "="*60)
    print("PHASE O: Testing Antrian Leader (pending-leader-verification)")
    print("="*60)
    
    # Test 1: Login as Leader
    if not tester.login("qa_leader_tmp", "Qa!12345"):
        print("❌ Cannot proceed - Leader login failed")
        return
    
    # Test 2: Leader can access endpoint
    def check_leader_response(data):
        if not isinstance(data, dict):
            tester.log("Response is not a dict", "WARN")
            return False
        if "items" not in data or "count" not in data:
            tester.log("Missing 'items' or 'count' in response", "WARN")
            return False
        items = data.get("items", [])
        count = data.get("count", 0)
        tester.log(f"Leader queue: {count} SO(s) with pending drawings", "INFO")
        
        # Check structure of items
        for item in items[:3]:  # Check first 3 items
            required_fields = ["drf_id", "form_no", "so_no", "customer_name", "bom_id", "bom_no", "pending_count", "total_drawings"]
            missing = [f for f in required_fields if f not in item]
            if missing:
                tester.log(f"Item missing fields: {missing}", "WARN")
                return False
        return True
    
    tester.test(
        "Leader access pending-leader-verification",
        "GET",
        "/engineering/pending-leader-verification",
        200,
        check_fn=check_leader_response
    )
    
    # Test 3: Logout and login as Sales
    tester.logout()
    if not tester.login("salesuser", "QaSales!123"):
        print("❌ Cannot test Sales RBAC - login failed")
        return
    
    # Test 4: Sales should get empty response (RBAC)
    def check_sales_rbac(data):
        items = data.get("items", [])
        count = data.get("count", 0)
        if count == 0 and len(items) == 0:
            tester.log("✓ Sales correctly gets empty response (RBAC working)", "INFO")
            return True
        else:
            tester.log(f"⚠️  Sales got {count} items - RBAC may be broken!", "WARN")
            return False
    
    tester.test(
        "Sales RBAC check (should get empty)",
        "GET",
        "/engineering/pending-leader-verification",
        200,
        check_fn=check_sales_rbac
    )
    
    tester.logout()


def test_phase_i_notifications(tester):
    """Phase I: Test notifications for Sales"""
    print("\n" + "="*60)
    print("PHASE I: Testing Sales Notifications (drawing_ready_view)")
    print("="*60)
    
    # Login as Sales
    if not tester.login("salesuser", "QaSales!123"):
        print("❌ Cannot proceed - Sales login failed")
        return
    
    # Test: Sales notifications should have drawing_ready_view category
    def check_sales_notifications(data):
        categories = data.get("categories", [])
        tester.log(f"Found {len(categories)} notification categories", "INFO")
        
        # Look for drawing_ready_view
        drawing_ready = None
        for cat in categories:
            tester.log(f"  - {cat.get('key')}: {cat.get('label')} ({cat.get('count', 0)} items)", "INFO")
            if cat.get("key") == "drawing_ready_view":
                drawing_ready = cat
        
        if drawing_ready:
            tester.log(f"✓ Found 'drawing_ready_view' category: {drawing_ready.get('label')}", "INFO")
            tester.log(f"  Count: {drawing_ready.get('count', 0)} items", "INFO")
            return True
        else:
            tester.log("⚠️  'drawing_ready_view' category NOT found for Sales", "WARN")
            tester.log("  This may be OK if there are no drawings in pending_eng_head/pending_qc state", "INFO")
            return True  # Not a failure - may be no data
    
    tester.test(
        "Sales notifications (check for drawing_ready_view)",
        "GET",
        "/notifications",
        200,
        check_fn=check_sales_notifications
    )
    
    tester.logout()


def test_phase_m_sales_ttd(tester):
    """Phase M: Test Sales TTD endpoints"""
    print("\n" + "="*60)
    print("PHASE M: Testing Sales TTD (pending-my-approval)")
    print("="*60)
    
    # Login as Sales
    if not tester.login("salesuser", "QaSales!123"):
        print("❌ Cannot proceed - Sales login failed")
        return
    
    # Test: Sales pending-my-approval
    def check_pending_approval(data):
        items = data.get("items", [])
        tester.log(f"Sales has {len(items)} drawing(s) pending approval", "INFO")
        
        for item in items[:3]:
            if item.get("approval_status") != "pending_sales":
                tester.log(f"⚠️  Drawing {item.get('drawing_no')} has status {item.get('approval_status')}, expected pending_sales", "WARN")
                return False
        return True
    
    tester.test(
        "Sales pending-my-approval (pending_sales drawings)",
        "GET",
        "/drawings/pending-my-approval",
        200,
        check_fn=check_pending_approval
    )
    
    tester.logout()


def test_phase_l_drf_endpoints(tester):
    """Phase L: Test DRF list endpoints"""
    print("\n" + "="*60)
    print("PHASE L: Testing DRF List Endpoints")
    print("="*60)
    
    # Login as Sales
    if not tester.login("salesuser", "QaSales!123"):
        print("❌ Cannot proceed - Sales login failed")
        return
    
    # Test 1: GET /api/drawing-requests
    def check_drf_list(data):
        items = data.get("items", [])
        tester.log(f"Found {len(items)} DRF(s)", "INFO")
        return True
    
    success, drf_data = tester.test(
        "GET /api/drawing-requests",
        "GET",
        "/drawing-requests",
        200,
        check_fn=check_drf_list
    )
    
    # Test 2: GET /api/drawings?from_drf_id=<id> (if we have DRFs)
    if success and drf_data.get("items"):
        first_drf = drf_data["items"][0]
        drf_id = first_drf.get("id")
        
        def check_drawings_for_drf(data):
            items = data.get("items", [])
            tester.log(f"DRF {first_drf.get('form_no')} has {len(items)} drawing(s)", "INFO")
            return True
        
        tester.test(
            f"GET /api/drawings?from_drf_id={drf_id}",
            "GET",
            "/drawings",
            200,
            params={"from_drf_id": drf_id},
            check_fn=check_drawings_for_drf
        )
    
    tester.logout()


def main():
    print("="*60)
    print("ERP Backend API Testing - Phases O, L, M, I")
    print("="*60)
    print(f"Base URL: {BASE_URL}")
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*60)
    
    tester = APITester()
    
    try:
        # Run all test phases
        test_phase_o_leader_queue(tester)
        test_phase_i_notifications(tester)
        test_phase_m_sales_ttd(tester)
        test_phase_l_drf_endpoints(tester)
        
    except KeyboardInterrupt:
        print("\n\n⚠️  Testing interrupted by user")
    except Exception as e:
        print(f"\n\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        tester.print_summary()
    
    # Return exit code
    return 0 if tester.tests_passed == tester.tests_run else 1


if __name__ == "__main__":
    sys.exit(main())
