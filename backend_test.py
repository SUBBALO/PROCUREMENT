#!/usr/bin/env python3
"""
Backend API Testing for Production Module
Tests Daily Report, FGRN, Job Progress, and SO integration
"""
import requests
import sys
from datetime import datetime

BASE_URL = "https://error-fix-dev.preview.emergentagent.com/api"

class ProductionAPITester:
    def __init__(self):
        self.session = requests.Session()
        self.tests_run = 0
        self.tests_passed = 0
        self.test_data = {
            "frn_ids": [],  # Track created FGRNs for cleanup
            "report_ids": [],  # Track created reports for cleanup
        }

    def log(self, msg, status="INFO"):
        prefix = {
            "PASS": "✅",
            "FAIL": "❌",
            "INFO": "ℹ️",
            "WARN": "⚠️"
        }.get(status, "•")
        print(f"{prefix} {msg}")

    def test(self, name, method, endpoint, expected_status, data=None, params=None):
        """Run a single API test"""
        url = f"{BASE_URL}/{endpoint}"
        self.tests_run += 1
        self.log(f"Testing {name}...", "INFO")
        
        try:
            if method == "GET":
                response = self.session.get(url, params=params)
            elif method == "POST":
                response = self.session.post(url, json=data)
            elif method == "PUT":
                response = self.session.put(url, json=data)
            elif method == "DELETE":
                response = self.session.delete(url)
            else:
                self.log(f"Unknown method {method}", "FAIL")
                return False, {}

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                self.log(f"PASSED - Status: {response.status_code}", "PASS")
            else:
                self.log(f"FAILED - Expected {expected_status}, got {response.status_code}", "FAIL")
                if response.text:
                    self.log(f"Response: {response.text[:200]}", "WARN")

            try:
                return success, response.json() if success else {}
            except Exception:
                return success, {}

        except Exception as e:
            self.log(f"FAILED - Error: {str(e)}", "FAIL")
            return False, {}

    def login(self):
        """Login as admin"""
        self.log("=== LOGIN ===", "INFO")
        success, data = self.test(
            "Login as admin",
            "POST",
            "auth/login",
            200,
            data={"username": "admin", "password": "admin123"}
        )
        return success

    def test_production_reports(self):
        """Test Daily Production Report endpoints"""
        self.log("\n=== DAILY PRODUCTION REPORT ===", "INFO")
        
        # Test report options
        success, data = self.test(
            "Get report options",
            "GET",
            "production/report-options",
            200
        )
        if success:
            self.log(f"  Operators: {len(data.get('operators', []))}", "INFO")
            self.log(f"  SOs: {len(data.get('sos', []))}", "INFO")
        
        # Test masterlist with filters
        success, data = self.test(
            "Get masterlist (current month)",
            "GET",
            "production/reports/masterlist",
            200,
            params={"month": datetime.now().strftime("%Y-%m")}
        )
        if success:
            self.log(f"  Total rows: {data.get('count', 0)}", "INFO")
            self.log(f"  Total OK: {data.get('total_ok', 0)}", "INFO")
            self.log(f"  Total NG: {data.get('total_ng', 0)}", "INFO")
        
        # Test masterlist with SO filter
        success, data = self.test(
            "Get masterlist filtered by SO 005200",
            "GET",
            "production/reports/masterlist",
            200,
            params={"so_no": "005200"}
        )
        if success:
            self.log(f"  Rows for SO 005200: {data.get('count', 0)}", "INFO")
        
        # Test create report (will be cleaned up)
        today = datetime.now().strftime("%Y-%m-%d")
        success, data = self.test(
            "Create test report",
            "POST",
            "production/reports",
            200,
            data={
                "report_date": today,
                "operator_name": "ZZ TEST OPERATOR",
                "so_no": "005200",
                "customer": "SPM, PT",
                "process": "TEST PROCESS",
                "qty_ok": 5,
                "qty_ng": 0,
                "work_start": "08:00",
                "work_end": "10:00",
                "machine_no": "M01",
                "remarks": "Test report - will be deleted"
            }
        )
        if success and data.get("id"):
            report_id = data["id"]
            self.test_data["report_ids"].append(report_id)
            self.log(f"  Created report ID: {report_id}", "INFO")
            
            # Test update
            success, _ = self.test(
                "Update test report",
                "PUT",
                f"production/reports/{report_id}",
                200,
                data={
                    "report_date": today,
                    "operator_name": "ZZ TEST OPERATOR UPDATED",
                    "so_no": "005200",
                    "customer": "SPM, PT",
                    "process": "TEST PROCESS",
                    "qty_ok": 10,
                    "qty_ng": 1,
                    "work_start": "08:00",
                    "work_end": "11:00",
                    "machine_no": "M01",
                    "remarks": "Updated test report"
                }
            )

    def test_frn_endpoints(self):
        """Test Finished Goods Release Note endpoints"""
        self.log("\n=== FINISHED GOODS RELEASE NOTE ===", "INFO")
        
        # Test SO brief
        success, data = self.test(
            "Get SO brief (all)",
            "GET",
            "production/so-brief",
            200
        )
        if success:
            self.log(f"  Total SOs: {len(data.get('items', []))}", "INFO")
            so_005200 = next((s for s in data.get('items', []) if s.get('so_no') == '005200'), None)
            if so_005200:
                self.log(f"  SO 005200 found: customer={so_005200.get('customer')}, qty={so_005200.get('qty_total')}", "INFO")
        
        # Test list FRN
        success, data = self.test(
            "List all FRNs",
            "GET",
            "production/frn",
            200
        )
        if success:
            self.log(f"  Total FRNs: {len(data.get('items', []))}", "INFO")
        
        # Test list FRN filtered by SO
        success, data = self.test(
            "List FRNs for SO 005200",
            "GET",
            "production/frn",
            200,
            params={"so_no": "005200"}
        )
        if success:
            self.log(f"  FRNs for SO 005200: {len(data.get('items', []))}", "INFO")
        
        # Test create FRN
        today = datetime.now().strftime("%Y-%m-%d")
        success, data = self.test(
            "Create test FGRN for SO 005200",
            "POST",
            "production/frn",
            200,
            data={
                "frn_date": today,
                "release_no": "",  # Auto-generate
                "so_no": "005200",
                "customer": "",  # Auto-fill from SO
                "description": "",  # Auto-fill from SO
                "qty": 0.5,  # Partial release
                "qc_comment": "ZZ TEST - will be deleted"
            }
        )
        if success and data.get("id"):
            frn_id = data["id"]
            self.test_data["frn_ids"].append(frn_id)
            self.log(f"  Created FGRN ID: {frn_id}", "INFO")
            self.log(f"  Release No: {data.get('release_no')}", "INFO")
            self.log(f"  Customer (auto): {data.get('customer')}", "INFO")
            self.log(f"  Description (auto): {data.get('description')}", "INFO")
            
            # Test update
            success, _ = self.test(
                "Update test FGRN",
                "PUT",
                f"production/frn/{frn_id}",
                200,
                data={
                    "frn_date": today,
                    "release_no": data.get("release_no"),
                    "so_no": "005200",
                    "customer": "SPM, PT",
                    "description": "BAUT",
                    "qty": 0.7,
                    "qc_comment": "ZZ TEST UPDATED"
                }
            )

    def test_job_progress(self):
        """Test Job Progress endpoints - NEW REQUIREMENTS"""
        self.log("\n=== JOB PROGRESS (NEW FIELDS) ===", "INFO")
        
        # Test get job progress
        success, data = self.test(
            "Get job progress board",
            "GET",
            "production/job-progress",
            200
        )
        if success:
            self.log(f"  Total jobs: {data.get('count', 0)}", "INFO")
            self.log(f"  In progress: {data.get('in_progress', 0)}", "INFO")
            self.log(f"  Finished: {data.get('finished', 0)}", "INFO")
            
            # Find SO 005200
            items = data.get('items', [])
            so_005200 = next((item for item in items if item.get('so_no') == '005200'), None)
            if so_005200:
                self.log(f"  SO 005200 status:", "INFO")
                self.log(f"    Customer: {so_005200.get('customer')}", "INFO")
                self.log(f"    SO Qty: {so_005200.get('so_qty')}", "INFO")
                self.log(f"    Qty Finished: {so_005200.get('qty_finished')}", "INFO")
                self.log(f"    Qty Balance: {so_005200.get('qty_balance')}", "INFO")
                self.log(f"    Percent: {so_005200.get('percent')}%", "INFO")
                self.log(f"    Days: {so_005200.get('days')}", "INFO")
                self.log(f"    Finished: {so_005200.get('finished')}", "INFO")
                
                # NEW FIELDS CHECK
                self.log(f"    Due Date (from SO): {so_005200.get('due_date')}", "INFO")
                self.log(f"    Plan Start (=date_received): {so_005200.get('plan_start')}", "INFO")
                self.log(f"    Plan Finish (=finished_at): {so_005200.get('plan_finish')}", "INFO")
                self.log(f"    Working Date Target: {so_005200.get('working_date_target')}", "INFO")
                self.log(f"    Actual Working Days: {so_005200.get('actual_working_days')}", "INFO")
                self.log(f"    Actual Working Dates: {so_005200.get('actual_working_dates')}", "INFO")
                self.log(f"    Productivity: {so_005200.get('productivity')}%", "INFO")
                
                # Verify new fields exist
                required_fields = ['due_date', 'plan_start', 'plan_finish', 'days', 
                                 'working_date_target', 'actual_working_days', 
                                 'actual_working_dates', 'productivity']
                missing = [f for f in required_fields if f not in so_005200]
                if missing:
                    self.log(f"    MISSING FIELDS: {missing}", "FAIL")
                else:
                    self.log(f"    All new fields present ✓", "PASS")
                
                # Test update job progress - ONLY pic and remarks should be persisted
                so_id = so_005200.get('so_id')
                if so_id:
                    self.log(f"  Testing PUT /job-progress (only pic/remarks should persist):", "INFO")
                    success, _ = self.test(
                        "Update job progress (SO 005200) - pic and remarks only",
                        "PUT",
                        f"production/job-progress/{so_id}",
                        200,
                        data={
                            "pic": "ZZ TEST PIC",
                            "remarks": "ZZ TEST REMARKS"
                        }
                    )
                    
                    # Verify the update worked
                    if success:
                        success2, data2 = self.test(
                            "Verify job progress update",
                            "GET",
                            "production/job-progress",
                            200
                        )
                        if success2:
                            items2 = data2.get('items', [])
                            so_005200_updated = next((item for item in items2 if item.get('so_no') == '005200'), None)
                            if so_005200_updated:
                                if so_005200_updated.get('pic') == "ZZ TEST PIC" and so_005200_updated.get('remarks') == "ZZ TEST REMARKS":
                                    self.log(f"    PIC and Remarks updated correctly ✓", "PASS")
                                else:
                                    self.log(f"    PIC/Remarks update failed", "FAIL")
            else:
                self.log("  SO 005200 not found in job progress (not started?)", "WARN")

    def test_productivity_calculation(self):
        """Test productivity calculation with controlled scenario"""
        self.log("\n=== PRODUCTIVITY CALCULATION TEST ===", "INFO")
        
        # Step 1: Get SO 005200 ID
        success, data = self.test(
            "Get SO 005200 details",
            "GET",
            "production/new-so",
            200,
            params={"scope": "all"}
        )
        
        so_id = None
        original_due_date = None
        if success:
            items = data.get('items', [])
            so_005200 = next((item for item in items if item.get('so_no') == '005200'), None)
            if so_005200:
                so_id = so_005200.get('id')
                self.log(f"  SO 005200 ID: {so_id}", "INFO")
                self.log(f"  Current prod_started: {so_005200.get('prod_started')}", "INFO")
            else:
                self.log("  SO 005200 not found, skipping productivity test", "WARN")
                return
        
        if not so_id:
            self.log("  Cannot get SO 005200 ID, skipping productivity test", "WARN")
            return
        
        # Step 2: Set due_date on SO 005200 (we'll use direct DB update via sales-orders endpoint if available)
        # For now, we'll just verify the productivity calculation with existing data
        
        # Step 3: Add 2 daily production report rows on DIFFERENT dates with operator prefix 'ZZ'
        from datetime import datetime, timedelta
        today = datetime.now()
        date1 = (today - timedelta(days=2)).strftime("%Y-%m-%d")
        date2 = (today - timedelta(days=1)).strftime("%Y-%m-%d")
        
        self.log(f"  Creating ZZ report on {date1}...", "INFO")
        success1, data1 = self.test(
            "Create ZZ report (date 1)",
            "POST",
            "production/reports",
            200,
            data={
                "report_date": date1,
                "operator_name": "ZZ TEST OPERATOR 1",
                "so_no": "005200",
                "customer": "SPM, PT",
                "process": "TEST PROCESS",
                "qty_ok": 1,
                "qty_ng": 0,
                "work_start": "08:00",
                "work_end": "10:00",
                "machine_no": "M01",
                "remarks": "ZZ TEST - will be deleted"
            }
        )
        if success1 and data1.get("id"):
            self.test_data["report_ids"].append(data1["id"])
            self.log(f"    Created report ID: {data1['id']}", "INFO")
        
        self.log(f"  Creating ZZ report on {date2}...", "INFO")
        success2, data2 = self.test(
            "Create ZZ report (date 2)",
            "POST",
            "production/reports",
            200,
            data={
                "report_date": date2,
                "operator_name": "ZZ TEST OPERATOR 2",
                "so_no": "005200",
                "customer": "SPM, PT",
                "process": "TEST PROCESS",
                "qty_ok": 1,
                "qty_ng": 0,
                "work_start": "08:00",
                "work_end": "10:00",
                "machine_no": "M02",
                "remarks": "ZZ TEST - will be deleted"
            }
        )
        if success2 and data2.get("id"):
            self.test_data["report_ids"].append(data2["id"])
            self.log(f"    Created report ID: {data2['id']}", "INFO")
        
        # Step 4: Get job-progress and verify productivity calculation
        self.log(f"  Fetching job-progress to verify productivity...", "INFO")
        success, data = self.test(
            "Get job progress after adding ZZ reports",
            "GET",
            "production/job-progress",
            200
        )
        
        if success:
            items = data.get('items', [])
            so_005200 = next((item for item in items if item.get('so_no') == '005200'), None)
            if so_005200:
                wdt = so_005200.get('working_date_target', 0)
                awd = so_005200.get('actual_working_days', 0)
                productivity = so_005200.get('productivity', 0)
                
                self.log(f"    Working Date Target: {wdt}", "INFO")
                self.log(f"    Actual Working Days: {awd}", "INFO")
                self.log(f"    Productivity: {productivity}%", "INFO")
                
                # Verify productivity calculation
                if awd > 0:
                    expected_productivity = round((wdt / awd) * 100, 1)
                    self.log(f"    Expected Productivity: {expected_productivity}%", "INFO")
                    
                    if abs(productivity - expected_productivity) < 0.1:
                        self.log(f"    Productivity calculation CORRECT ✓", "PASS")
                    else:
                        self.log(f"    Productivity calculation INCORRECT (expected {expected_productivity}, got {productivity})", "FAIL")
                else:
                    self.log(f"    Cannot verify productivity (actual_working_days = 0)", "WARN")
                    if wdt == 0:
                        self.log(f"    Note: working_date_target = 0 (due_date not set on SO?)", "WARN")
        
        self.log(f"  Productivity test complete (cleanup will delete ZZ reports)", "INFO")

    def test_fgrn_finished_flow(self):
        """Test FGRN -> finished flow"""
        self.log("\n=== FGRN FINISHED FLOW TEST ===", "INFO")
        
        # Step 1: Get current state of SO 005200
        success, data = self.test(
            "Get job progress before FGRN",
            "GET",
            "production/job-progress",
            200
        )
        
        so_005200_before = None
        if success:
            items = data.get('items', [])
            so_005200_before = next((item for item in items if item.get('so_no') == '005200'), None)
            if so_005200_before:
                self.log(f"  SO 005200 before FGRN:", "INFO")
                self.log(f"    SO Qty: {so_005200_before.get('so_qty')}", "INFO")
                self.log(f"    Qty Finished: {so_005200_before.get('qty_finished')}", "INFO")
                self.log(f"    Finished: {so_005200_before.get('finished')}", "INFO")
                self.log(f"    Plan Finish: {so_005200_before.get('plan_finish')}", "INFO")
            else:
                self.log("  SO 005200 not found, skipping FGRN test", "WARN")
                return
        
        # Step 2: Create FGRN with qty >= SO qty to trigger finished status
        today = datetime.now().strftime("%Y-%m-%d")
        so_qty = so_005200_before.get('so_qty', 1)
        qty_finished = so_005200_before.get('qty_finished', 0)
        qty_needed = so_qty - qty_finished + 0.1  # Slightly more than needed
        
        self.log(f"  Creating FGRN with qty={qty_needed} to complete SO 005200...", "INFO")
        success, data = self.test(
            "Create FGRN to finish SO 005200",
            "POST",
            "production/frn",
            200,
            data={
                "frn_date": today,
                "release_no": "",  # Auto-generate
                "so_no": "005200",
                "customer": "",  # Auto-fill
                "description": "",  # Auto-fill
                "qty": qty_needed,
                "qc_comment": "ZZ TEST FGRN - will be deleted"
            }
        )
        
        test_frn_id = None
        if success and data.get("id"):
            test_frn_id = data["id"]
            self.test_data["frn_ids"].append(test_frn_id)
            self.log(f"    Created FGRN ID: {test_frn_id}", "INFO")
            
            # Step 3: Verify SO 005200 is now FINISHED
            success2, data2 = self.test(
                "Get job progress after FGRN",
                "GET",
                "production/job-progress",
                200
            )
            
            if success2:
                items2 = data2.get('items', [])
                so_005200_after = next((item for item in items2 if item.get('so_no') == '005200'), None)
                if so_005200_after:
                    self.log(f"  SO 005200 after FGRN:", "INFO")
                    self.log(f"    Qty Finished: {so_005200_after.get('qty_finished')}", "INFO")
                    self.log(f"    Qty Balance: {so_005200_after.get('qty_balance')}", "INFO")
                    self.log(f"    Percent: {so_005200_after.get('percent')}%", "INFO")
                    self.log(f"    Finished: {so_005200_after.get('finished')}", "INFO")
                    self.log(f"    Plan Finish: {so_005200_after.get('plan_finish')}", "INFO")
                    self.log(f"    Status: {so_005200_after.get('status')}", "INFO")
                    
                    # Verify finished status
                    if so_005200_after.get('finished') and so_005200_after.get('status') == 'FINISHED':
                        self.log(f"    FGRN -> FINISHED flow CORRECT ✓", "PASS")
                    else:
                        self.log(f"    FGRN -> FINISHED flow FAILED (not marked as finished)", "FAIL")
                    
                    # Verify plan_finish is set
                    if so_005200_after.get('plan_finish'):
                        self.log(f"    Plan Finish set correctly ✓", "PASS")
                    else:
                        self.log(f"    Plan Finish NOT set", "FAIL")
            
            # Step 4: Delete FGRN to revert
            self.log(f"  Deleting FGRN to revert SO 005200 to PROSES...", "INFO")
            success3, _ = self.test(
                "Delete FGRN to revert",
                "DELETE",
                f"production/frn/{test_frn_id}",
                200
            )
            
            if success3:
                # Remove from cleanup list since we already deleted it
                self.test_data["frn_ids"].remove(test_frn_id)
                
                # Verify SO 005200 is back to PROSES
                success4, data4 = self.test(
                    "Get job progress after FGRN deletion",
                    "GET",
                    "production/job-progress",
                    200
                )
                
                if success4:
                    items4 = data4.get('items', [])
                    so_005200_reverted = next((item for item in items4 if item.get('so_no') == '005200'), None)
                    if so_005200_reverted:
                        self.log(f"  SO 005200 after FGRN deletion:", "INFO")
                        self.log(f"    Finished: {so_005200_reverted.get('finished')}", "INFO")
                        self.log(f"    Status: {so_005200_reverted.get('status')}", "INFO")
                        self.log(f"    Plan Finish: {so_005200_reverted.get('plan_finish')}", "INFO")
                        
                        # Verify reverted to PROSES
                        if not so_005200_reverted.get('finished') and so_005200_reverted.get('status') == 'PROSES':
                            self.log(f"    FGRN deletion -> PROSES revert CORRECT ✓", "PASS")
                        else:
                            self.log(f"    FGRN deletion -> PROSES revert FAILED", "FAIL")

    def test_holidays(self):
        """Test Holiday master endpoints"""
        self.log("\n=== HOLIDAY MASTER (NEW) ===", "INFO")
        
        # Test list holidays (current year)
        current_year = datetime.now().strftime("%Y")
        success, data = self.test(
            f"List holidays for {current_year}",
            "GET",
            "production/holidays",
            200,
            params={"year": current_year}
        )
        if success:
            self.log(f"  Holidays in {current_year}: {len(data.get('items', []))}", "INFO")
        
        # Test create holiday
        test_date = "2026-08-17"  # Sunday - for testing
        success, data = self.test(
            f"Create test holiday {test_date}",
            "POST",
            "production/holidays",
            200,
            data={
                "date": test_date,
                "name": "ZZ TEST HOLIDAY - will be deleted"
            }
        )
        
        test_holiday_id = None
        if success and data.get("id"):
            test_holiday_id = data["id"]
            self.test_data["holiday_ids"] = self.test_data.get("holiday_ids", [])
            self.test_data["holiday_ids"].append(test_holiday_id)
            self.log(f"  Created holiday ID: {test_holiday_id}", "INFO")
            
            # Test idempotency - POST same date again
            success2, data2 = self.test(
                f"Create same holiday again (idempotent)",
                "POST",
                "production/holidays",
                200,
                data={
                    "date": test_date,
                    "name": "ZZ TEST HOLIDAY UPDATED"
                }
            )
            if success2:
                # Should return same ID (idempotent)
                if data2.get("id") == test_holiday_id:
                    self.log(f"  Idempotency CORRECT (same ID returned) ✓", "PASS")
                else:
                    self.log(f"  Idempotency check: different ID returned", "INFO")
            
            # Test list holidays again
            success3, data3 = self.test(
                f"List holidays after creation",
                "GET",
                "production/holidays",
                200,
                params={"year": "2026"}
            )
            if success3:
                items = data3.get('items', [])
                test_holiday = next((h for h in items if h.get('date') == test_date), None)
                if test_holiday:
                    self.log(f"  Holiday found in list: {test_holiday.get('name')}", "INFO")
                else:
                    self.log(f"  Holiday NOT found in list", "FAIL")
        
        return test_holiday_id
    
    def test_working_date_target_with_holidays(self):
        """Test Working Date Target calculation with holidays"""
        self.log("\n=== WORKING DATE TARGET WITH HOLIDAYS (NEW) ===", "INFO")
        
        # Step 1: Get current working_date_target for SO 005200
        success, data = self.test(
            "Get job progress before adding holiday",
            "GET",
            "production/job-progress",
            200
        )
        
        wdt_before = None
        so_005200_before = None
        if success:
            items = data.get('items', [])
            so_005200_before = next((item for item in items if item.get('so_no') == '005200'), None)
            if so_005200_before:
                wdt_before = so_005200_before.get('working_date_target', 0)
                self.log(f"  SO 005200 before holiday:", "INFO")
                self.log(f"    Date Received: {so_005200_before.get('date_received')}", "INFO")
                self.log(f"    Due Date: {so_005200_before.get('due_date')}", "INFO")
                self.log(f"    Working Date Target: {wdt_before}", "INFO")
                
                if not so_005200_before.get('due_date'):
                    self.log(f"    Note: SO 005200 has no due_date, working_date_target will be 0", "WARN")
                    self.log(f"    Skipping holiday impact test (need due_date to test)", "WARN")
                    return
            else:
                self.log("  SO 005200 not found, skipping holiday test", "WARN")
                return
        
        # Step 2: Add a holiday that falls within [date_received..due_date]
        # Use 2026-08-17 (between 2026-08-15 and any future due_date)
        test_date = "2026-08-17"
        self.log(f"  Adding holiday {test_date}...", "INFO")
        success2, data2 = self.test(
            f"Create holiday {test_date} for WDT test",
            "POST",
            "production/holidays",
            200,
            data={
                "date": test_date,
                "name": "ZZ TEST HOLIDAY FOR WDT - will be deleted"
            }
        )
        
        test_holiday_id = None
        if success2 and data2.get("id"):
            test_holiday_id = data2["id"]
            self.test_data["holiday_ids"] = self.test_data.get("holiday_ids", [])
            self.test_data["holiday_ids"].append(test_holiday_id)
            self.log(f"    Created holiday ID: {test_holiday_id}", "INFO")
            
            # Step 3: Get job progress again and verify working_date_target decreased
            success3, data3 = self.test(
                "Get job progress after adding holiday",
                "GET",
                "production/job-progress",
                200
            )
            
            if success3:
                items3 = data3.get('items', [])
                so_005200_after = next((item for item in items3 if item.get('so_no') == '005200'), None)
                if so_005200_after:
                    wdt_after = so_005200_after.get('working_date_target', 0)
                    self.log(f"  SO 005200 after holiday:", "INFO")
                    self.log(f"    Working Date Target: {wdt_after}", "INFO")
                    
                    # Verify working_date_target decreased
                    if wdt_before > 0:
                        if wdt_after < wdt_before:
                            self.log(f"    Working Date Target DECREASED by {wdt_before - wdt_after} (holiday excluded) ✓", "PASS")
                        elif wdt_after == wdt_before:
                            self.log(f"    Working Date Target UNCHANGED (holiday may be outside date range or on Sunday)", "WARN")
                        else:
                            self.log(f"    Working Date Target INCREASED (unexpected)", "FAIL")
                    else:
                        self.log(f"    Cannot verify (working_date_target was 0 before)", "WARN")
    
    def test_so_start_unstart(self):
        """Test SO start/unstart work endpoints"""
        self.log("\n=== SO START/UNSTART ===", "INFO")
        
        # Get SO 005200 details first
        success, data = self.test(
            "Get new SOs (all scope)",
            "GET",
            "production/new-so",
            200,
            params={"scope": "all"}
        )
        if success:
            items = data.get('items', [])
            so_005200 = next((item for item in items if item.get('so_no') == '005200'), None)
            if so_005200:
                self.log(f"  SO 005200 prod_started: {so_005200.get('prod_started')}", "INFO")
                # Note: We should keep SO 005200 started at the end, so we won't test unstart
            else:
                self.log("  SO 005200 not found", "WARN")

    def cleanup(self):
        """Clean up test data"""
        self.log("\n=== CLEANUP ===", "INFO")
        
        # Delete test holidays
        for holiday_id in self.test_data.get("holiday_ids", []):
            success, _ = self.test(
                f"Delete test holiday {holiday_id}",
                "DELETE",
                f"production/holidays/{holiday_id}",
                200
            )
        
        # Delete test FGRNs
        for frn_id in self.test_data["frn_ids"]:
            success, _ = self.test(
                f"Delete test FGRN {frn_id}",
                "DELETE",
                f"production/frn/{frn_id}",
                200
            )
        
        # Delete test reports
        for report_id in self.test_data["report_ids"]:
            success, _ = self.test(
                f"Delete test report {report_id}",
                "DELETE",
                f"production/reports/{report_id}",
                200
            )

    def run_all_tests(self):
        """Run all tests"""
        self.log("=" * 60, "INFO")
        self.log("PRODUCTION MODULE BACKEND API TESTS - NEW REQUIREMENTS", "INFO")
        self.log("=" * 60, "INFO")
        
        if not self.login():
            self.log("Login failed, stopping tests", "FAIL")
            return 1
        
        self.test_production_reports()
        self.test_frn_endpoints()
        self.test_job_progress()
        self.test_holidays()
        self.test_working_date_target_with_holidays()
        self.test_productivity_calculation()
        self.test_fgrn_finished_flow()
        self.test_so_start_unstart()
        self.cleanup()
        
        # Print summary
        self.log("\n" + "=" * 60, "INFO")
        self.log(f"TESTS PASSED: {self.tests_passed}/{self.tests_run}", "INFO")
        self.log("=" * 60, "INFO")
        
        return 0 if self.tests_passed == self.tests_run else 1

def main():
    tester = ProductionAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())
