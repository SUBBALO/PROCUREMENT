#!/usr/bin/env python3
"""HRD Payroll Module Backend API Testing - Two-tier PIN + Granular Permissions"""
import requests
import sys
from datetime import datetime

BASE_URL = "https://error-fix-dev.preview.emergentagent.com/api"

class HRDTester:
    def __init__(self):
        self.base_url = BASE_URL
        self.session = requests.Session()
        self.tests_run = 0
        self.tests_passed = 0
        self.portal_token = None
        self.gaji_token = None
        self.test_employee_id = None
        self.test_payslip_id = None
        
    def log(self, msg, level="INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] [{level}] {msg}")
    
    def run_test(self, name, method, endpoint, expected_status, data=None, headers_extra=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if headers_extra:
            headers.update(headers_extra)
        
        self.tests_run += 1
        self.log(f"Testing: {name}")
        
        try:
            if method == 'GET':
                response = self.session.get(url, headers=headers, timeout=15)
            elif method == 'POST':
                response = self.session.post(url, json=data, headers=headers, timeout=15)
            elif method == 'PUT':
                response = self.session.put(url, json=data, headers=headers, timeout=15)
            elif method == 'DELETE':
                response = self.session.delete(url, headers=headers, timeout=15)
            else:
                self.log(f"Unknown method {method}", "ERROR")
                return False, {}
            
            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                self.log(f"✅ PASSED - Status: {response.status_code}", "PASS")
            else:
                self.log(f"❌ FAILED - Expected {expected_status}, got {response.status_code}", "FAIL")
                try:
                    self.log(f"Response: {response.text[:300]}", "FAIL")
                except Exception:
                    pass
            
            try:
                return success, response.json() if response.text else {}
            except ValueError:
                return success, {}
        
        except Exception as e:
            self.log(f"❌ FAILED - Error: {str(e)}", "FAIL")
            return False, {}
    
    def login(self, username, password):
        """Login and store session cookies"""
        self.log(f"\n{'='*60}")
        self.log(f"Logging in as: {username}")
        self.log(f"{'='*60}")
        success, response = self.run_test(
            f"Login as {username}",
            "POST",
            "auth/login",
            200,
            data={"username": username, "password": password}
        )
        if success:
            self.log(f"✅ Login successful - Role: {response.get('role')}", "PASS")
            return True
        self.log(f"❌ Login failed", "FAIL")
        return False
    
    def logout(self):
        """Logout to clear session"""
        self.log("\nLogging out...")
        self.session.post(f"{self.base_url}/auth/logout")
        self.portal_token = None
        self.gaji_token = None
    
    # ==================== Test Cases ====================
    
    def test_my_access(self, expected_can_enter=True):
        """Test GET /api/hrd/my-access"""
        self.log("\n--- Testing my-access endpoint ---")
        success, response = self.run_test(
            "Get my HRD access",
            "GET",
            "hrd/my-access",
            200
        )
        if success:
            self.log(f"  can_enter: {response.get('can_enter')}")
            self.log(f"  portal_pin_set: {response.get('portal_pin_set')}")
            self.log(f"  gaji_pin_set: {response.get('gaji_pin_set')}")
            self.log(f"  can_manage_gaji_pin: {response.get('can_manage_gaji_pin')}")
            self.log(f"  is_super: {response.get('is_super')}")
            if response.get('can_enter') == expected_can_enter:
                self.log(f"✅ can_enter matches expected: {expected_can_enter}", "PASS")
            else:
                self.log(f"❌ can_enter mismatch - expected {expected_can_enter}, got {response.get('can_enter')}", "FAIL")
        return success, response
    
    def test_portal_pin_verify(self, pin, expected_status=200):
        """Test POST /api/hrd/portal-pin/verify"""
        self.log(f"\n--- Testing portal PIN verification (pin: {pin}) ---")
        success, response = self.run_test(
            f"Verify portal PIN: {pin}",
            "POST",
            "hrd/portal-pin/verify",
            expected_status,
            data={"pin": pin}
        )
        if success and expected_status == 200:
            self.portal_token = response.get('portal_token')
            self.log(f"✅ Portal token obtained: {self.portal_token[:20]}...", "PASS")
        return success, response
    
    def test_gaji_pin_verify(self, pin, expected_status=200):
        """Test POST /api/hrd/verify-pin (requires portal token)"""
        self.log(f"\n--- Testing gaji PIN verification (pin: {pin}) ---")
        headers = {}
        if self.portal_token:
            headers['x-hrd-token'] = self.portal_token
        success, response = self.run_test(
            f"Verify gaji PIN: {pin}",
            "POST",
            "hrd/verify-pin",
            expected_status,
            data={"pin": pin},
            headers_extra=headers
        )
        if success and expected_status == 200:
            self.gaji_token = response.get('gaji_token')
            self.log(f"✅ Gaji token obtained: {self.gaji_token[:20]}...", "PASS")
        return success, response
    
    def test_employees_list(self, expected_status=200, with_gaji_token=True):
        """Test GET /api/hrd/employees (requires portal + gaji tokens)"""
        self.log("\n--- Testing employees list ---")
        headers = {}
        if self.portal_token:
            headers['x-hrd-token'] = self.portal_token
        if with_gaji_token and self.gaji_token:
            headers['x-hrd-gaji'] = self.gaji_token
        
        success, response = self.run_test(
            "Get employees list",
            "GET",
            "hrd/employees",
            expected_status,
            headers_extra=headers
        )
        if success and expected_status == 200:
            items = response.get('items', [])
            self.log(f"  Found {len(items)} employees")
            if items:
                self.log(f"  Sample: {items[0].get('nama')} ({items[0].get('nik')})")
        return success, response
    
    def test_payslips_list(self, month=7, year=2026, expected_status=200, with_gaji_token=True):
        """Test GET /api/hrd/payslips (requires portal + gaji tokens)"""
        self.log(f"\n--- Testing payslips list (month={month}, year={year}) ---")
        headers = {}
        if self.portal_token:
            headers['x-hrd-token'] = self.portal_token
        if with_gaji_token and self.gaji_token:
            headers['x-hrd-gaji'] = self.gaji_token
        
        success, response = self.run_test(
            f"Get payslips for {month}/{year}",
            "GET",
            f"hrd/payslips?month={month}&year={year}",
            expected_status,
            headers_extra=headers
        )
        if success and expected_status == 200:
            items = response.get('items', [])
            self.log(f"  Found {len(items)} payslips")
            if items:
                slip = items[0]
                self.test_payslip_id = slip.get('id')
                self.log(f"  Sample: {slip.get('nama')} - Gross: {slip.get('gross')}, Net: {slip.get('net')}, Take Home: {slip.get('take_home')}")
        return success, response
    
    def test_payslip_pdf(self, payslip_id, expected_status=200):
        """Test GET /api/hrd/payslips/{id}/pdf"""
        self.log(f"\n--- Testing payslip PDF generation ---")
        headers = {}
        if self.portal_token:
            headers['x-hrd-token'] = self.portal_token
        if self.gaji_token:
            headers['x-hrd-gaji'] = self.gaji_token
        
        url = f"{self.base_url}/hrd/payslips/{payslip_id}/pdf"
        self.tests_run += 1
        try:
            response = self.session.get(url, headers=headers, timeout=15)
            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                content_type = response.headers.get('content-type', '')
                if 'application/pdf' in content_type:
                    self.log(f"✅ PASSED - PDF generated, size: {len(response.content)} bytes", "PASS")
                else:
                    self.log(f"❌ FAILED - Wrong content type: {content_type}", "FAIL")
            else:
                self.log(f"❌ FAILED - Expected {expected_status}, got {response.status_code}", "FAIL")
            return success
        except Exception as e:
            self.log(f"❌ FAILED - Error: {str(e)}", "FAIL")
            return False
    
    def test_import_template(self, expected_status=200):
        """Test GET /api/hrd/import-template"""
        self.log("\n--- Testing import template download ---")
        headers = {}
        if self.portal_token:
            headers['x-hrd-token'] = self.portal_token
        if self.gaji_token:
            headers['x-hrd-gaji'] = self.gaji_token
        
        url = f"{self.base_url}/hrd/import-template"
        self.tests_run += 1
        try:
            response = self.session.get(url, headers=headers, timeout=15)
            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                content_type = response.headers.get('content-type', '')
                if 'spreadsheet' in content_type or 'excel' in content_type:
                    self.log(f"✅ PASSED - Template downloaded, size: {len(response.content)} bytes", "PASS")
                else:
                    self.log(f"❌ FAILED - Wrong content type: {content_type}", "FAIL")
            else:
                self.log(f"❌ FAILED - Expected {expected_status}, got {response.status_code}", "FAIL")
            return success
        except Exception as e:
            self.log(f"❌ FAILED - Error: {str(e)}", "FAIL")
            return False
    
    def test_settings_get(self, expected_status=200):
        """Test GET /api/hrd/settings"""
        self.log("\n--- Testing settings GET ---")
        headers = {}
        if self.portal_token:
            headers['x-hrd-token'] = self.portal_token
        if self.gaji_token:
            headers['x-hrd-gaji'] = self.gaji_token
        
        success, response = self.run_test(
            "Get HRD settings",
            "GET",
            "hrd/settings",
            expected_status,
            headers_extra=headers
        )
        if success and expected_status == 200:
            self.log(f"  gmail_user: {response.get('gmail_user')}")
            self.log(f"  sender_name: {response.get('sender_name')}")
            self.log(f"  has_app_password: {response.get('has_app_password')}")
            # Verify app_password is NOT returned
            if 'app_password' in response:
                self.log(f"❌ SECURITY ISSUE - app_password should not be returned!", "FAIL")
            else:
                self.log(f"✅ Security OK - app_password not exposed", "PASS")
        return success, response
    
    def test_blast_validation(self, expected_status=400):
        """Test POST /api/hrd/blast without Gmail configured"""
        self.log("\n--- Testing blast validation (should fail without Gmail config) ---")
        headers = {}
        if self.portal_token:
            headers['x-hrd-token'] = self.portal_token
        if self.gaji_token:
            headers['x-hrd-gaji'] = self.gaji_token
        
        success, response = self.run_test(
            "Blast without Gmail config",
            "POST",
            "hrd/blast",
            expected_status,
            data={"month": 7, "year": 2026},
            headers_extra=headers
        )
        return success, response
    
    def test_logs(self, expected_status=200):
        """Test GET /api/hrd/logs"""
        self.log("\n--- Testing HRD logs ---")
        headers = {}
        if self.portal_token:
            headers['x-hrd-token'] = self.portal_token
        
        success, response = self.run_test(
            "Get HRD logs",
            "GET",
            "hrd/logs",
            expected_status,
            headers_extra=headers
        )
        if success and expected_status == 200:
            items = response.get('items', [])
            self.log(f"  Found {len(items)} log entries")
            if items:
                self.log(f"  Latest: {items[0].get('action_label')} by {items[0].get('username')}")
        return success, response
    
    def test_employee_crud(self):
        """Test employee CRUD operations"""
        self.log("\n--- Testing Employee CRUD ---")
        headers = {}
        if self.portal_token:
            headers['x-hrd-token'] = self.portal_token
        if self.gaji_token:
            headers['x-hrd-gaji'] = self.gaji_token
        
        # CREATE
        employee_data = {
            "nik": "ZZTEST001",
            "nama": "ZZTEST Employee",
            "email": "zztest@test.com",
            "jabatan": "Test Position",
            "no_rekening": "1234567890",
            "bank": "Test Bank"
        }
        success, response = self.run_test(
            "Create test employee",
            "POST",
            "hrd/employees",
            200,
            data=employee_data,
            headers_extra=headers
        )
        if success:
            self.test_employee_id = response.get('id')
            self.log(f"  Created employee ID: {self.test_employee_id}")
            
            # UPDATE
            update_data = employee_data.copy()
            update_data['jabatan'] = "Updated Position"
            success2, response2 = self.run_test(
                "Update test employee",
                "PUT",
                f"hrd/employees/{self.test_employee_id}",
                200,
                data=update_data,
                headers_extra=headers
            )
            
            # DELETE
            success3, response3 = self.run_test(
                "Delete test employee",
                "DELETE",
                f"hrd/employees/{self.test_employee_id}",
                200,
                headers_extra=headers
            )
            return success and success2 and success3
        return False
    
    def test_set_pin_authorization(self, expected_status=403):
        """Test POST /api/hrd/set-pin authorization (should fail for non-gaji users)"""
        self.log("\n--- Testing set-pin authorization ---")
        success, response = self.run_test(
            "Set gaji PIN (should fail)",
            "POST",
            "hrd/set-pin",
            expected_status,
            data={"pin": "9999"}
        )
        return success, response
    
    def test_portal_pin_set_authorization(self, expected_status=403):
        """Test POST /api/hrd/portal-pin/set authorization"""
        self.log("\n--- Testing portal-pin/set authorization ---")
        success, response = self.run_test(
            "Set portal PIN (should fail for non-HRD)",
            "POST",
            "hrd/portal-pin/set",
            expected_status,
            data={"pin": "9999"}
        )
        return success, response

def main():
    tester = HRDTester()
    
    print("\n" + "="*80)
    print("HRD PAYROLL MODULE - BACKEND API TESTING")
    print("Two-tier PIN System + Granular Permissions")
    print("="*80)
    
    # ========== Test 1: herliana (gaji access) ==========
    if not tester.login("herliana", "hrd123"):
        print("\n❌ Cannot proceed - herliana login failed")
        return 1
    
    # Test my-access
    success, access_data = tester.test_my_access(expected_can_enter=True)
    
    # Test portal PIN verification
    tester.test_portal_pin_verify("1111", expected_status=200)  # Correct PIN
    tester.test_portal_pin_verify("9999", expected_status=401)  # Wrong PIN
    
    # Re-verify with correct PIN for subsequent tests
    tester.test_portal_pin_verify("1111", expected_status=200)
    
    # Test gaji PIN verification
    tester.test_gaji_pin_verify("123456", expected_status=200)  # Correct PIN
    tester.test_gaji_pin_verify("999999", expected_status=401)  # Wrong PIN
    
    # Re-verify with correct PIN
    tester.test_gaji_pin_verify("123456", expected_status=200)
    
    # Test gaji menu requires gaji token
    tester.log("\n--- Testing gaji menu WITHOUT gaji token (should fail) ---")
    temp_gaji = tester.gaji_token
    tester.gaji_token = None
    tester.test_payslips_list(expected_status=401, with_gaji_token=False)
    tester.gaji_token = temp_gaji
    
    # Test with both tokens
    tester.test_employees_list(expected_status=200)
    tester.test_payslips_list(month=7, year=2026, expected_status=200)
    
    # Test PDF generation
    if tester.test_payslip_id:
        tester.test_payslip_pdf(tester.test_payslip_id, expected_status=200)
    
    # Test import template
    tester.test_import_template(expected_status=200)
    
    # Test settings
    tester.test_settings_get(expected_status=200)
    
    # Test blast validation
    tester.test_blast_validation(expected_status=400)
    
    # Test logs
    tester.test_logs(expected_status=200)
    
    # Test employee CRUD
    tester.test_employee_crud()
    
    tester.logout()
    
    # ========== Test 2: heri (dokumen only, NO gaji access) ==========
    if not tester.login("heri", "hrd123"):
        print("\n❌ Cannot proceed - heri login failed")
        return 1
    
    tester.test_my_access(expected_can_enter=True)
    
    # heri should NOT be able to access gaji menus
    tester.log("\n--- Testing heri (dokumen only) access to gaji menus ---")
    tester.test_employees_list(expected_status=403, with_gaji_token=False)
    tester.test_payslips_list(expected_status=403, with_gaji_token=False)
    
    tester.logout()
    
    # ========== Test 3: admin (non-super, no HRD access) ==========
    if not tester.login("admin", "admin123"):
        print("\n❌ Cannot proceed - admin login failed")
        return 1
    
    tester.test_my_access(expected_can_enter=False)
    
    # admin should NOT be able to access HRD
    tester.log("\n--- Testing admin (no HRD access) ---")
    tester.test_employees_list(expected_status=403, with_gaji_token=False)
    tester.test_set_pin_authorization(expected_status=403)
    tester.test_portal_pin_set_authorization(expected_status=403)
    
    tester.logout()
    
    # ========== Final Report ==========
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    print(f"Total Tests Run: {tester.tests_run}")
    print(f"Tests Passed: {tester.tests_passed}")
    print(f"Tests Failed: {tester.tests_run - tester.tests_passed}")
    print(f"Success Rate: {(tester.tests_passed / tester.tests_run * 100):.1f}%")
    print("="*80)
    
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())
