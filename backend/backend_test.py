"""
Backend API Testing for Feature 1 (Sales Order) and Feature 3 (Quotation Lock)
Tests:
- FE1: Sales Order with Customer autocomplete, Sales Name picker, no Deskripsi Project
- FE3: Quotation Confirm Order lock (edit, status change, delete restrictions)
"""
import requests
import sys
import random
from datetime import datetime

BASE_URL = "https://error-fix-dev.preview.emergentagent.com/api"

class TestRunner:
    def __init__(self):
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.sales_session = requests.Session()
        self.admin_session = requests.Session()
        self.created_quotation_id = None
        self.created_so_id = None

    def log(self, msg, level="INFO"):
        prefix = {
            "INFO": "ℹ️",
            "SUCCESS": "✅",
            "FAIL": "❌",
            "WARN": "⚠️"
        }.get(level, "•")
        print(f"{prefix} {msg}")

    def test(self, name, method, endpoint, expected_status, data=None, headers=None, session=None):
        """Run a single test"""
        self.tests_run += 1
        url = f"{BASE_URL}{endpoint}"
        
        req_headers = {'Content-Type': 'application/json'}
        if headers:
            req_headers.update(headers)

        # Use provided session or create a new one
        if session is None:
            session = requests.Session()

        self.log(f"Test #{self.tests_run}: {name}", "INFO")
        
        try:
            if method == 'GET':
                response = session.get(url, headers=req_headers, params=data)
            elif method == 'POST':
                response = session.post(url, json=data, headers=req_headers)
            elif method == 'PATCH':
                response = session.patch(url, json=data, headers=req_headers)
            elif method == 'PUT':
                response = session.put(url, json=data, headers=req_headers)
            elif method == 'DELETE':
                response = session.delete(url, headers=req_headers, params=data)
            else:
                self.log(f"Unknown method: {method}", "FAIL")
                self.tests_failed += 1
                return False, {}

            success = response.status_code == expected_status
            
            if success:
                self.tests_passed += 1
                self.log(f"PASSED - Status: {response.status_code}", "SUCCESS")
                try:
                    return True, response.json()
                except Exception:
                    return True, {}
            else:
                self.tests_failed += 1
                self.log(f"FAILED - Expected {expected_status}, got {response.status_code}", "FAIL")
                try:
                    self.log(f"Response: {response.json()}", "FAIL")
                except Exception:
                    self.log(f"Response: {response.text[:200]}", "FAIL")
                return False, {}

        except Exception as e:
            self.tests_failed += 1
            self.log(f"EXCEPTION: {str(e)}", "FAIL")
            return False, {}

    def login(self, username, password, session):
        """Login and store cookies in session"""
        self.log(f"Logging in as {username}...", "INFO")
        success, resp = self.test(
            f"Login as {username}",
            "POST",
            "/auth/login",
            200,
            data={"username": username, "password": password},
            session=session
        )
        if success:
            self.log(f"Login successful for {username}", "SUCCESS")
            return True
        self.log(f"Login failed for {username}", "FAIL")
        return False

    def run_all_tests(self):
        """Run all test scenarios"""
        self.log("=" * 60, "INFO")
        self.log("BACKEND API TESTING - FEATURE 1 & 3", "INFO")
        self.log("=" * 60, "INFO")

        # ===== LOGIN =====
        self.log("\n[1] LOGIN TESTS", "INFO")
        if not self.login("qa_sales_tmp", "QaTest12345", self.sales_session):
            self.log("Cannot proceed without sales login", "FAIL")
            return 1
        
        if not self.login("qa_admin_tmp", "QaTest12345", self.admin_session):
            self.log("Cannot proceed without admin login", "FAIL")
            return 1

        # ===== FEATURE 1 BACKEND TESTS =====
        self.log("\n[2] FEATURE 1 - SALES ORDER BACKEND TESTS", "INFO")
        
        # FE1a: Test GET /api/customers (for autocomplete)
        success, customers_resp = self.test(
            "FE1a: GET /api/customers for autocomplete",
            "GET",
            "/customers",
            200,
            data={"q": "yok", "limit": 20},
            session=self.sales_session
        )
        if success:
            items = customers_resp.get('items', [])
            self.log(f"Found {len(items)} customers", "SUCCESS")
            if len(items) > 0:
                self.log(f"Sample customer: {items[0].get('name', 'N/A')}", "INFO")

        # FE1c: Test GET /api/sales-users (for sales name picker)
        success, sales_users_resp = self.test(
            "FE1c: GET /api/sales-users for sales name picker",
            "GET",
            "/sales-users",
            200,
            session=self.sales_session
        )
        if success:
            items = sales_users_resp.get('items', [])
            self.log(f"Found {len(items)} sales users", "SUCCESS")
            if len(items) > 0:
                self.log(f"Sample sales user: {items[0].get('name', 'N/A')} ({items[0].get('role', 'N/A')})", "INFO")

        # FE1d: Test POST /api/sales-orders/full with sales_name
        random_num = random.randint(1000, 9999)
        so_no = f"00{random_num}"
        
        so_payload = {
            "so_no": so_no,
            "so_date": datetime.now().strftime("%Y-%m-%d"),
            "customer": "Test Customer Auto",
            "customer_address": "Test Address",
            "po_customer_no": f"PO-{random_num}",
            "sales_name": "Nicholas Test",
            "currency": "IDR",
            "items": [
                {"name": "Test Item 1", "qty": 10, "unit": "pcs", "price": 100000},
                {"name": "Test Item 2", "qty": 5, "unit": "pcs", "price": 50000}
            ]
        }
        
        success, so_resp = self.test(
            "FE1d: POST /api/sales-orders/full with sales_name",
            "POST",
            "/sales-orders/full",
            200,
            data=so_payload,
            session=self.sales_session
        )
        
        if success:
            self.created_so_id = so_resp.get('id')
            self.log(f"Created SO: {so_resp.get('so_no')} with sales_name: {so_resp.get('sales_name')}", "SUCCESS")
            
            # Verify sales_name is saved
            if so_resp.get('sales_name') == "Nicholas Test":
                self.log("sales_name correctly saved", "SUCCESS")
            else:
                self.log(f"sales_name mismatch: expected 'Nicholas Test', got '{so_resp.get('sales_name')}'", "FAIL")

        # FE1d: Test GET /api/sales-orders returns drawing summary fields
        success, so_list_resp = self.test(
            "FE1d: GET /api/sales-orders with drawing summary",
            "GET",
            "/sales-orders",
            200,
            data={"q": so_no},
            session=self.sales_session
        )
        
        if success and isinstance(so_list_resp, list) and len(so_list_resp) > 0:
            so = so_list_resp[0]
            has_drawing_status = 'drawing_request_status' in so
            has_drawing_count = 'drawing_count' in so
            has_drawings = 'drawings' in so
            
            if has_drawing_status and has_drawing_count and has_drawings:
                self.log(f"SO has drawing summary fields: status={so.get('drawing_request_status')}, count={so.get('drawing_count')}", "SUCCESS")
            else:
                self.log(f"Missing drawing summary fields: status={has_drawing_status}, count={has_drawing_count}, drawings={has_drawings}", "FAIL")

        # ===== FEATURE 3 BACKEND TESTS =====
        self.log("\n[3] FEATURE 3 - QUOTATION CONFIRM ORDER LOCK TESTS", "INFO")
        
        # Create a quotation first
        random_cust = random.randint(1000, 9999)
        quo_payload = {
            "customer_name": f"Test Customer {random_cust}",
            "customer_address": "Test Address",
            "attention": "Test PIC",
            "items": [
                {"no": 1, "description": "Test Item", "qty": 10, "unit": "EA", "unit_price": 100000}
            ],
            "total_amount": 1000000,
            "currency": "IDR",
            "payment_term": "30 days",
            "delivery_time": "6-8 weeks",
            "validity": "30 days"
        }
        
        success, quo_resp = self.test(
            "Create test quotation",
            "POST",
            "/quotations",
            200,
            data=quo_payload,
            session=self.sales_session
        )
        
        if not success:
            self.log("Cannot proceed with FE3 tests without quotation", "FAIL")
            return
        
        self.created_quotation_id = quo_resp.get('id')
        quo_no = quo_resp.get('quotation_no')
        self.log(f"Created quotation: {quo_no}", "SUCCESS")

        # Set quotation to confirm_order status
        random_so = random.randint(10000, 99999)
        so_num_str = str(random_so)[:6]  # max 6 digits
        
        success, confirm_resp = self.test(
            "Set quotation to confirm_order",
            "PATCH",
            f"/quotations/{self.created_quotation_id}/status",
            200,
            data={"status": "confirm_order", "so_no": so_num_str},
            session=self.sales_session
        )
        
        if not success:
            self.log("Cannot proceed with lock tests without confirm_order status", "FAIL")
            return
        
        self.log(f"Quotation {quo_no} set to confirm_order with SO {so_num_str}", "SUCCESS")

        # FE3: Test EDIT lock - PATCH /api/quotations/{id} should fail 400
        edit_payload = {
            "customer_name": "Updated Customer Name",
            "revision_reason": "Test edit after confirm"
        }
        
        success, edit_resp = self.test(
            "FE3: PATCH /api/quotations/{id} after confirm_order (should fail 400)",
            "PATCH",
            f"/quotations/{self.created_quotation_id}",
            400,
            data=edit_payload,
            session=self.sales_session
        )
        
        if success:
            self.log("Edit correctly blocked after confirm_order", "SUCCESS")
        else:
            self.log("Edit should be blocked but wasn't", "FAIL")

        # FE3: Test STATUS lock - Sales cannot change status from confirm_order
        success, status_resp = self.test(
            "FE3: PATCH /api/quotations/{id}/status by SALES to on_bidding (should fail 400)",
            "PATCH",
            f"/quotations/{self.created_quotation_id}/status",
            400,
            data={"status": "on_bidding"},
            session=self.sales_session
        )
        
        if success:
            self.log("Status change correctly blocked for sales after confirm_order", "SUCCESS")
        else:
            self.log("Status change should be blocked for sales but wasn't", "FAIL")

        # FE3: Test STATUS lock - Admin CAN change status from confirm_order
        success, admin_status_resp = self.test(
            "FE3: PATCH /api/quotations/{id}/status by ADMIN to on_bidding (should succeed 200)",
            "PATCH",
            f"/quotations/{self.created_quotation_id}/status",
            200,
            data={"status": "on_bidding"},
            session=self.admin_session
        )
        
        if success:
            self.log("Admin can change status from confirm_order (correct)", "SUCCESS")
            
            # Set back to confirm_order for delete tests
            self.test(
                "Set back to confirm_order for delete tests",
                "PATCH",
                f"/quotations/{self.created_quotation_id}/status",
                200,
                data={"status": "confirm_order", "so_no": so_num_str},
                session=self.admin_session
            )

        # FE3: Test DELETE lock - Sales cannot delete confirm_order quotation
        success, delete_sales_resp = self.test(
            "FE3: DELETE /api/quotations/{id} by SALES (should fail 403)",
            "DELETE",
            f"/quotations/{self.created_quotation_id}",
            403,
            session=self.sales_session
        )
        
        if success:
            self.log("Delete correctly blocked for sales after confirm_order", "SUCCESS")
        else:
            self.log("Delete should be blocked for sales but wasn't", "FAIL")

        # FE3: Test DELETE lock - Admin without reason should fail 400
        success, delete_admin_no_reason = self.test(
            "FE3: DELETE /api/quotations/{id} by ADMIN without reason (should fail 400)",
            "DELETE",
            f"/quotations/{self.created_quotation_id}",
            400,
            session=self.admin_session
        )
        
        if success:
            self.log("Delete correctly requires reason for admin", "SUCCESS")
        else:
            self.log("Delete should require reason but didn't", "FAIL")

        # FE3: Test DELETE lock - Admin with reason should succeed
        success, delete_admin_with_reason = self.test(
            "FE3: DELETE /api/quotations/{id} by ADMIN with reason (should succeed 200)",
            "DELETE",
            f"/quotations/{self.created_quotation_id}",
            200,
            data={"reason": "Testing delete with admin authorization"},
            session=self.admin_session
        )
        
        if success:
            self.log("Admin can delete with reason (correct)", "SUCCESS")

        # FE3 REGRESSION: Test quotation NOT in confirm_order can be edited/deleted by sales
        self.log("\n[4] FEATURE 3 REGRESSION - Non-confirmed quotation", "INFO")
        
        # Create another quotation for regression test
        quo_payload2 = {
            "customer_name": f"Regression Test {random.randint(1000, 9999)}",
            "customer_address": "Test Address",
            "attention": "Test PIC",
            "items": [
                {"no": 1, "description": "Regression Item", "qty": 5, "unit": "EA", "unit_price": 50000}
            ],
            "total_amount": 250000,
            "currency": "IDR",
            "payment_term": "30 days",
            "delivery_time": "4 weeks",
            "validity": "30 days"
        }
        
        success, quo_resp2 = self.test(
            "Create quotation for regression test (on_bidding)",
            "POST",
            "/quotations",
            200,
            data=quo_payload2,
            session=self.sales_session
        )
        
        if success:
            quo_id2 = quo_resp2.get('id')
            quo_no2 = quo_resp2.get('quotation_no')
            
            # Test EDIT on non-confirmed quotation (should succeed)
            success, edit_resp2 = self.test(
                "FE3 Regression: PATCH /api/quotations/{id} on on_bidding (should succeed 200)",
                "PATCH",
                f"/quotations/{quo_id2}",
                200,
                data={"customer_name": "Updated Name", "revision_reason": "Test edit"},
                session=self.sales_session
            )
            
            if success:
                self.log("Sales can edit on_bidding quotation (correct)", "SUCCESS")
            
            # Test DELETE on non-confirmed quotation (should succeed)
            success, delete_resp2 = self.test(
                "FE3 Regression: DELETE /api/quotations/{id} on on_bidding (should succeed 200)",
                "DELETE",
                f"/quotations/{quo_id2}",
                200,
                session=self.sales_session
            )
            
            if success:
                self.log("Sales can delete on_bidding quotation (correct)", "SUCCESS")

        # ===== SUMMARY =====
        self.log("\n" + "=" * 60, "INFO")
        self.log("TEST SUMMARY", "INFO")
        self.log("=" * 60, "INFO")
        self.log(f"Total Tests: {self.tests_run}", "INFO")
        self.log(f"Passed: {self.tests_passed}", "SUCCESS")
        self.log(f"Failed: {self.tests_failed}", "FAIL")
        self.log(f"Success Rate: {(self.tests_passed/self.tests_run*100):.1f}%", "INFO")
        
        return 0 if self.tests_failed == 0 else 1

def main():
    runner = TestRunner()
    return runner.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())
