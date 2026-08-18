"""
Test Production Daily Report - Edit, Delete, and Revision History Features
Tests:
1. Backend PUT /api/production/reports/{id} - history tracking with field-level changes
2. Backend GET /api/production/reports/masterlist - returns items with history array
3. Backend DELETE /api/production/reports/{id} - soft-delete
4. Backend POST /api/production/reports - creates with initial history entry
5. History tracking: create action, edit action with field diffs
"""
import requests
import sys
from datetime import datetime

BASE_URL = "https://error-fix-dev.preview.emergentagent.com/api"

class ProductionHistoryTester:
    def __init__(self):
        self.session = requests.Session()
        self.tests_run = 0
        self.tests_passed = 0
        self.created_ids = []
        
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
    
    def test_create_with_history(self, date):
        """Test POST /production/reports - should create with initial history entry"""
        self.log("\n=== Test 1: Create Report with Initial History ===", "info")
        payload = {
            "report_date": date,
            "operator_name": "ZZ History Test",
            "so_no": "005200",
            "customer": "SPM, PT",
            "process": "Initial Process",
            "qty_ok": 50,
            "qty_ng": 2,
            "work_start": "08:00",
            "work_end": "12:00",
            "machine_no": "M-001",
            "remarks": "Initial remark"
        }
        success, data = self.test(
            "Create report with initial history",
            "POST",
            "/production/reports",
            200,
            data=payload
        )
        
        if success:
            report_id = data.get('id')
            self.created_ids.append(report_id)
            self.log(f"  Created report ID: {report_id}", "info")
            
            # Verify history array exists
            history = data.get('history', [])
            if not history:
                self.log("  ✗ FAILED: history array is empty", "fail")
                return False, None
            
            # Verify first entry is 'create' action
            first_entry = history[0]
            if first_entry.get('action') != 'create':
                self.log(f"  ✗ FAILED: Expected action='create', got '{first_entry.get('action')}'", "fail")
                return False, None
            
            self.log(f"  ✓ History entry created: action={first_entry.get('action')}", "pass")
            self.log(f"  ✓ Created by: {first_entry.get('by_name')}", "pass")
            self.log(f"  ✓ Created at: {first_entry.get('at')}", "pass")
            
            # Verify changes array is empty for create action
            if first_entry.get('changes'):
                self.log(f"  ✗ FAILED: Create action should have empty changes array", "fail")
                return False, None
            
            self.log(f"  ✓ Changes array is empty (as expected for create)", "pass")
            return True, report_id
        
        return False, None
    
    def test_update_with_history(self, report_id, date):
        """Test PUT /production/reports/{id} - should append history with field diffs"""
        self.log("\n=== Test 2: Update Report with History Tracking ===", "info")
        
        # Update multiple fields to test field-level diff tracking
        payload = {
            "report_date": date,
            "operator_name": "ZZ History Test",  # unchanged
            "so_no": "005200",                    # unchanged
            "customer": "SPM, PT",                # unchanged
            "process": "Updated Process",         # CHANGED
            "qty_ok": 75,                         # CHANGED (50 -> 75)
            "qty_ng": 1,                          # CHANGED (2 -> 1)
            "work_start": "08:00",                # unchanged
            "work_end": "16:00",                  # CHANGED (12:00 -> 16:00)
            "machine_no": "M-002",                # CHANGED (M-001 -> M-002)
            "remarks": "Updated remark"           # CHANGED
        }
        
        success, data = self.test(
            f"Update report {report_id} with multiple field changes",
            "PUT",
            f"/production/reports/{report_id}",
            200,
            data=payload
        )
        
        if success:
            history = data.get('history', [])
            if len(history) < 2:
                self.log(f"  ✗ FAILED: Expected at least 2 history entries, got {len(history)}", "fail")
                return False
            
            # Check the latest (edit) entry
            edit_entry = history[-1]
            if edit_entry.get('action') != 'edit':
                self.log(f"  ✗ FAILED: Expected action='edit', got '{edit_entry.get('action')}'", "fail")
                return False
            
            self.log(f"  ✓ Edit history entry created", "pass")
            self.log(f"  ✓ Edited by: {edit_entry.get('by_name')}", "pass")
            
            # Verify changes array contains field diffs
            changes = edit_entry.get('changes', [])
            if not changes:
                self.log(f"  ✗ FAILED: Changes array is empty", "fail")
                return False
            
            self.log(f"  ✓ Found {len(changes)} field changes", "pass")
            
            # Verify expected changes
            expected_changes = {
                'process': ('Initial Process', 'Updated Process'),
                'qty_ok': (50.0, 75.0),
                'qty_ng': (2.0, 1.0),
                'work_end': ('12:00', '16:00'),
                'machine_no': ('M-001', 'M-002'),
                'remarks': ('Initial remark', 'Updated remark')
            }
            
            found_changes = {c['field']: (c['from'], c['to']) for c in changes}
            
            for field, (old_val, new_val) in expected_changes.items():
                if field not in found_changes:
                    self.log(f"  ✗ FAILED: Expected change for field '{field}' not found", "fail")
                    return False
                
                actual_from, actual_to = found_changes[field]
                # Normalize for comparison
                if isinstance(old_val, float):
                    actual_from = float(actual_from) if actual_from else 0.0
                    actual_to = float(actual_to) if actual_to else 0.0
                
                if str(actual_from) != str(old_val) or str(actual_to) != str(new_val):
                    self.log(f"  ✗ FAILED: Field '{field}' change mismatch", "fail")
                    self.log(f"    Expected: {old_val} -> {new_val}", "fail")
                    self.log(f"    Got: {actual_from} -> {actual_to}", "fail")
                    return False
                
                self.log(f"  ✓ Field '{field}': {old_val} → {new_val}", "pass")
            
            # Verify unchanged fields are NOT in changes array
            unchanged_fields = ['operator_name', 'so_no', 'customer', 'work_start']
            for field in unchanged_fields:
                if field in found_changes:
                    self.log(f"  ✗ FAILED: Unchanged field '{field}' should not be in changes", "fail")
                    return False
            
            self.log(f"  ✓ Unchanged fields not recorded (as expected)", "pass")
            return True
        
        return False
    
    def test_masterlist_includes_history(self, report_id):
        """Test GET /production/reports/masterlist - should include history array"""
        self.log("\n=== Test 3: Masterlist Includes History ===", "info")
        
        success, data = self.test(
            "Get masterlist with history",
            "GET",
            "/production/reports/masterlist",
            200,
            params={"operator": "ZZ History Test"}
        )
        
        if success:
            items = data.get('items', [])
            if not items:
                self.log(f"  ✗ FAILED: No items found in masterlist", "fail")
                return False
            
            # Find our test report
            test_report = next((r for r in items if r.get('id') == report_id), None)
            if not test_report:
                self.log(f"  ✗ FAILED: Test report {report_id} not found in masterlist", "fail")
                return False
            
            self.log(f"  ✓ Test report found in masterlist", "pass")
            
            # Verify history array is present
            history = test_report.get('history', [])
            if not history:
                self.log(f"  ✗ FAILED: history array is missing or empty", "fail")
                return False
            
            self.log(f"  ✓ History array present with {len(history)} entries", "pass")
            
            # Verify we have both create and edit entries
            actions = [h.get('action') for h in history]
            if 'create' not in actions:
                self.log(f"  ✗ FAILED: 'create' action not found in history", "fail")
                return False
            if 'edit' not in actions:
                self.log(f"  ✗ FAILED: 'edit' action not found in history", "fail")
                return False
            
            self.log(f"  ✓ History contains both 'create' and 'edit' actions", "pass")
            return True
        
        return False
    
    def test_update_without_changes(self, report_id, date):
        """Test PUT with no actual changes - should NOT add history entry"""
        self.log("\n=== Test 4: Update Without Changes (No History Entry) ===", "info")
        
        # Get current state first
        success, current_data = self.test(
            "Get current report state",
            "GET",
            "/production/reports/masterlist",
            200,
            params={"operator": "ZZ History Test"}
        )
        
        if not success:
            return False
        
        items = current_data.get('items', [])
        test_report = next((r for r in items if r.get('id') == report_id), None)
        if not test_report:
            self.log(f"  ✗ FAILED: Could not find report", "fail")
            return False
        
        history_count_before = len(test_report.get('history', []))
        self.log(f"  History entries before update: {history_count_before}", "info")
        
        # Update with same values (no changes)
        payload = {
            "report_date": test_report.get('report_date'),
            "operator_name": test_report.get('operator_name'),
            "so_no": test_report.get('so_no'),
            "customer": test_report.get('customer'),
            "process": test_report.get('process'),
            "qty_ok": test_report.get('qty_ok'),
            "qty_ng": test_report.get('qty_ng'),
            "work_start": test_report.get('work_start'),
            "work_end": test_report.get('work_end'),
            "machine_no": test_report.get('machine_no'),
            "remarks": test_report.get('remarks'),
        }
        
        success, updated_data = self.test(
            "Update report with no changes",
            "PUT",
            f"/production/reports/{report_id}",
            200,
            data=payload
        )
        
        if success:
            history_after = updated_data.get('history', [])
            history_count_after = len(history_after)
            self.log(f"  History entries after update: {history_count_after}", "info")
            
            if history_count_after > history_count_before:
                self.log(f"  ✗ FAILED: History entry added when no changes were made", "fail")
                return False
            
            self.log(f"  ✓ No history entry added (as expected)", "pass")
            return True
        
        return False
    
    def test_delete_report(self, report_id):
        """Test DELETE /production/reports/{id} - soft delete"""
        self.log("\n=== Test 5: Delete Report (Soft Delete) ===", "info")
        
        success, data = self.test(
            f"Delete report {report_id}",
            "DELETE",
            f"/production/reports/{report_id}",
            200
        )
        
        if success:
            self.log(f"  ✓ Report deleted successfully", "pass")
            
            # Verify report is no longer in masterlist
            success2, data2 = self.test(
                "Verify report removed from masterlist",
                "GET",
                "/production/reports/masterlist",
                200,
                params={"operator": "ZZ History Test"}
            )
            
            if success2:
                items = data2.get('items', [])
                deleted_report = next((r for r in items if r.get('id') == report_id), None)
                
                if deleted_report:
                    self.log(f"  ✗ FAILED: Deleted report still appears in masterlist", "fail")
                    return False
                
                self.log(f"  ✓ Report removed from masterlist (soft-deleted)", "pass")
                return True
        
        return False
    
    def test_edit_existing_report(self):
        """Test editing an existing SO 005200 report to verify history on real data"""
        self.log("\n=== Test 6: Edit Existing SO 005200 Report ===", "info")
        
        # Get existing reports for SO 005200
        success, data = self.test(
            "Get existing SO 005200 reports",
            "GET",
            "/production/reports/masterlist",
            200,
            params={"so_no": "005200"}
        )
        
        if not success:
            return False
        
        items = data.get('items', [])
        if not items:
            self.log(f"  ⚠ No existing SO 005200 reports found to test edit", "info")
            return True  # Not a failure, just no data
        
        # Pick the first report
        existing_report = items[0]
        report_id = existing_report.get('id')
        self.log(f"  Testing edit on existing report: {report_id}", "info")
        self.log(f"  Current Process: {existing_report.get('process')}", "info")
        self.log(f"  Current Qty OK: {existing_report.get('qty_ok')}", "info")
        
        # Edit only Process and Remarks (keep operator/date same to avoid attendance issues)
        payload = {
            "report_date": existing_report.get('report_date'),
            "operator_name": existing_report.get('operator_name'),
            "so_no": existing_report.get('so_no'),
            "customer": existing_report.get('customer'),
            "process": f"{existing_report.get('process')} [EDITED]",  # Change process
            "qty_ok": existing_report.get('qty_ok'),
            "qty_ng": existing_report.get('qty_ng'),
            "work_start": existing_report.get('work_start'),
            "work_end": existing_report.get('work_end'),
            "machine_no": existing_report.get('machine_no'),
            "remarks": f"{existing_report.get('remarks')} [TEST EDIT]",  # Change remarks
        }
        
        success, updated = self.test(
            "Edit existing report",
            "PUT",
            f"/production/reports/{report_id}",
            200,
            data=payload
        )
        
        if success:
            history = updated.get('history', [])
            self.log(f"  ✓ Report updated, history entries: {len(history)}", "pass")
            
            # Find the latest edit entry
            edit_entries = [h for h in history if h.get('action') == 'edit']
            if edit_entries:
                latest_edit = edit_entries[-1]
                changes = latest_edit.get('changes', [])
                self.log(f"  ✓ Latest edit has {len(changes)} changes", "pass")
                
                for change in changes:
                    self.log(f"    - {change.get('label')}: {change.get('from')} → {change.get('to')}", "info")
            
            # Revert the changes
            revert_payload = {
                "report_date": existing_report.get('report_date'),
                "operator_name": existing_report.get('operator_name'),
                "so_no": existing_report.get('so_no'),
                "customer": existing_report.get('customer'),
                "process": existing_report.get('process'),  # Revert
                "qty_ok": existing_report.get('qty_ok'),
                "qty_ng": existing_report.get('qty_ng'),
                "work_start": existing_report.get('work_start'),
                "work_end": existing_report.get('work_end'),
                "machine_no": existing_report.get('machine_no'),
                "remarks": existing_report.get('remarks'),  # Revert
            }
            
            success2, reverted = self.test(
                "Revert changes to original values",
                "PUT",
                f"/production/reports/{report_id}",
                200,
                data=revert_payload
            )
            
            if success2:
                self.log(f"  ✓ Changes reverted successfully", "pass")
                return True
        
        return False
    
    def cleanup(self):
        """Clean up test reports"""
        self.log("\n=== Cleanup ===", "info")
        for report_id in self.created_ids:
            # Note: Already deleted in test_delete_report, but try again just in case
            try:
                self.session.delete(f"{BASE_URL}/production/reports/{report_id}")
                self.log(f"  Cleaned up report {report_id}", "info")
            except Exception:
                pass
    
    def print_summary(self):
        """Print test summary"""
        self.log("\n" + "="*70, "info")
        self.log(f"TESTS COMPLETED: {self.tests_passed}/{self.tests_run} passed", "info")
        if self.tests_passed == self.tests_run:
            self.log("ALL TESTS PASSED! ✨", "pass")
        else:
            self.log(f"SOME TESTS FAILED ({self.tests_run - self.tests_passed} failures)", "fail")
        self.log("="*70, "info")
        return self.tests_passed == self.tests_run

def main():
    tester = ProductionHistoryTester()
    today = datetime.now().strftime("%Y-%m-%d")
    
    print("\n" + "="*70)
    print("Production Daily Report - Edit, Delete, History Tests")
    print("="*70)
    
    # Step 1: Login
    if not tester.login():
        print("\n❌ Login failed. Cannot proceed with tests.")
        return 1
    
    # Step 2: Create report with initial history
    success, report_id = tester.test_create_with_history(today)
    if not success or not report_id:
        print("\n❌ Failed to create report with history. Stopping tests.")
        return 1
    
    # Step 3: Update report with field changes (history tracking)
    if not tester.test_update_with_history(report_id, today):
        print("\n❌ Failed to update report with history tracking.")
    
    # Step 4: Verify masterlist includes history
    if not tester.test_masterlist_includes_history(report_id):
        print("\n❌ Failed to verify history in masterlist.")
    
    # Step 5: Test update without changes (should not add history)
    if not tester.test_update_without_changes(report_id, today):
        print("\n❌ Failed to verify no-change update behavior.")
    
    # Step 6: Test delete (soft delete)
    if not tester.test_delete_report(report_id):
        print("\n❌ Failed to delete report.")
    
    # Step 7: Test editing existing SO 005200 report
    tester.test_edit_existing_report()
    
    # Cleanup
    tester.cleanup()
    
    # Print summary
    all_passed = tester.print_summary()
    
    return 0 if all_passed else 1

if __name__ == "__main__":
    sys.exit(main())
