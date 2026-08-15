"""
Test Production Module Iteration 49 - Complete Feature Set
Tests:
1. Daily Production Report (spreadsheet-style auto-save)
2. Masterlist (merged into daily report page as tab)
3. SO Masuk with qty_total and Mulai Kerja/Batal Mulai buttons
"""
import requests
import sys
from datetime import datetime

BASE_URL = "https://error-fix-dev.preview.emergentagent.com/api"

class ProductionTester:
    def __init__(self):
        self.session = requests.Session()
        self.tests_run = 0
        self.tests_passed = 0
        self.created_report_ids = []
        self.modified_so_ids = []  # Track SOs we modified for cleanup
        
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
                        error_data = response.json()
                        self.log(f"Response: {error_data}", "fail")
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
    
    # ========== Daily Production Report Tests ==========
    
    def test_report_options(self):
        """Test GET /production/report-options - should include sos with qty"""
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
                self.log(f"  ✓ SO 005200 found with customer: {so_005200.get('customer')}", "pass")
            else:
                self.log("  ✗ SO 005200 not found in options", "fail")
        return success, data
    
    def test_create_report(self, date):
        """Test POST /production/reports - auto-save create"""
        self.log("\n=== Create Report (Auto-save) ===", "info")
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
            "Create production report (auto-save)",
            "POST",
            "/production/reports",
            200,
            data=payload
        )
        if success and data.get('id'):
            self.created_report_ids.append(data['id'])
            self.log(f"  Created report ID: {data['id']}", "info")
        return success, data
    
    def test_list_reports(self, date):
        """Test GET /production/reports?date="""
        self.log("\n=== List Reports for Date ===", "info")
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
        """Test PUT /production/reports/{id} - auto-save update"""
        self.log("\n=== Update Report (Auto-save) ===", "info")
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
        self.log("\n=== Masterlist (Merged Tab) ===", "info")
        
        # Test 1: Get all reports
        success1, data1 = self.test(
            "Get masterlist (no filters)",
            "GET",
            "/production/reports/masterlist",
            200
        )
        if success1:
            self.log(f"  Total rows: {data1.get('count', 0)}", "info")
            self.log(f"  Total OK: {data1.get('total_ok', 0)}", "info")
            self.log(f"  Total NG: {data1.get('total_ng', 0)}", "info")
        
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
        success, data = self.test(
            f"Delete report {report_id}",
            "DELETE",
            f"/production/reports/{report_id}",
            200
        )
        return success
    
    # ========== SO Masuk Tests ==========
    
    def test_new_so_list(self):
        """Test GET /production/new-so - should include qty_total and prod_started fields"""
        self.log("\n=== SO Masuk (New SO List) ===", "info")
        
        # Test unack scope
        success1, data1 = self.test(
            "Get new SO list (scope=unack)",
            "GET",
            "/production/new-so",
            200,
            params={"scope": "unack"}
        )
        if success1:
            items = data1.get('items', [])
            self.log(f"  Unack SOs: {len(items)}", "info")
            
            # Check if SO 005200 exists and has qty_total
            so_005200 = next((s for s in items if s.get('so_no') == '005200'), None)
            if so_005200:
                self.log(f"  ✓ SO 005200 found", "pass")
                self.log(f"    Customer: {so_005200.get('customer')}", "info")
                self.log(f"    Description: {so_005200.get('description', '')[:50]}...", "info")
                self.log(f"    Qty Total: {so_005200.get('qty_total')}", "info")
                self.log(f"    prod_started: {so_005200.get('prod_started')}", "info")
                
                # Verify qty_total field exists
                if 'qty_total' in so_005200:
                    self.log(f"  ✓ qty_total field present", "pass")
                else:
                    self.log(f"  ✗ qty_total field missing", "fail")
                
                # Verify prod_started field exists
                if 'prod_started' in so_005200:
                    self.log(f"  ✓ prod_started field present", "pass")
                else:
                    self.log(f"  ✗ prod_started field missing", "fail")
                
                return success1, so_005200
            else:
                self.log("  ✗ SO 005200 not found", "fail")
                # Return first SO if 005200 not found
                if items:
                    return success1, items[0]
        
        return success1, {}
    
    def test_start_work(self, so_id, so_no):
        """Test POST /production/new-so/{id}/start - Mulai Kerja"""
        self.log("\n=== Mulai Kerja (Start Work) ===", "info")
        success, data = self.test(
            f"Start work on SO {so_no}",
            "POST",
            f"/production/new-so/{so_id}/start",
            200
        )
        if success:
            self.modified_so_ids.append(so_id)
            self.log(f"  ✓ SO {so_no} marked as 'Dikerjakan'", "pass")
        return success
    
    def test_unstart_work(self, so_id, so_no):
        """Test POST /production/new-so/{id}/unstart - Batal Mulai"""
        self.log("\n=== Batal Mulai (Unstart Work) ===", "info")
        success, data = self.test(
            f"Unstart work on SO {so_no}",
            "POST",
            f"/production/new-so/{so_id}/unstart",
            200
        )
        if success:
            self.log(f"  ✓ SO {so_no} status reverted", "pass")
        return success
    
    def test_verify_start_status(self, so_id, so_no, expected_started):
        """Verify prod_started status after start/unstart"""
        self.log(f"\n=== Verify Status (prod_started={expected_started}) ===", "info")
        success, data = self.test(
            f"Get SO list to verify status",
            "GET",
            "/production/new-so",
            200,
            params={"scope": "all"}
        )
        if success:
            items = data.get('items', [])
            so = next((s for s in items if s.get('id') == so_id), None)
            if so:
                actual_started = so.get('prod_started', False)
                if actual_started == expected_started:
                    self.log(f"  ✓ Status verified: prod_started={actual_started}", "pass")
                    return True
                else:
                    self.log(f"  ✗ Status mismatch: expected {expected_started}, got {actual_started}", "fail")
                    return False
        return False
    
    def cleanup(self):
        """Clean up all created test data"""
        self.log("\n=== Cleanup ===", "info")
        
        # Clean up production reports
        for report_id in self.created_report_ids:
            self.log(f"Cleaning up report {report_id}...", "info")
            self.test_delete_report(report_id)
        
        # Revert any SO modifications (unstart any started SOs)
        for so_id in self.modified_so_ids:
            self.log(f"Reverting SO {so_id} to original state...", "info")
            # Call unstart to ensure SO is back to original state
            self.session.post(f"{BASE_URL}/production/new-so/{so_id}/unstart")
    
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
    tester = ProductionTester()
    today = datetime.now().strftime("%Y-%m-%d")
    
    print("\n" + "="*60)
    print("Production Module Iteration 49 - Complete Tests")
    print("="*60)
    
    # Step 1: Login
    if not tester.login():
        print("\n❌ Login failed. Cannot proceed with tests.")
        return 1
    
    # ========== Daily Production Report Tests ==========
    
    # Step 2: Test report options
    tester.test_report_options()
    
    # Step 3: Create a report (auto-save)
    success, report_data = tester.test_create_report(today)
    if not success:
        print("\n❌ Failed to create report. Stopping tests.")
        return 1
    
    report_id = report_data.get('id')
    
    # Step 4: List reports for today
    tester.test_list_reports(today)
    
    # Step 5: Update the report (auto-save)
    tester.test_update_report(report_id, today)
    
    # Step 6: Test masterlist with filters
    tester.test_masterlist()
    
    # Step 7: Test Excel export
    tester.test_excel_export()
    
    # ========== SO Masuk Tests ==========
    
    # Step 8: Test new SO list with qty_total
    success, so_data = tester.test_new_so_list()
    if not success or not so_data:
        print("\n❌ Failed to get SO list. Skipping start/unstart tests.")
    else:
        so_id = so_data.get('id')
        so_no = so_data.get('so_no', 'unknown')
        
        # Step 9: Test start work
        if tester.test_start_work(so_id, so_no):
            # Step 10: Verify status is 'started'
            tester.test_verify_start_status(so_id, so_no, True)
            
            # Step 11: Test unstart work
            if tester.test_unstart_work(so_id, so_no):
                # Step 12: Verify status is back to 'not started'
                tester.test_verify_start_status(so_id, so_no, False)
    
    # Step 13: Cleanup - delete test reports and revert SO changes
    tester.cleanup()
    
    # Print summary
    all_passed = tester.print_summary()
    
    return 0 if all_passed else 1

if __name__ == "__main__":
    sys.exit(main())
