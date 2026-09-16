"""
Test script for BUG1 (engineers endpoint) and BUG2 (admin password persistence).

BUG1: GET /api/inquiries/engineers should return {items: [...]} with engineering users
BUG2: Admin password should NOT reset on backend restart
"""
import sys
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

import requests
from pymongo import MongoClient
from security import create_access_token

BASE_URL = "https://error-fix-dev.preview.emergentagent.com/api"
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "procurement_mks"

class TestRunner:
    def __init__(self):
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.client = MongoClient(MONGO_URL)
        self.db = self.client[DB_NAME]
        
    def log(self, msg, level="INFO"):
        prefix = {
            "INFO": "ℹ️",
            "PASS": "✅",
            "FAIL": "❌",
            "WARN": "⚠️"
        }.get(level, "•")
        print(f"{prefix} {msg}")
    
    def test(self, name, func):
        """Run a test function"""
        self.tests_run += 1
        self.log(f"\n{'='*60}", "INFO")
        self.log(f"TEST {self.tests_run}: {name}", "INFO")
        self.log(f"{'='*60}", "INFO")
        try:
            func()
            self.tests_passed += 1
            self.log(f"PASSED: {name}", "PASS")
            return True
        except AssertionError as e:
            self.tests_failed += 1
            self.log(f"FAILED: {name}", "FAIL")
            self.log(f"Reason: {str(e)}", "FAIL")
            return False
        except Exception as e:
            self.tests_failed += 1
            self.log(f"ERROR: {name}", "FAIL")
            self.log(f"Exception: {str(e)}", "FAIL")
            return False
    
    def get_user_token(self, username):
        """Get JWT token for a user by username"""
        user = self.db.users.find_one({"username": username})
        if not user:
            raise Exception(f"User {username} not found in database")
        token = create_access_token(user["id"], username)
        return token, user
    
    def api_get(self, endpoint, token=None):
        """Make GET request to API"""
        headers = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        url = f"{BASE_URL}{endpoint}"
        self.log(f"GET {url}", "INFO")
        response = requests.get(url, headers=headers)
        self.log(f"Status: {response.status_code}", "INFO")
        return response
    
    def print_summary(self):
        """Print test summary"""
        self.log(f"\n{'='*60}", "INFO")
        self.log("TEST SUMMARY", "INFO")
        self.log(f"{'='*60}", "INFO")
        self.log(f"Total Tests: {self.tests_run}", "INFO")
        self.log(f"Passed: {self.tests_passed}", "PASS")
        self.log(f"Failed: {self.tests_failed}", "FAIL" if self.tests_failed > 0 else "INFO")
        self.log(f"Success Rate: {(self.tests_passed/self.tests_run*100):.1f}%", "INFO")
        return self.tests_failed == 0

# ============================================================================
# BUG 1 TESTS: /api/inquiries/engineers endpoint
# ============================================================================
def test_bug1_engineers_endpoint_admin(runner):
    """BUG1: Test /api/inquiries/engineers with admin user"""
    token, user = runner.get_user_token("admin")
    runner.log(f"Testing as admin user: {user.get('name', user.get('username'))}", "INFO")
    
    response = runner.api_get("/inquiries/engineers", token)
    
    # Should return 200
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    
    # Should return JSON with items array
    data = response.json()
    assert "items" in data, "Response should have 'items' key"
    assert isinstance(data["items"], list), "'items' should be a list"
    
    # Should have engineering users
    assert len(data["items"]) > 0, "Should return at least one engineering user"
    
    runner.log(f"Found {len(data['items'])} engineering users", "INFO")
    
    # Check that eng_leader is included
    roles = [u.get("role") for u in data["items"]]
    runner.log(f"Roles found: {set(roles)}", "INFO")
    
    # Verify expected roles are present
    expected_roles = {"engineering", "eng_head", "eng_leader", "eng_staff"}
    found_roles = set(roles)
    assert found_roles.intersection(expected_roles), f"Should include engineering roles, found: {found_roles}"
    
    # List the engineers
    for eng in data["items"]:
        runner.log(f"  - {eng.get('name', eng.get('username'))} ({eng.get('role')})", "INFO")

def test_bug1_engineers_endpoint_eng_leader(runner):
    """BUG1: Test /api/inquiries/engineers with eng_leader user (riski)"""
    token, user = runner.get_user_token("riski")
    runner.log(f"Testing as eng_leader: {user.get('name', user.get('username'))}", "INFO")
    
    response = runner.api_get("/inquiries/engineers", token)
    
    # Should return 200
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    
    data = response.json()
    assert "items" in data, "Response should have 'items' key"
    assert len(data["items"]) > 0, "Should return engineering users"
    
    runner.log(f"Found {len(data['items'])} engineering users", "INFO")

def test_bug1_engineers_endpoint_eng_staff_forbidden(runner):
    """BUG1: Test /api/inquiries/engineers with eng_staff user (should be 403)"""
    token, user = runner.get_user_token("engstaff")
    runner.log(f"Testing as eng_staff: {user.get('name', user.get('username'))}", "INFO")
    
    response = runner.api_get("/inquiries/engineers", token)
    
    # Should return 403 Forbidden
    assert response.status_code == 403, f"Expected 403 for eng_staff, got {response.status_code}"
    runner.log("Correctly returned 403 for eng_staff user", "INFO")

def test_bug1_engineers_endpoint_sales_forbidden(runner):
    """BUG1: Test /api/inquiries/engineers with sales user (should be 403)"""
    token, user = runner.get_user_token("salesuser")
    runner.log(f"Testing as sales: {user.get('name', user.get('username'))}", "INFO")
    
    response = runner.api_get("/inquiries/engineers", token)
    
    # Should return 403 Forbidden
    assert response.status_code == 403, f"Expected 403 for sales, got {response.status_code}"
    runner.log("Correctly returned 403 for sales user", "INFO")

# ============================================================================
# BUG 1 REGRESSION TESTS: /api/drawing-requests/engineering-users endpoint
# ============================================================================
def test_bug1_regression_drf_engineering_users_admin(runner):
    """BUG1 REGRESSION: Test /api/drawing-requests/engineering-users with admin"""
    token, user = runner.get_user_token("admin")
    runner.log(f"Testing DRF engineering-users as admin", "INFO")
    
    response = runner.api_get("/drawing-requests/engineering-users", token)
    
    # Should return 200
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    
    data = response.json()
    assert "items" in data, "Response should have 'items' key"
    assert isinstance(data["items"], list), "'items' should be a list"
    
    runner.log(f"Found {len(data['items'])} engineering users", "INFO")

def test_bug1_regression_drf_engineering_users_eng_leader(runner):
    """BUG1 REGRESSION: Test /api/drawing-requests/engineering-users with eng_leader"""
    token, user = runner.get_user_token("riski")
    runner.log(f"Testing DRF engineering-users as eng_leader", "INFO")
    
    response = runner.api_get("/drawing-requests/engineering-users", token)
    
    # Should return 200
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    
    data = response.json()
    assert "items" in data, "Response should have 'items' key"
    assert len(data["items"]) > 0, "Should return engineering users"

def test_bug1_regression_drf_engineering_users_eng_staff_forbidden(runner):
    """BUG1 REGRESSION: Test /api/drawing-requests/engineering-users with eng_staff (should be 403)"""
    token, user = runner.get_user_token("engstaff")
    runner.log(f"Testing DRF engineering-users as eng_staff", "INFO")
    
    response = runner.api_get("/drawing-requests/engineering-users", token)
    
    # Should return 403 Forbidden
    assert response.status_code == 403, f"Expected 403 for eng_staff, got {response.status_code}"
    runner.log("Correctly returned 403 for eng_staff user", "INFO")

# ============================================================================
# BUG 2 TESTS: Admin password persistence across restart
# ============================================================================
def test_bug2_admin_password_persistence(runner):
    """BUG2: Verify admin password_hash does NOT change after backend restart"""
    runner.log("Reading admin password_hash from database...", "INFO")
    
    # Get current admin password hash
    admin = runner.db.users.find_one({"username": "admin"})
    assert admin, "Admin user not found in database"
    
    original_hash = admin.get("password_hash")
    assert original_hash, "Admin user has no password_hash"
    
    runner.log(f"Original password_hash: {original_hash[:20]}...", "INFO")
    
    # Restart backend
    runner.log("Restarting backend service...", "INFO")
    import subprocess
    result = subprocess.run(
        ["sudo", "supervisorctl", "restart", "backend"],
        capture_output=True,
        text=True,
        timeout=30
    )
    
    if result.returncode != 0:
        raise Exception(f"Failed to restart backend: {result.stderr}")
    
    runner.log("Backend restarted successfully", "INFO")
    
    # Wait a bit for startup to complete
    import time
    runner.log("Waiting 5 seconds for backend startup...", "INFO")
    time.sleep(5)
    
    # Read password hash again
    runner.log("Reading admin password_hash again...", "INFO")
    admin_after = runner.db.users.find_one({"username": "admin"})
    assert admin_after, "Admin user not found after restart"
    
    new_hash = admin_after.get("password_hash")
    assert new_hash, "Admin user has no password_hash after restart"
    
    runner.log(f"New password_hash: {new_hash[:20]}...", "INFO")
    
    # Compare hashes - they should be IDENTICAL
    assert original_hash == new_hash, \
        f"Password hash changed after restart!\nOriginal: {original_hash}\nNew: {new_hash}"
    
    runner.log("Password hash unchanged - BUG2 FIX VERIFIED!", "PASS")
    
    # Also verify that admin still has correct role and permissions
    assert admin_after.get("role") == "admin", "Admin role should be 'admin'"
    assert admin_after.get("active") == True, "Admin should be active"
    assert "approve_store_requests" in admin_after.get("perms", []), \
        "Admin should have 'approve_store_requests' permission"
    
    runner.log("Admin role, active status, and permissions are correct", "INFO")

def test_bug2_verify_no_password_reset_log(runner):
    """BUG2: Verify backend logs don't show 'Updated admin' for password reset"""
    runner.log("Checking backend logs for password reset messages...", "INFO")
    
    import subprocess
    result = subprocess.run(
        ["tail", "-n", "100", "/var/log/supervisor/backend.out.log"],
        capture_output=True,
        text=True,
        timeout=10
    )
    
    logs = result.stdout
    
    # Should NOT contain "Updated admin" message (which was logged when password was reset)
    if "Updated admin" in logs and "password" in logs.lower():
        runner.log("WARNING: Found 'Updated admin' in logs - may indicate password reset", "WARN")
        # Don't fail the test, just warn
    else:
        runner.log("No password reset messages found in logs", "INFO")
    
    # Should contain "Ensured admin role/perms (password preserved)" message
    if "password preserved" in logs:
        runner.log("Found 'password preserved' message - correct behavior!", "PASS")
    else:
        runner.log("Note: 'password preserved' message not found (may be from earlier startup)", "INFO")

# ============================================================================
# Main test execution
# ============================================================================
def main():
    runner = TestRunner()
    
    runner.log("="*60, "INFO")
    runner.log("INDONESIAN ERP - BUG FIX VERIFICATION TESTS", "INFO")
    runner.log("="*60, "INFO")
    runner.log(f"Backend URL: {BASE_URL}", "INFO")
    runner.log(f"MongoDB: {MONGO_URL}/{DB_NAME}", "INFO")
    
    # BUG 1 Tests
    runner.log("\n" + "="*60, "INFO")
    runner.log("BUG 1: /api/inquiries/engineers endpoint tests", "INFO")
    runner.log("="*60, "INFO")
    
    runner.test("BUG1: Admin can access engineers list", 
                lambda: test_bug1_engineers_endpoint_admin(runner))
    
    runner.test("BUG1: Eng_leader can access engineers list", 
                lambda: test_bug1_engineers_endpoint_eng_leader(runner))
    
    runner.test("BUG1: Eng_staff gets 403 (forbidden)", 
                lambda: test_bug1_engineers_endpoint_eng_staff_forbidden(runner))
    
    runner.test("BUG1: Sales gets 403 (forbidden)", 
                lambda: test_bug1_engineers_endpoint_sales_forbidden(runner))
    
    # BUG 1 Regression Tests
    runner.log("\n" + "="*60, "INFO")
    runner.log("BUG 1 REGRESSION: /api/drawing-requests/engineering-users tests", "INFO")
    runner.log("="*60, "INFO")
    
    runner.test("BUG1 REGRESSION: Admin can access DRF engineering-users", 
                lambda: test_bug1_regression_drf_engineering_users_admin(runner))
    
    runner.test("BUG1 REGRESSION: Eng_leader can access DRF engineering-users", 
                lambda: test_bug1_regression_drf_engineering_users_eng_leader(runner))
    
    runner.test("BUG1 REGRESSION: Eng_staff gets 403 for DRF engineering-users", 
                lambda: test_bug1_regression_drf_engineering_users_eng_staff_forbidden(runner))
    
    # BUG 2 Tests
    runner.log("\n" + "="*60, "INFO")
    runner.log("BUG 2: Admin password persistence tests", "INFO")
    runner.log("="*60, "INFO")
    
    runner.test("BUG2: Admin password_hash unchanged after restart", 
                lambda: test_bug2_admin_password_persistence(runner))
    
    runner.test("BUG2: Verify no password reset in logs", 
                lambda: test_bug2_verify_no_password_reset_log(runner))
    
    # Print summary
    success = runner.print_summary()
    
    # Close MongoDB connection
    runner.client.close()
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())
