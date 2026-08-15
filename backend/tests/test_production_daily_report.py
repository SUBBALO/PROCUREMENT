"""
Test Daily Production Report feature (Iteration 48)
Tests all CRUD operations for production reports and masterlist functionality.
"""
import requests
import sys
from datetime import datetime

BASE_URL = "https://error-fix-dev.preview.emergentagent.com/api"

class ProductionReportTester:
    def __init__(self):
        self.session = requests.Session()
        self.tests_run = 0
        self.tests_passed = 0
        self.created_ids = []  # Track created reports for cleanup
        
    def log(self, msg, status="info"):
        symbols = {"pass": "✅", "fail": "❌", "info": "🔍"}
        print(f"{symbols.get(status, '•')} {msg}")
    
    def test(self, name, method, endpoint, expected_status, data=None, params=None):
        """Run a single API test"""
        url = f"{BASE_URL}{endpoint}"
        self.tests_run += 1
        self.log(f"Testing {name}...", "info")
        
        try:
            if method == "GET":
                response = self.session.get(url, params=params)
            elif method == "POST":
                response = self.session.post(url, json=data)
            elif method == "PUT":
                response = self.session.put(url, json=data)
            elif method == "DELETE":
                response = self.session.delete(url)
            
            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                self.log(f"PASSED - {name} (Status: {response.status_code})", "pass")
                return True, response.json() if response.content else {}
            else:
                self.log(f"FAILED - {name} (Expected {expected_status}, got {response.status_code})", "fail")
                if response.content:
                    try:
                        self.log(f"Response: {response.json()}", "fail")
                    except Exception:
                        self.log(f"Response: {response.text[:200]}", "fail")
                return False, {}
        except Exception as e:
            self.log(f"FAILED - {name} (Error: {str(e)})", "fail")
            return False, {}
    
    def login(self):
        """Login as admin"""
        self.log("=== Authentication ===", "info")
        success, data = self.test(
            "Login as admin",
            "POST",
            "/auth/login",
            200,
            data={"username": "admin", "password": "admin123"}
        )
        return success
    
    def test_report_options(self):
        """Test GET /production/report-options"""
        self.log("\n=== Report Options ===", "info")
        success, data = self.test(
            "Get report options (operators, machines, processes, sos)",
            "GET",
            "/production/report-options",
            200
        )
        if success:
            self.log(f"  Operators: {len(data.get('operators', []))}", "info")
            self.log(f"  Machines: {len(data.get('machines', []))}", "info")
            self.log(f"  Processes: {len(data.get('processes', []))}", "info")
            self.log(f"  SOs: {len(data.get('sos', []))}", "info")
            
            # Check if SO '005200' exists with customer 'SPM, PT'
            sos = data.get('sos', [])
            so_005200 = next((s for s in sos if s.get('so_no') == '005200'), None)
            if so_005200:
                self.log(f"  SO 005200 found with customer: {so_005200.get('customer')}", "info")
            else:
                self.log("  SO 005200 not found in options", "fail")
        return success, data
    
    def test_create_report(self, date):
        """Test POST /production/reports"""
        self.log("\n=== Create Report ===", "info")
        payload = {
            "report_date": date,
            "operator_name": "ZZ Test Operator",
            "so_no": "005200",
            "customer": "SPM, PT",
            "process": "ZZ Test Process",
            "qty_ok": 100,
            "qty_ng": 5,
            "work_start": "08:00",
            "work_end": "12:00",
            "machine_no": "ZZ-M001",
            "remarks": "ZZ Test remark"
        }
        success, data = self.test(
            "Create production report",
            "POST",
            "/production/reports",
            200,
            data=payload
        )
        if success and data.get('id'):
            self.created_ids.append(data['id'])
            self.log(f"  Created report ID: {data['id']}", "info")
        return success, data
    
    def test_list_reports(self, date):
        """Test GET /production/reports?date="""
        self.log("\n=== List Reports ===", "info")
        success, data = self.test(
            f"List reports for date {date}",
            "GET",
            "/production/reports",
            200,
            params={"date": date}
        )
        if success:
            self.log(f"  Total rows: {data.get('count', 0)}", "info")
            self.log(f"  Total OK: {data.get('total_ok', 0)}", "info")
            self.log(f"  Total NG: {data.get('total_ng', 0)}", "info")
        return success, data
    
    def test_update_report(self, report_id, date):
        """Test PUT /production/reports/{id}"""
        self.log("\n=== Update Report ===", "info")
        payload = {
            "report_date": date,
            "operator_name": "ZZ Test Operator UPDATED",
            "so_no": "005200",
            "customer": "SPM, PT",
            "process": "ZZ Test Process UPDATED",
            "qty_ok": 150,
            "qty_ng": 3,
            "work_start": "08:00",
            "work_end": "16:00",
            "machine_no": "ZZ-M002",
            "remarks": "ZZ Test remark UPDATED"
        }
        success, data = self.test(
            f"Update report {report_id}",
            "PUT",
            f"/production/reports/{report_id}",
            200,
            data=payload
        )
        if success:
            self.log(f"  Updated operator: {data.get('operator_name')}", "info")
            self.log(f"  Updated qty_ok: {data.get('qty_ok')}", "info")
        return success, data
    
    def test_masterlist(self):
        """Test GET /production/reports/masterlist with filters"""
        self.log("\n=== Masterlist ===", "info")
        
        # Test 1: Get all reports
        success1, data1 = self.test(
            "Get masterlist (no filters)",
            "GET",
            "/production/reports/masterlist",
            200
        )
        if success1:
            self.log(f"  Total rows: {data1.get('count', 0)}", "info")
        
        # Test 2: Filter by month
        month = datetime.now().strftime("%Y-%m")
        success2, data2 = self.test(
            f"Get masterlist filtered by month {month}",
            "GET",
            "/production/reports/masterlist",
            200,
            params={"month": month}
        )
        if success2:
            self.log(f"  Rows for {month}: {data2.get('count', 0)}", "info")
        
        # Test 3: Filter by operator
        success3, data3 = self.test(
            "Get masterlist filtered by operator 'ZZ Test'",
            "GET",
            "/production/reports/masterlist",
            200,
            params={"operator": "ZZ Test"}
        )
        if success3:
            self.log(f"  Rows for ZZ Test operator: {data3.get('count', 0)}", "info")
        
        # Test 4: Filter by SO
        success4, data4 = self.test(
            "Get masterlist filtered by SO '005200'",
            "GET",
            "/production/reports/masterlist",
            200,
            params={"so_no": "005200"}
        )
        if success4:
            self.log(f"  Rows for SO 005200: {data4.get('count', 0)}", "info")
        
        return success1 and success2 and success3 and success4
    
    def test_excel_export(self):
        """Test GET /production/reports/masterlist.xlsx"""
        self.log("\n=== Excel Export ===", "info")
        url = f"{BASE_URL}/production/reports/masterlist.xlsx"
        self.tests_run += 1
        
        try:
            response = self.session.get(url)
            if response.status_code == 200:
                content_type = response.headers.get('Content-Type', '')
                if 'spreadsheet' in content_type or 'excel' in content_type:
                    self.tests_passed += 1
                    self.log(f"PASSED - Excel export (Status: 200, Size: {len(response.content)} bytes)", "pass")
                    return True
                else:
                    self.log(f"FAILED - Excel export (Wrong content-type: {content_type})", "fail")
                    return False
            else:
                self.log(f"FAILED - Excel export (Status: {response.status_code})", "fail")
                return False
        except Exception as e:
            self.log(f"FAILED - Excel export (Error: {str(e)})", "fail")
            return False
    
    def test_delete_report(self, report_id):
        """Test DELETE /production/reports/{id}"""
        self.log("\n=== Delete Report ===", "info")
        success, data = self.test(
            f"Delete report {report_id}",
            "DELETE",
            f"/production/reports/{report_id}",
            200
        )
        return success
    
    def cleanup(self):
        """Clean up all created test reports"""
        self.log("\n=== Cleanup ===", "info")
        for report_id in self.created_ids:
            self.log(f"Cleaning up report {report_id}...", "info")
            self.test_delete_report(report_id)
    
    def print_summary(self):
        """Print test summary"""
        self.log("\n" + "="*60, "info")
        self.log(f"TESTS COMPLETED: {self.tests_passed}/{self.tests_run} passed", "info")
        if self.tests_passed == self.tests_run:
            self.log("ALL TESTS PASSED! ✨", "pass")
        else:
            self.log(f"SOME TESTS FAILED ({self.tests_run - self.tests_passed} failures)", "fail")
        self.log("="*60, "info")
        return self.tests_passed == self.tests_run

def main():
    tester = ProductionReportTester()
    today = datetime.now().strftime("%Y-%m-%d")
    
    print("\n" + "="*60)
    print("Daily Production Report Backend Tests")
    print("="*60)
    
    # Step 1: Login
    if not tester.login():
        print("\n❌ Login failed. Cannot proceed with tests.")
        return 1
    
    # Step 2: Test report options
    tester.test_report_options()
    
    # Step 3: Create a report
    success, report_data = tester.test_create_report(today)
    if not success:
        print("\n❌ Failed to create report. Stopping tests.")
        return 1
    
    report_id = report_data.get('id')
    
    # Step 4: List reports for today
    tester.test_list_reports(today)
    
    # Step 5: Update the report
    tester.test_update_report(report_id, today)
    
    # Step 6: Test masterlist with filters
    tester.test_masterlist()
    
    # Step 7: Test Excel export
    tester.test_excel_export()
    
    # Step 8: Cleanup - delete test reports
    tester.cleanup()
    
    # Print summary
    all_passed = tester.print_summary()
    
    return 0 if all_passed else 1

if __name__ == "__main__":
    sys.exit(main())
