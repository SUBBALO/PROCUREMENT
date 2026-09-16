"""
Backend API Tests for Finance Daily Production Feature (Iteration 62)

Tests:
1. Finance endpoints (GET/PUT employee-rates, GET daily-production)
2. Security: production endpoints must NOT leak rate/cost fields
3. Cost calculation: rate × hours = cost (rounded)
4. Access control: Finance/Admin can access, Production role gets 403
"""
import requests
import sys
from datetime import datetime

BASE_URL = "https://error-fix-dev.preview.emergentagent.com/api"

class FinanceDailyProductionTester:
    def __init__(self):
        self.tests_run = 0
        self.tests_passed = 0
        self.sessions = {}
        self.test_data = {}
        
    def log(self, msg, status="info"):
        prefix = {
            "pass": "✅",
            "fail": "❌",
            "info": "🔍",
            "warn": "⚠️"
        }.get(status, "ℹ️")
        print(f"{prefix} {msg}")
    
    def run_test(self, name, method, endpoint, expected_status, data=None, session=None, params=None):
        """Run a single API test"""
        url = f"{BASE_URL}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        if session is None:
            session = requests.Session()
        
        self.tests_run += 1
        self.log(f"Testing {name}...", "info")
        
        try:
            if method == 'GET':
                response = session.get(url, headers=headers, params=params, timeout=15)
            elif method == 'POST':
                response = session.post(url, json=data, headers=headers, timeout=15)
            elif method == 'PUT':
                response = session.put(url, json=data, headers=headers, timeout=15)
            
            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                self.log(f"PASSED - Status: {response.status_code}", "pass")
                try:
                    return True, response.json()
                except Exception:
                    return True, {}
            else:
                self.log(f"FAILED - Expected {expected_status}, got {response.status_code}", "fail")
                try:
                    error_detail = response.json()
                    self.log(f"Response: {error_detail}", "fail")
                except Exception:
                    self.log(f"Response text: {response.text[:300]}", "fail")
                return False, {}
        
        except Exception as e:
            self.log(f"FAILED - Error: {str(e)}", "fail")
            return False, {}
    
    def login(self, username, password):
        """Login and create session"""
        self.log(f"Logging in as {username}...", "info")
        session = requests.Session()
        
        success, response = self.run_test(
            f"Login as {username}",
            "POST",
            "auth/login",
            200,
            data={"username": username, "password": password},
            session=session
        )
        if success and response.get('username') == username:
            self.sessions[username] = session
            self.log(f"Login successful for {username} (role: {response.get('role')})", "pass")
            return True, response
        self.log(f"Login failed for {username}", "fail")
        return False, {}
    
    def test_finance_employee_rates_get(self):
        """Test GET /api/finance/employee-rates (Finance/Admin only)"""
        self.log("\n=== Testing GET /api/finance/employee-rates ===", "info")
        
        # Test with admin user
        admin_session = self.sessions.get('admin')
        success, response = self.run_test(
            "GET employee-rates as admin",
            "GET",
            "finance/employee-rates",
            200,
            session=admin_session
        )
        
        if success:
            items = response.get('items', [])
            self.log(f"Found {len(items)} employees", "info")
            if len(items) > 0:
                # Store first employee for rate update test
                self.test_data['test_employee'] = items[0]
                emp = items[0]
                self.log(f"Sample employee: {emp.get('name')} (ID: {emp.get('employee_id')}, Rate: {emp.get('rate_per_hour')})", "info")
                
                # Verify structure
                required_fields = ['employee_id', 'name', 'designation', 'rate_per_hour']
                for field in required_fields:
                    if field not in emp:
                        self.log(f"Missing field '{field}' in employee data", "fail")
                        return False
            else:
                self.log("No employees found - may need to seed production_employees collection", "warn")
        
        return success
    
    def test_finance_employee_rates_403_production(self):
        """Test GET /api/finance/employee-rates returns 403 for production role"""
        self.log("\n=== Testing GET /api/finance/employee-rates (403 for production) ===", "info")
        
        # Try to find a production user
        prod_session = self.sessions.get('production_user')
        if not prod_session:
            self.log("No production user session found - skipping 403 test", "warn")
            return True
        
        success, response = self.run_test(
            "GET employee-rates as production (expect 403)",
            "GET",
            "finance/employee-rates",
            403,
            session=prod_session
        )
        
        return success
    
    def test_finance_employee_rates_put(self):
        """Test PUT /api/finance/employee-rates/{employee_id} sets rate"""
        self.log("\n=== Testing PUT /api/finance/employee-rates/{employee_id} ===", "info")
        
        test_emp = self.test_data.get('test_employee')
        if not test_emp:
            self.log("No test employee available - skipping PUT test", "warn")
            return True
        
        employee_id = test_emp.get('employee_id')
        test_rate = 50000.0
        
        admin_session = self.sessions.get('admin')
        success, response = self.run_test(
            f"PUT employee-rates/{employee_id} (rate={test_rate})",
            "PUT",
            f"finance/employee-rates/{employee_id}",
            200,
            data={"rate_per_hour": test_rate},
            session=admin_session
        )
        
        if success:
            returned_rate = response.get('rate_per_hour')
            if returned_rate == test_rate:
                self.log(f"Rate set successfully: {returned_rate}", "pass")
                self.test_data['test_rate'] = test_rate
            else:
                self.log(f"Rate mismatch: expected {test_rate}, got {returned_rate}", "fail")
                return False
        
        return success
    
    def test_finance_employee_rates_put_403_production(self):
        """Test PUT /api/finance/employee-rates/{employee_id} returns 403 for production"""
        self.log("\n=== Testing PUT /api/finance/employee-rates (403 for production) ===", "info")
        
        test_emp = self.test_data.get('test_employee')
        prod_session = self.sessions.get('production_user')
        
        if not test_emp or not prod_session:
            self.log("No test employee or production session - skipping 403 test", "warn")
            return True
        
        employee_id = test_emp.get('employee_id')
        success, response = self.run_test(
            f"PUT employee-rates/{employee_id} as production (expect 403)",
            "PUT",
            f"finance/employee-rates/{employee_id}",
            403,
            data={"rate_per_hour": 60000},
            session=prod_session
        )
        
        return success
    
    def test_finance_employee_rates_put_404(self):
        """Test PUT /api/finance/employee-rates/{employee_id} returns 404 for unknown employee"""
        self.log("\n=== Testing PUT /api/finance/employee-rates (404 for unknown employee) ===", "info")
        
        admin_session = self.sessions.get('admin')
        fake_id = "nonexistent-employee-id-12345"
        
        success, response = self.run_test(
            f"PUT employee-rates/{fake_id} (expect 404)",
            "PUT",
            f"finance/employee-rates/{fake_id}",
            404,
            data={"rate_per_hour": 50000},
            session=admin_session
        )
        
        return success
    
    def test_finance_daily_production_get(self):
        """Test GET /api/finance/daily-production returns items with rate_per_hour and cost"""
        self.log("\n=== Testing GET /api/finance/daily-production ===", "info")
        
        admin_session = self.sessions.get('admin')
        
        # Test with month filter (Aug 2026)
        success, response = self.run_test(
            "GET daily-production (month=2026-08)",
            "GET",
            "finance/daily-production",
            200,
            params={"month": "2026-08"},
            session=admin_session
        )
        
        if success:
            items = response.get('items', [])
            total_hours = response.get('total_hours', 0)
            total_cost = response.get('total_cost', 0)
            summary_operator = response.get('summary_operator', [])
            summary_date = response.get('summary_date', [])
            
            self.log(f"Found {len(items)} production report items", "info")
            self.log(f"Total hours: {total_hours}, Total cost: {total_cost}", "info")
            self.log(f"Summary by operator: {len(summary_operator)} operators", "info")
            self.log(f"Summary by date: {len(summary_date)} dates", "info")
            
            if len(items) > 0:
                # Verify structure and cost calculation
                sample = items[0]
                self.log(f"Sample item: operator={sample.get('operator_name')}, hours={sample.get('work_hours')}, rate={sample.get('rate_per_hour')}, cost={sample.get('cost')}", "info")
                
                # Check required fields
                required_fields = ['id', 'report_date', 'operator_name', 'work_hours', 'rate_per_hour', 'cost']
                for field in required_fields:
                    if field not in sample:
                        self.log(f"Missing field '{field}' in daily-production item", "fail")
                        return False
                
                # Verify cost calculation: cost = round(work_hours * rate_per_hour)
                work_hours = sample.get('work_hours', 0)
                rate = sample.get('rate_per_hour', 0)
                cost = sample.get('cost', 0)
                expected_cost = round(work_hours * rate)
                
                if cost == expected_cost:
                    self.log(f"Cost calculation correct: {work_hours} × {rate} = {cost}", "pass")
                else:
                    self.log(f"Cost calculation WRONG: {work_hours} × {rate} should be {expected_cost}, got {cost}", "fail")
                    return False
            else:
                self.log("No production reports found for Aug 2026 - may need test data", "warn")
        
        return success
    
    def test_finance_daily_production_403_production(self):
        """Test GET /api/finance/daily-production returns 403 for production role"""
        self.log("\n=== Testing GET /api/finance/daily-production (403 for production) ===", "info")
        
        prod_session = self.sessions.get('production_user')
        if not prod_session:
            self.log("No production user session - skipping 403 test", "warn")
            return True
        
        success, response = self.run_test(
            "GET daily-production as production (expect 403)",
            "GET",
            "finance/daily-production",
            403,
            session=prod_session
        )
        
        return success
    
    def test_production_endpoints_no_rate_leak(self):
        """Test production endpoints do NOT expose rate_per_hour or cost fields"""
        self.log("\n=== Testing Production Endpoints (NO rate/cost leak) ===", "info")
        
        admin_session = self.sessions.get('admin')
        
        # Test GET /api/production/reports/masterlist
        success, response = self.run_test(
            "GET production/reports/masterlist (check no rate leak)",
            "GET",
            "production/reports/masterlist",
            200,
            params={"month": "2026-08"},
            session=admin_session
        )
        
        if success:
            items = response.get('items', [])
            if len(items) > 0:
                sample = items[0]
                # These fields should NOT be present
                forbidden_fields = ['rate_per_hour', 'cost']
                for field in forbidden_fields:
                    if field in sample:
                        self.log(f"SECURITY ISSUE: Production endpoint leaking '{field}' field!", "fail")
                        return False
                self.log("Production endpoint does NOT leak rate/cost - SECURE", "pass")
            else:
                self.log("No production reports found - cannot verify security", "warn")
        
        return success
    
    def run_all_tests(self):
        """Run all finance feature tests"""
        self.log("\n" + "="*60, "info")
        self.log("FINANCE DAILY PRODUCTION FEATURE TESTS (Iteration 62)", "info")
        self.log("="*60 + "\n", "info")
        
        # Login users
        self.log("=== Logging in test users ===", "info")
        admin_ok, admin_data = self.login("admin", "admin123")
        if not admin_ok:
            self.log("Failed to login as admin - cannot continue", "fail")
            return False
        
        # Try to login as a production user (check if exists)
        # Common production usernames: prodstaff, agus, or check users with role production/produksi
        prod_usernames = ["prodstaff", "agus", "production"]
        prod_logged_in = False
        for username in prod_usernames:
            prod_ok, prod_data = self.login(username, "prod123")
            if prod_ok:
                prod_logged_in = True
                # Store with key 'production_user' for easy access in tests
                self.sessions['production_user'] = self.sessions[username]
                self.log(f"Production user '{username}' logged in successfully", "pass")
                break
        
        if not prod_logged_in:
            self.log("No production user found - will skip 403 tests", "warn")
        
        # Run tests
        tests = [
            ("Finance GET employee-rates", self.test_finance_employee_rates_get),
            ("Finance GET employee-rates 403 (production)", self.test_finance_employee_rates_403_production),
            ("Finance PUT employee-rates", self.test_finance_employee_rates_put),
            ("Finance PUT employee-rates 403 (production)", self.test_finance_employee_rates_put_403_production),
            ("Finance PUT employee-rates 404 (unknown employee)", self.test_finance_employee_rates_put_404),
            ("Finance GET daily-production", self.test_finance_daily_production_get),
            ("Finance GET daily-production 403 (production)", self.test_finance_daily_production_403_production),
            ("Production endpoints NO rate leak", self.test_production_endpoints_no_rate_leak),
        ]
        
        for test_name, test_func in tests:
            try:
                test_func()
            except Exception as e:
                self.log(f"Test '{test_name}' crashed: {str(e)}", "fail")
        
        # Summary
        self.log("\n" + "="*60, "info")
        self.log(f"TESTS COMPLETED: {self.tests_passed}/{self.tests_run} passed", "info")
        self.log("="*60 + "\n", "info")
        
        return self.tests_passed == self.tests_run

def main():
    tester = FinanceDailyProductionTester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())
