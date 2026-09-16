"""
Comprehensive Sales Department Testing
Tests: Inquiry, Quotation, Sales Order, Customer Master
Credentials: zztest_admin / ZzTest#2026 (admin), zztest_sales / ZzTest#2026 (sales)
"""
import requests
import sys
from datetime import datetime

BASE_URL = "https://error-fix-dev.preview.emergentagent.com/api"

class SalesDeptTester:
    def __init__(self):
        self.admin_token = None
        self.sales_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.created_ids = {
            "inquiries": [],
            "quotations": [],
            "sales_orders": [],
            "customers": []
        }
    
    def log(self, msg, status="INFO"):
        prefix = "✅" if status == "PASS" else "❌" if status == "FAIL" else "🔍"
        print(f"{prefix} {msg}")
    
    def test(self, name, method, endpoint, expected_status, token=None, data=None, params=None):
        """Run a single API test"""
        url = f"{BASE_URL}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Cookie'] = f'access_token={token}'
        
        self.tests_run += 1
        self.log(f"Testing {name}...", "INFO")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, params=params)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers)
            elif method == 'PATCH':
                response = requests.patch(url, json=data, headers=headers, params=params)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, params=params)
            
            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                self.log(f"PASS - {name} (Status: {response.status_code})", "PASS")
                try:
                    return True, response.json()
                except Exception:
                    return True, {}
            else:
                self.log(f"FAIL - {name} - Expected {expected_status}, got {response.status_code}", "FAIL")
                try:
                    self.log(f"  Response: {response.json()}", "FAIL")
                except Exception:
                    self.log(f"  Response: {response.text[:200]}", "FAIL")
                return False, {}
        
        except Exception as e:
            self.log(f"FAIL - {name} - Error: {str(e)}", "FAIL")
            return False, {}
    
    def login(self, username, password):
        """Login and get token"""
        self.log(f"Logging in as {username}...", "INFO")
        success, response = self.test(
            f"Login {username}",
            "POST",
            "auth/login",
            200,
            data={"username": username, "password": password}
        )
        if success:
            # Extract token from Set-Cookie header
            try:
                resp = requests.post(f"{BASE_URL}/auth/login", json={"username": username, "password": password})
                cookies = resp.cookies
                token = cookies.get('access_token')
                if token:
                    self.log(f"Login successful for {username}", "PASS")
                    return token
            except Exception as e:
                self.log(f"Failed to extract token: {e}", "FAIL")
        return None
    
    def test_inquiry_flow(self):
        """Test Inquiry CRUD + next-no preview"""
        self.log("\n=== TESTING INQUIRY FLOW ===", "INFO")
        
        # 1. Preview next-no (should NOT increment counter)
        success, resp = self.test(
            "Inquiry next-no preview (call 1)",
            "GET",
            "inquiries/next-no",
            200,
            token=self.sales_token
        )
        first_no = resp.get("inquiry_no", "") if success else ""
        
        success2, resp2 = self.test(
            "Inquiry next-no preview (call 2 - should be same)",
            "GET",
            "inquiries/next-no",
            200,
            token=self.sales_token
        )
        second_no = resp2.get("inquiry_no", "") if success2 else ""
        
        if first_no and second_no and first_no == second_no:
            self.log(f"✓ Next-no preview is non-incrementing: {first_no}", "PASS")
        else:
            self.log(f"✗ Next-no preview incremented: {first_no} -> {second_no}", "FAIL")
        
        # 2. Create inquiry (ZZTEST)
        inquiry_data = {
            "title": "ZZTEST Inquiry Test Project",
            "customer_name": "ZZTEST Customer Corp",
            "project_name": "ZZTEST Project Alpha",
            "customer_deadline": "2026-12-31",
            "description": "ZZTEST inquiry for comprehensive testing",
            "items": [
                {"item_name": "ZZTEST Item 1", "qty": 10, "unit": "EA", "specification": "Test spec"}
            ],
            "save_as_draft": False
        }
        success, resp = self.test(
            "Create Inquiry (ZZTEST)",
            "POST",
            "inquiries",
            200,
            token=self.sales_token,
            data=inquiry_data
        )
        inquiry_id = resp.get("id", "") if success else ""
        if inquiry_id:
            self.created_ids["inquiries"].append(inquiry_id)
            self.log(f"Created inquiry: {inquiry_id} - {resp.get('inquiry_no')}", "PASS")
        
        # 3. List inquiries
        success, resp = self.test(
            "List Inquiries",
            "GET",
            "inquiries",
            200,
            token=self.sales_token
        )
        if success:
            items = resp.get("items", [])
            zztest_count = sum(1 for i in items if "ZZTEST" in i.get("title", ""))
            self.log(f"Found {zztest_count} ZZTEST inquiries in list", "PASS")
        
        # 4. Get inquiry detail
        if inquiry_id:
            success, resp = self.test(
                "Get Inquiry Detail",
                "GET",
                f"inquiries/{inquiry_id}",
                200,
                token=self.sales_token
            )
        
        # 5. Update inquiry (draft only, but we created as submitted, so skip)
        # 6. Get masterlist
        success, resp = self.test(
            "Get Inquiry Masterlist",
            "GET",
            "inquiries/masterlist",
            200,
            token=self.admin_token
        )
    
    def test_quotation_flow(self):
        """Test Quotation CRUD + PDF + status change"""
        self.log("\n=== TESTING QUOTATION FLOW ===", "INFO")
        
        # 1. Preview next-no
        success, resp = self.test(
            "Quotation next-no preview",
            "GET",
            "quotations/next-no",
            200,
            token=self.sales_token
        )
        
        # 2. Create quotation (ZZTEST)
        quo_data = {
            "customer_name": "ZZTEST Quotation Customer",
            "customer_address": "ZZTEST Address 123",
            "attention": "ZZTEST PIC",
            "items": [
                {"no": 1, "description": "ZZTEST Product A", "qty": 5, "unit": "EA", "unit_price": 1000000}
            ],
            "total_amount": 5000000,
            "currency": "IDR",
            "payment_term": "50% Down Payment, Balance before delivery",
            "delivery_time": "6-8 Weeks after PO",
            "validity": "30 Days from date of quotation"
        }
        success, resp = self.test(
            "Create Quotation (ZZTEST)",
            "POST",
            "quotations",
            200,
            token=self.sales_token,
            data=quo_data
        )
        quo_id = resp.get("id", "") if success else ""
        if quo_id:
            self.created_ids["quotations"].append(quo_id)
            self.log(f"Created quotation: {quo_id} - {resp.get('quotation_no')}", "PASS")
        
        # 3. List quotations
        success, resp = self.test(
            "List Quotations",
            "GET",
            "quotations",
            200,
            token=self.sales_token
        )
        
        # 4. Get quotation detail
        if quo_id:
            success, resp = self.test(
                "Get Quotation Detail",
                "GET",
                f"quotations/{quo_id}",
                200,
                token=self.sales_token
            )
        
        # 5. Test PDF generation
        if quo_id:
            success, resp = self.test(
                "Generate Quotation PDF",
                "GET",
                f"quotations/{quo_id}/pdf",
                200,
                token=self.sales_token
            )
        
        # 6. Test status change (on_bidding -> cancel)
        if quo_id:
            success, resp = self.test(
                "Update Quotation Status to Cancel",
                "PATCH",
                f"quotations/{quo_id}/status",
                200,
                token=self.sales_token,
                data={"status": "cancel"}
            )
    
    def test_sales_order_flow(self):
        """Test Sales Order CRUD + delete permissions"""
        self.log("\n=== TESTING SALES ORDER FLOW ===", "INFO")
        
        # 1. Create SO (full)
        so_data = {
            "so_no": "009999",  # ZZTEST SO number
            "so_date": datetime.now().strftime("%Y-%m-%d"),
            "customer": "ZZTEST SO Customer",
            "customer_address": "ZZTEST SO Address",
            "po_customer_no": "ZZTEST-PO-001",
            "sales_name": "ZZTEST Sales",
            "currency": "IDR",
            "items": [
                {"name": "ZZTEST SO Item 1", "qty": 3, "unit": "pcs", "price": 500000}
            ]
        }
        success, resp = self.test(
            "Create Sales Order (ZZTEST)",
            "POST",
            "sales-orders/full",
            200,
            token=self.sales_token,
            data=so_data
        )
        so_id = resp.get("id", "") if success else ""
        if so_id:
            self.created_ids["sales_orders"].append(so_id)
            self.log(f"Created SO: {so_id} - {resp.get('so_no')}", "PASS")
        
        # 2. List SOs
        success, resp = self.test(
            "List Sales Orders",
            "GET",
            "sales-orders",
            200,
            token=self.sales_token
        )
        
        # 3. Test autocomplete
        success, resp = self.test(
            "SO Autocomplete",
            "GET",
            "sales-orders/autocomplete",
            200,
            token=self.sales_token,
            params={"q": "009999"}
        )
        
        # 4. Test DELETE permission - SALES should get 403
        if so_id:
            success, resp = self.test(
                "Delete SO as SALES (should FAIL with 403)",
                "DELETE",
                f"sales-orders/{so_id}",
                403,  # Expect 403 for sales
                token=self.sales_token
            )
        
        # 5. Test DELETE permission - ADMIN should succeed
        if so_id:
            # Don't actually delete yet, we'll clean up later
            pass
        
        # 6. Create another SO for bulk delete test
        so_data2 = {
            "so_no": "009998",
            "so_date": datetime.now().strftime("%Y-%m-%d"),
            "customer": "ZZTEST SO Customer 2",
            "items": [{"name": "ZZTEST Item", "qty": 1, "unit": "pcs", "price": 100000}]
        }
        success, resp = self.test(
            "Create 2nd Sales Order for bulk delete",
            "POST",
            "sales-orders/full",
            200,
            token=self.admin_token,
            data=so_data2
        )
        so_id2 = resp.get("id", "") if success else ""
        if so_id2:
            self.created_ids["sales_orders"].append(so_id2)
        
        # 7. Test BULK DELETE permission - SALES should get 403
        if so_id and so_id2:
            success, resp = self.test(
                "Bulk Delete SO as SALES (should FAIL with 403)",
                "POST",
                "sales-orders/bulk-delete",
                403,
                token=self.sales_token,
                data={"ids": [so_id, so_id2]}
            )
    
    def test_customer_master(self):
        """Test Customer CRUD"""
        self.log("\n=== TESTING CUSTOMER MASTER ===", "INFO")
        
        # 1. Create customer
        cust_data = {
            "name": "ZZTEST Customer Master",
            "address": "ZZTEST Address Line 1",
            "pic": "ZZTEST PIC Name",
            "phone": "08123456789",
            "email": "zztest@example.com",
            "customer_code": "ZZTEST"
        }
        success, resp = self.test(
            "Create Customer (ZZTEST)",
            "POST",
            "customers",
            200,
            token=self.sales_token,
            data=cust_data
        )
        cust_id = resp.get("id", "") if success else ""
        if cust_id:
            self.created_ids["customers"].append(cust_id)
            self.log(f"Created customer: {cust_id}", "PASS")
        
        # 2. List customers
        success, resp = self.test(
            "List Customers",
            "GET",
            "customers",
            200,
            token=self.sales_token,
            params={"q": "ZZTEST"}
        )
        
        # 3. Update customer
        if cust_id:
            success, resp = self.test(
                "Update Customer",
                "PUT",
                f"customers/{cust_id}",
                200,
                token=self.sales_token,
                data={"address": "ZZTEST Updated Address"}
            )
        
        # 4. Upsert by name
        success, resp = self.test(
            "Upsert Customer by Name",
            "POST",
            "customers/upsert-by-name",
            200,
            token=self.sales_token,
            data={"name": "ZZTEST Upsert Customer", "customer_code": "ZZTUP"}
        )
        upsert_id = resp.get("id", "") if success else ""
        if upsert_id and upsert_id not in self.created_ids["customers"]:
            self.created_ids["customers"].append(upsert_id)
        
        # 5. Set customer code (as admin/eng)
        if cust_id:
            success, resp = self.test(
                "Set Customer Code",
                "PATCH",
                f"customers/{cust_id}/customer-code",
                200,
                token=self.admin_token,
                data={"customer_code": "ZZTST2"}
            )
    
    def cleanup(self):
        """Delete all ZZTEST data created during testing"""
        self.log("\n=== CLEANING UP TEST DATA ===", "INFO")
        
        # Delete Sales Orders (admin only)
        for so_id in self.created_ids["sales_orders"]:
            self.test(
                f"Cleanup SO {so_id}",
                "DELETE",
                f"sales-orders/{so_id}",
                200,
                token=self.admin_token
            )
        
        # Delete Quotations
        for quo_id in self.created_ids["quotations"]:
            self.test(
                f"Cleanup Quotation {quo_id}",
                "DELETE",
                f"quotations/{quo_id}",
                200,
                token=self.sales_token
            )
        
        # Delete Inquiries (soft delete not exposed, skip for now)
        # Inquiries don't have delete endpoint in the router
        
        # Delete Customers
        for cust_id in self.created_ids["customers"]:
            self.test(
                f"Cleanup Customer {cust_id}",
                "DELETE",
                f"customers/{cust_id}",
                200,
                token=self.sales_token
            )
        
        self.log("Cleanup complete", "PASS")
    
    def run_all_tests(self):
        """Run all sales department tests"""
        self.log("=== SALES DEPARTMENT COMPREHENSIVE TEST ===", "INFO")
        self.log(f"Base URL: {BASE_URL}", "INFO")
        
        # Login
        self.admin_token = self.login("zztest_admin", "ZzTest#2026")
        self.sales_token = self.login("zztest_sales", "ZzTest#2026")
        
        if not self.admin_token or not self.sales_token:
            self.log("CRITICAL: Login failed. Cannot proceed with tests.", "FAIL")
            return False
        
        # Run test suites
        self.test_inquiry_flow()
        self.test_quotation_flow()
        self.test_sales_order_flow()
        self.test_customer_master()
        
        # Cleanup
        self.cleanup()
        
        # Summary
        self.log("\n=== TEST SUMMARY ===", "INFO")
        self.log(f"Tests Run: {self.tests_run}", "INFO")
        self.log(f"Tests Passed: {self.tests_passed}", "PASS")
        self.log(f"Tests Failed: {self.tests_run - self.tests_passed}", "FAIL" if self.tests_run != self.tests_passed else "PASS")
        self.log(f"Success Rate: {(self.tests_passed / self.tests_run * 100):.1f}%", "INFO")
        
        return self.tests_passed == self.tests_run

def main():
    tester = SalesDeptTester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())
