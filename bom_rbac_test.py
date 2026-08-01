#!/usr/bin/env python3
"""
Backend RBAC Testing for BOM Menu
Tests cookie-based authentication and role-based access control for:
- File Costing Price attachments (costing/costing_prev/nesting_price)
- BOM purchase price history
- DWG & Customer drawing file download restrictions
"""
import requests
import sys
from typing import Optional

BASE_URL = "https://error-fix-dev.preview.emergentagent.com/api"

class BOMRBACTester:
    def __init__(self):
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.session = requests.Session()
        self.current_user = None
        
    def log(self, msg, level="INFO"):
        """Log test messages"""
        prefix = {
            "INFO": "ℹ️",
            "SUCCESS": "✅",
            "FAIL": "❌",
            "WARN": "⚠️"
        }.get(level, "•")
        print(f"{prefix} {msg}")
    
    def login(self, username: str, password: str) -> bool:
        """Login and store cookie"""
        self.tests_run += 1
        self.log(f"Logging in as {username}...", "INFO")
        try:
            resp = self.session.post(
                f"{BASE_URL}/auth/login",
                json={"username": username, "password": password}
            )
            if resp.status_code == 200:
                data = resp.json()
                self.current_user = data.get("user", {})
                self.log(f"Login successful - Role: {self.current_user.get('role')}", "SUCCESS")
                self.tests_passed += 1
                return True
            else:
                self.log(f"Login failed - Status: {resp.status_code}, Detail: {resp.text}", "FAIL")
                self.tests_failed += 1
                return False
        except Exception as e:
            self.log(f"Login error: {str(e)}", "FAIL")
            self.tests_failed += 1
            return False
    
    def logout(self):
        """Clear session"""
        self.session.cookies.clear()
        self.current_user = None
        self.log("Logged out", "INFO")
    
    def get_bom_list(self) -> Optional[str]:
        """Get first BOM ID from list"""
        try:
            resp = self.session.get(f"{BASE_URL}/bom", params={"limit": 10})
            if resp.status_code == 200:
                items = resp.json().get("items", [])
                if items:
                    bom_id = items[0].get("id")
                    so_no = items[0].get("so_no")
                    self.log(f"Found BOM: {so_no} (ID: {bom_id})", "INFO")
                    return bom_id
                else:
                    self.log("No BOMs found in database", "WARN")
                    return None
            else:
                self.log(f"Failed to get BOM list - Status: {resp.status_code}", "FAIL")
                return None
        except Exception as e:
            self.log(f"Error getting BOM list: {str(e)}", "FAIL")
            return None
    
    def test_attachments_endpoint(self, bom_id: str, expected_can_view_costing: bool, expected_preview_only: bool):
        """Test GET /api/bom/{id}/attachments"""
        self.tests_run += 1
        test_name = f"GET /bom/{bom_id}/attachments (role={self.current_user.get('role')})"
        self.log(f"Testing {test_name}...", "INFO")
        
        try:
            resp = self.session.get(f"{BASE_URL}/bom/{bom_id}/attachments")
            if resp.status_code != 200:
                self.log(f"FAIL - Expected 200, got {resp.status_code}", "FAIL")
                self.tests_failed += 1
                return False
            
            data = resp.json()
            can_view = data.get("can_view_costing", False)
            preview_only = data.get("drawing_preview_only", False)
            
            # Check flags
            if can_view != expected_can_view_costing:
                self.log(f"FAIL - can_view_costing: expected {expected_can_view_costing}, got {can_view}", "FAIL")
                self.tests_failed += 1
                return False
            
            if preview_only != expected_preview_only:
                self.log(f"FAIL - drawing_preview_only: expected {expected_preview_only}, got {preview_only}", "FAIL")
                self.tests_failed += 1
                return False
            
            # Check costing files are filtered for non-privileged roles
            if not expected_can_view_costing:
                costing_cats = ["costing", "costing_prev", "nesting_price"]
                attachments = data.get("attachments", {})
                for cat in costing_cats:
                    if attachments.get(cat) and len(attachments[cat]) > 0:
                        self.log(f"FAIL - Costing category '{cat}' should be empty for non-privileged role", "FAIL")
                        self.tests_failed += 1
                        return False
            
            self.log(f"PASS - can_view_costing={can_view}, drawing_preview_only={preview_only}", "SUCCESS")
            self.tests_passed += 1
            return True
            
        except Exception as e:
            self.log(f"FAIL - Error: {str(e)}", "FAIL")
            self.tests_failed += 1
            return False
    
    def test_purchases_endpoint(self, bom_id: str, should_succeed: bool):
        """Test GET /api/bom/{id}/purchases"""
        self.tests_run += 1
        test_name = f"GET /bom/{bom_id}/purchases (role={self.current_user.get('role')})"
        self.log(f"Testing {test_name}...", "INFO")
        
        try:
            resp = self.session.get(f"{BASE_URL}/bom/{bom_id}/purchases")
            
            if should_succeed:
                if resp.status_code == 200:
                    self.log(f"PASS - Got 200 as expected", "SUCCESS")
                    self.tests_passed += 1
                    return True
                else:
                    self.log(f"FAIL - Expected 200, got {resp.status_code}", "FAIL")
                    self.tests_failed += 1
                    return False
            else:
                if resp.status_code == 403:
                    self.log(f"PASS - Got 403 as expected (access denied)", "SUCCESS")
                    self.tests_passed += 1
                    return True
                else:
                    self.log(f"FAIL - Expected 403, got {resp.status_code}", "FAIL")
                    self.tests_failed += 1
                    return False
                    
        except Exception as e:
            self.log(f"FAIL - Error: {str(e)}", "FAIL")
            self.tests_failed += 1
            return False
    
    def create_temp_costing_attachment(self, bom_id: str) -> Optional[str]:
        """Create a temporary costing attachment for testing"""
        self.log(f"Creating temp costing attachment for BOM {bom_id}...", "INFO")
        try:
            # Create a minimal xlsx file (just a few bytes for testing)
            import io
            xlsx_content = b'PK\x03\x04' + b'\x00' * 100  # Minimal ZIP header (xlsx is a zip)
            
            files = {'file': ('test_costing.xlsx', io.BytesIO(xlsx_content), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
            data = {'category': 'costing', 'remark': 'Test attachment - will be deleted'}
            
            resp = self.session.post(
                f"{BASE_URL}/bom/{bom_id}/attachments",
                files=files,
                data=data
            )
            
            if resp.status_code in [200, 201]:
                attach_id = resp.json().get("attachment", {}).get("id")
                self.log(f"Created temp attachment: {attach_id}", "SUCCESS")
                return attach_id
            else:
                self.log(f"Failed to create attachment - Status: {resp.status_code}, Detail: {resp.text}", "WARN")
                return None
        except Exception as e:
            self.log(f"Error creating attachment: {str(e)}", "WARN")
            return None
    
    def test_attachment_download(self, bom_id: str, attach_id: str, should_succeed: bool, test_type: str):
        """Test attachment download endpoint"""
        self.tests_run += 1
        test_name = f"GET /bom/{bom_id}/attachments/{attach_id}/download ({test_type}, role={self.current_user.get('role')})"
        self.log(f"Testing {test_name}...", "INFO")
        
        try:
            resp = self.session.get(f"{BASE_URL}/bom/{bom_id}/attachments/{attach_id}/download")
            
            if should_succeed:
                if resp.status_code == 200:
                    self.log(f"PASS - Got 200 as expected", "SUCCESS")
                    self.tests_passed += 1
                    return True
                else:
                    self.log(f"FAIL - Expected 200, got {resp.status_code}", "FAIL")
                    self.tests_failed += 1
                    return False
            else:
                if resp.status_code == 403:
                    self.log(f"PASS - Got 403 as expected (access denied)", "SUCCESS")
                    self.tests_passed += 1
                    return True
                else:
                    self.log(f"FAIL - Expected 403, got {resp.status_code}", "FAIL")
                    self.tests_failed += 1
                    return False
                    
        except Exception as e:
            self.log(f"FAIL - Error: {str(e)}", "FAIL")
            self.tests_failed += 1
            return False
    
    def test_attachment_page_image(self, bom_id: str, attach_id: str, should_succeed: bool, test_type: str):
        """Test attachment page-image endpoint"""
        self.tests_run += 1
        test_name = f"GET /bom/{bom_id}/attachments/{attach_id}/page-image ({test_type}, role={self.current_user.get('role')})"
        self.log(f"Testing {test_name}...", "INFO")
        
        try:
            resp = self.session.get(f"{BASE_URL}/bom/{bom_id}/attachments/{attach_id}/page-image?page=0&scale=2")
            
            if should_succeed:
                if resp.status_code == 200:
                    self.log(f"PASS - Got 200 as expected", "SUCCESS")
                    self.tests_passed += 1
                    return True
                else:
                    self.log(f"FAIL - Expected 200, got {resp.status_code}", "FAIL")
                    self.tests_failed += 1
                    return False
            else:
                if resp.status_code == 403:
                    self.log(f"PASS - Got 403 as expected (access denied)", "SUCCESS")
                    self.tests_passed += 1
                    return True
                else:
                    self.log(f"FAIL - Expected 403, got {resp.status_code}", "FAIL")
                    self.tests_failed += 1
                    return False
                    
        except Exception as e:
            self.log(f"FAIL - Error: {str(e)}", "FAIL")
            self.tests_failed += 1
            return False
    
    def delete_attachment(self, bom_id: str, attach_id: str):
        """Delete a test attachment"""
        self.log(f"Deleting temp attachment {attach_id}...", "INFO")
        try:
            resp = self.session.delete(f"{BASE_URL}/bom/{bom_id}/attachments/{attach_id}")
            if resp.status_code in [200, 204]:
                self.log(f"Deleted attachment successfully", "SUCCESS")
            else:
                self.log(f"Failed to delete attachment - Status: {resp.status_code}", "WARN")
        except Exception as e:
            self.log(f"Error deleting attachment: {str(e)}", "WARN")
    
    def print_summary(self):
        """Print test summary"""
        print("\n" + "="*60)
        print("TEST SUMMARY")
        print("="*60)
        print(f"Total Tests: {self.tests_run}")
        print(f"✅ Passed: {self.tests_passed}")
        print(f"❌ Failed: {self.tests_failed}")
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        print(f"Success Rate: {success_rate:.1f}%")
        print("="*60)
        return self.tests_failed == 0


def main():
    tester = BOMRBACTester()
    
    print("="*60)
    print("BOM RBAC BACKEND TESTING")
    print("="*60)
    print()
    
    # Test credentials
    test_users = [
        ("qcuser", "Test@123", False, True),      # QC: no costing, preview-only
        ("salesuser", "Test@123", True, False),   # Sales: can view costing, can download
        ("susanto", "Subbalo1994", True, False),  # Super admin: full access
    ]
    
    # Get a BOM ID first (login as admin)
    tester.log("Getting BOM ID for testing...", "INFO")
    if not tester.login("susanto", "Subbalo1994"):
        print("\n❌ Failed to login as admin to get BOM ID")
        return 1
    
    bom_id = tester.get_bom_list()
    if not bom_id:
        print("\n❌ No BOM found in database - cannot proceed with tests")
        return 1
    
    # Create a temp costing attachment for testing
    temp_attach_id = tester.create_temp_costing_attachment(bom_id)
    
    tester.logout()
    print()
    
    # Test each user
    for username, password, can_view_costing, preview_only in test_users:
        print(f"\n{'='*60}")
        print(f"TESTING USER: {username}")
        print(f"Expected: can_view_costing={can_view_costing}, preview_only={preview_only}")
        print(f"{'='*60}\n")
        
        if not tester.login(username, password):
            continue
        
        # Test 1: Attachments endpoint
        tester.test_attachments_endpoint(bom_id, can_view_costing, preview_only)
        
        # Test 2: Purchases endpoint
        tester.test_purchases_endpoint(bom_id, can_view_costing)
        
        # Test 3: Download costing attachment (if we created one)
        if temp_attach_id:
            tester.test_attachment_download(bom_id, temp_attach_id, can_view_costing, "costing")
            tester.test_attachment_page_image(bom_id, temp_attach_id, can_view_costing, "costing")
        
        tester.logout()
        print()
    
    # Cleanup: delete temp attachment
    if temp_attach_id:
        tester.login("susanto", "Subbalo1994")
        tester.delete_attachment(bom_id, temp_attach_id)
        tester.logout()
    
    # Print summary
    success = tester.print_summary()
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
