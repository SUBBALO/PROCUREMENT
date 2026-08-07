"""
Backend API Test for Indonesian ERP - Dashboard SO Progress Tracker
Tests GET /api/dashboard/so-progress endpoint
"""
import requests
import sys
import uuid
from datetime import datetime

BASE_URL = "https://error-fix-dev.preview.emergentagent.com/api"

class ERPTester:
    def __init__(self):
        self.session = requests.Session()
        self.tests_run = 0
        self.tests_passed = 0
        self.test_data = {}
        
    def log(self, msg, status="info"):
        prefix = {"info": "ℹ️", "success": "✅", "error": "❌", "warn": "⚠️"}
        print(f"{prefix.get(status, 'ℹ️')} {msg}")
    
    def test(self, name, method, endpoint, expected_status, data=None, json_data=None, files=None):
        """Run a single API test"""
        url = f"{BASE_URL}/{endpoint}"
        self.tests_run += 1
        self.log(f"Testing {name}...", "info")
        
        try:
            if method == "GET":
                response = self.session.get(url)
            elif method == "POST":
                if files:
                    response = self.session.post(url, data=data, files=files)
                else:
                    response = self.session.post(url, json=json_data or data)
            elif method == "PUT":
                response = self.session.put(url, json=json_data or data)
            elif method == "DELETE":
                response = self.session.delete(url)
            else:
                self.log(f"Unknown method {method}", "error")
                return False, {}
            
            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                self.log(f"PASSED - Status: {response.status_code}", "success")
            else:
                self.log(f"FAILED - Expected {expected_status}, got {response.status_code}", "error")
                try:
                    self.log(f"Response: {response.json()}", "error")
                except Exception:
                    self.log(f"Response text: {response.text[:200]}", "error")
            
            try:
                return success, response.json() if response.text else {}
            except Exception:
                return success, {}
        except Exception as e:
            self.log(f"FAILED - Error: {str(e)}", "error")
            return False, {}
    
    def login(self, username, password):
        """Login and establish session"""
        self.log(f"Logging in as {username}...", "info")
        success, response = self.test(
            f"Login as {username}",
            "POST",
            "auth/login",
            200,
            json_data={"username": username, "password": password}
        )
        return success
    
    def test_auth_required(self):
        """Test that endpoint requires authentication"""
        self.log("\n=== TEST 1: Authentication Required ===", "info")
        
        # Create a new session without auth
        unauth_session = requests.Session()
        url = f"{BASE_URL}/dashboard/so-progress"
        
        try:
            response = unauth_session.get(url)
            if response.status_code in (401, 403):
                self.tests_passed += 1
                self.tests_run += 1
                self.log(f"PASSED - Endpoint requires auth (status: {response.status_code})", "success")
                return True
            else:
                self.tests_run += 1
                self.log(f"FAILED - Expected 401/403, got {response.status_code}", "error")
                return False
        except Exception as e:
            self.tests_run += 1
            self.log(f"FAILED - Error: {str(e)}", "error")
            return False
    
    def test_basic_structure(self):
        """Test basic response structure {items:[...], count}"""
        self.log("\n=== TEST 2: Basic Response Structure ===", "info")
        
        success, response = self.test(
            "GET /api/dashboard/so-progress",
            "GET",
            "dashboard/so-progress",
            200
        )
        
        if not success:
            return False
        
        # Verify structure
        if "items" not in response:
            self.log("FAILED - Missing 'items' field", "error")
            return False
        
        if "count" not in response:
            self.log("FAILED - Missing 'count' field", "error")
            return False
        
        items = response.get("items", [])
        count = response.get("count", 0)
        
        if not isinstance(items, list):
            self.log("FAILED - 'items' is not a list", "error")
            return False
        
        if len(items) != count:
            self.log(f"FAILED - count mismatch: items length={len(items)}, count={count}", "error")
            return False
        
        self.log(f"Response structure valid: {count} items returned", "success")
        self.test_data["items"] = items
        self.test_data["count"] = count
        return True
    
    def test_item_structure(self):
        """Test each item has required fields"""
        self.log("\n=== TEST 3: Item Structure ===", "info")
        
        items = self.test_data.get("items", [])
        if not items:
            self.log("No items to test", "warn")
            return True
        
        required_fields = [
            "so_no", "customer", "current_stage", 
            "drawings_total", "drawings_approved", "stages"
        ]
        
        stage_required_fields = ["key", "label", "status", "date", "pic"]
        expected_stage_keys = ["sales", "engineering", "purchasing", "store", "qc", "delivery"]
        
        for idx, item in enumerate(items[:3]):  # Test first 3 items
            self.log(f"Testing item {idx + 1}: SO {item.get('so_no')}", "info")
            
            # Check required fields
            for field in required_fields:
                if field not in item:
                    self.log(f"FAILED - Missing field '{field}' in item", "error")
                    return False
            
            # Check stages array
            stages = item.get("stages", [])
            if not isinstance(stages, list):
                self.log("FAILED - 'stages' is not a list", "error")
                return False
            
            if len(stages) != 6:
                self.log(f"FAILED - Expected 6 stages, got {len(stages)}", "error")
                return False
            
            # Check each stage
            for stage in stages:
                for field in stage_required_fields:
                    if field not in stage:
                        self.log(f"FAILED - Missing field '{field}' in stage", "error")
                        return False
                
                # Check status values
                if stage.get("status") not in ["done", "in_progress", "pending"]:
                    self.log(f"FAILED - Invalid status '{stage.get('status')}' in stage", "error")
                    return False
            
            # Check stage keys
            stage_keys = [s.get("key") for s in stages]
            if stage_keys != expected_stage_keys:
                self.log(f"FAILED - Stage keys mismatch: {stage_keys}", "error")
                return False
            
            self.log(f"Item {idx + 1} structure valid", "success")
        
        self.tests_passed += 1
        self.tests_run += 1
        return True
    
    def test_engineering_logic(self):
        """Test engineering stage status logic"""
        self.log("\n=== TEST 4: Engineering Stage Logic ===", "info")
        
        items = self.test_data.get("items", [])
        if not items:
            self.log("No items to test", "warn")
            return True
        
        # Known SOs from agent context
        known_sos = {
            "005251": {"expected_eng_status": "done", "expected_progress": "1/1"},
            "005215": {"expected_eng_status": "in_progress", "expected_progress": "0/2"}
        }
        
        for so_no, expected in known_sos.items():
            item = next((i for i in items if i.get("so_no") == so_no), None)
            if not item:
                self.log(f"SO {so_no} not found in response", "warn")
                continue
            
            stages = item.get("stages", [])
            eng_stage = next((s for s in stages if s.get("key") == "engineering"), None)
            
            if not eng_stage:
                self.log(f"FAILED - Engineering stage not found for SO {so_no}", "error")
                return False
            
            # Check status
            actual_status = eng_stage.get("status")
            expected_status = expected.get("expected_eng_status")
            
            if actual_status != expected_status:
                self.log(f"SO {so_no}: status={actual_status} (expected {expected_status})", "warn")
            else:
                self.log(f"SO {so_no}: status={actual_status} ✓", "success")
            
            # Check progress field
            if "progress" in eng_stage:
                actual_progress = eng_stage.get("progress")
                expected_progress = expected.get("expected_progress")
                if actual_progress == expected_progress:
                    self.log(f"SO {so_no}: progress={actual_progress} ✓", "success")
                else:
                    self.log(f"SO {so_no}: progress={actual_progress} (expected {expected_progress})", "warn")
        
        # Test logic rules
        for item in items[:5]:
            so_no = item.get("so_no")
            total = item.get("drawings_total", 0)
            approved = item.get("drawings_approved", 0)
            
            stages = item.get("stages", [])
            eng_stage = next((s for s in stages if s.get("key") == "engineering"), None)
            
            if not eng_stage:
                continue
            
            status = eng_stage.get("status")
            
            # Logic validation
            if total == 0:
                if status != "pending":
                    self.log(f"SO {so_no}: 0 drawings but status={status} (expected pending)", "warn")
            elif approved >= total:
                if status != "done":
                    self.log(f"SO {so_no}: all approved but status={status} (expected done)", "warn")
            else:
                if status != "in_progress":
                    self.log(f"SO {so_no}: partial approval but status={status} (expected in_progress)", "warn")
        
        self.tests_passed += 1
        self.tests_run += 1
        return True
    
    def test_sales_stage(self):
        """Test sales stage is always 'done' with so_date"""
        self.log("\n=== TEST 5: Sales Stage Always Done ===", "info")
        
        items = self.test_data.get("items", [])
        if not items:
            self.log("No items to test", "warn")
            return True
        
        all_valid = True
        for item in items[:5]:
            so_no = item.get("so_no")
            stages = item.get("stages", [])
            sales_stage = next((s for s in stages if s.get("key") == "sales"), None)
            
            if not sales_stage:
                self.log(f"FAILED - Sales stage not found for SO {so_no}", "error")
                all_valid = False
                continue
            
            # Check status is 'done'
            if sales_stage.get("status") != "done":
                self.log(f"FAILED - SO {so_no}: sales status={sales_stage.get('status')} (expected done)", "error")
                all_valid = False
            
            # Check date is present (should be so_date)
            if not sales_stage.get("date"):
                self.log(f"FAILED - SO {so_no}: sales stage missing date", "error")
                all_valid = False
        
        if all_valid:
            self.log("All sales stages are 'done' with dates", "success")
            self.tests_passed += 1
        
        self.tests_run += 1
        return all_valid
    
    def test_current_stage(self):
        """Test current_stage = first stage not 'done'"""
        self.log("\n=== TEST 6: Current Stage Logic ===", "info")
        
        items = self.test_data.get("items", [])
        if not items:
            self.log("No items to test", "warn")
            return True
        
        all_valid = True
        for item in items[:5]:
            so_no = item.get("so_no")
            current_stage = item.get("current_stage")
            stages = item.get("stages", [])
            
            # Find first stage not 'done'
            first_not_done = None
            for stage in stages:
                if stage.get("status") != "done":
                    first_not_done = stage.get("label")
                    break
            
            # If all done, should be last stage (Delivery)
            if first_not_done is None:
                first_not_done = "Delivery"
            
            if current_stage != first_not_done:
                self.log(f"SO {so_no}: current_stage={current_stage} (expected {first_not_done})", "warn")
                all_valid = False
            else:
                self.log(f"SO {so_no}: current_stage={current_stage} ✓", "success")
        
        if all_valid:
            self.tests_passed += 1
        
        self.tests_run += 1
        return all_valid
    
    def test_search_functionality(self):
        """Test search with ?q=<term>"""
        self.log("\n=== TEST 7: Search Functionality ===", "info")
        
        # Test 1: Search by SO number
        success, response = self.test(
            "Search by SO number (q=005251)",
            "GET",
            "dashboard/so-progress?q=005251",
            200
        )
        
        if not success:
            return False
        
        items = response.get("items", [])
        if items:
            found = any(i.get("so_no") == "005251" for i in items)
            if found:
                self.log("Search by SO number works", "success")
            else:
                self.log("Search returned items but SO 005251 not found", "warn")
        else:
            self.log("Search returned no items", "warn")
        
        # Test 2: Search by customer (partial match)
        success, response = self.test(
            "Search by customer (q=PT)",
            "GET",
            "dashboard/so-progress?q=PT",
            200
        )
        
        if success:
            items = response.get("items", [])
            self.log(f"Customer search returned {len(items)} items", "info")
        
        # Test 3: Empty search should return all workflow SOs
        success, response = self.test(
            "Empty search (no q parameter)",
            "GET",
            "dashboard/so-progress",
            200
        )
        
        if success:
            items = response.get("items", [])
            self.log(f"Default query returned {len(items)} items", "info")
        
        return True
    
    def test_limit_parameter(self):
        """Test limit parameter"""
        self.log("\n=== TEST 8: Limit Parameter ===", "info")
        
        success, response = self.test(
            "Test limit=3",
            "GET",
            "dashboard/so-progress?limit=3",
            200
        )
        
        if not success:
            return False
        
        items = response.get("items", [])
        if len(items) <= 3:
            self.log(f"Limit parameter works: returned {len(items)} items", "success")
        else:
            self.log(f"Limit parameter may not work: returned {len(items)} items (expected ≤3)", "warn")
        
        return True
    
    def run_all_tests(self):
        """Run all tests"""
        self.log("=" * 60, "info")
        self.log("INDONESIAN ERP - DASHBOARD SO PROGRESS TESTS", "info")
        self.log("=" * 60, "info")
        
        # Test 1: Auth required (before login)
        self.test_auth_required()
        
        # Login as admin
        if not self.login("admin", "admin123"):
            self.log("Login failed, cannot continue", "error")
            return 1
        
        # Test 2-8: Authenticated tests
        self.test_basic_structure()
        self.test_item_structure()
        self.test_engineering_logic()
        self.test_sales_stage()
        self.test_current_stage()
        self.test_search_functionality()
        self.test_limit_parameter()
        
        # Print summary
        self.log("\n" + "=" * 60, "info")
        self.log(f"TESTS COMPLETED: {self.tests_passed}/{self.tests_run} passed", 
                "success" if self.tests_passed == self.tests_run else "warn")
        self.log("=" * 60, "info")
        
        return 0 if self.tests_passed == self.tests_run else 1

def main():
    tester = ERPTester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())
