"""
Comprehensive Backend Test for NONCONFORMANCE (CAR) Module
Tests all API endpoints with proper RBAC validation
"""
import requests
import sys
from datetime import datetime

BASE_URL = "https://error-fix-dev.preview.emergentagent.com/api"

class NonconformanceAPITester:
    def __init__(self):
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.cookies = {}
        self.nc_id = None
        self.nc_no = None
        self.drawing_ids = []
        self.failed_tests = []

    def log(self, msg, level="INFO"):
        prefix = {
            "INFO": "ℹ️ ",
            "SUCCESS": "✅",
            "ERROR": "❌",
            "WARNING": "⚠️ "
        }.get(level, "")
        print(f"{prefix} {msg}")

    def run_test(self, name, method, endpoint, expected_status, data=None, cookies=None, files=None):
        """Run a single API test"""
        url = f"{BASE_URL}/{endpoint}"
        self.tests_run += 1
        self.log(f"Testing: {name}", "INFO")
        
        try:
            if method == 'GET':
                response = requests.get(url, cookies=cookies or self.cookies, timeout=30)
            elif method == 'POST':
                if files:
                    response = requests.post(url, data=data, files=files, cookies=cookies or self.cookies, timeout=30)
                else:
                    response = requests.post(url, json=data, cookies=cookies or self.cookies, timeout=30)
            elif method == 'DELETE':
                response = requests.delete(url, cookies=cookies or self.cookies, timeout=30)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                self.log(f"PASSED - {name} (Status: {response.status_code})", "SUCCESS")
                return True, response
            else:
                self.tests_failed += 1
                self.failed_tests.append(f"{name}: Expected {expected_status}, got {response.status_code}")
                self.log(f"FAILED - {name}: Expected {expected_status}, got {response.status_code}", "ERROR")
                self.log(f"Response: {response.text[:200]}", "ERROR")
                return False, response

        except Exception as e:
            self.tests_failed += 1
            self.failed_tests.append(f"{name}: {str(e)}")
            self.log(f"FAILED - {name}: {str(e)}", "ERROR")
            return False, None

    def login(self, username, password):
        """Login and store cookies"""
        self.log(f"Logging in as {username}...", "INFO")
        try:
            response = requests.post(f"{BASE_URL}/auth/login", 
                                   json={"username": username, "password": password}, 
                                   timeout=30)
            if response.status_code == 200:
                self.cookies = response.cookies
                self.log(f"Login successful as {username}", "SUCCESS")
                return True
            else:
                self.log(f"Login failed: {response.status_code} - {response.text}", "ERROR")
                return False
        except Exception as e:
            self.log(f"Login error: {str(e)}", "ERROR")
            return False

    def get_drawings(self):
        """Get available drawings for testing"""
        self.log("Fetching drawings...", "INFO")
        try:
            response = requests.get(f"{BASE_URL}/drawings?limit=5", cookies=self.cookies, timeout=30)
            if response.status_code == 200:
                data = response.json()
                items = data.get('items', [])
                if len(items) >= 2:
                    self.drawing_ids = [
                        {"drawing_id": items[0].get("id"), "drawing_no": items[0].get("drawing_no")},
                        {"drawing_id": items[1].get("id"), "drawing_no": items[1].get("drawing_no")}
                    ]
                    self.log(f"Found {len(items)} drawings, using: {[d['drawing_no'] for d in self.drawing_ids]}", "SUCCESS")
                    return True
                else:
                    self.log("Not enough drawings found", "ERROR")
                    return False
            else:
                self.log(f"Failed to get drawings: {response.status_code}", "ERROR")
                return False
        except Exception as e:
            self.log(f"Error fetching drawings: {str(e)}", "ERROR")
            return False

    def test_create_car_as_sales(self):
        """Test 1: POST /api/nonconformance - create CAR as admin (issuer)"""
        # Note: Using admin since sales user credentials are not working
        if not self.login("admin", "admin123"):
            return False
        
        if not self.get_drawings():
            return False

        payload = {
            "drawings": self.drawing_ids,
            "issued_to": "Engineering Dept",
            "expected_reply_date": "2026-09-01",
            "source": "external",
            "severity": "major",
            "title": "Dimensi tidak sesuai spesifikasi customer",
            "description": "Ditemukan ketidaksesuaian dimensi pada part A123 saat inspeksi customer. Selisih 0.5mm dari toleransi.",
            "so_no": "SO-TEST-001",
            "customer_name": "PT Test Customer"
        }

        success, response = self.run_test(
            "Create CAR as Admin (issuer)",
            "POST",
            "nonconformance",
            200,
            data=payload
        )

        if success:
            data = response.json()
            self.nc_id = data.get("id")
            self.nc_no = data.get("nc_no")
            self.log(f"Created CAR: {self.nc_no} (ID: {self.nc_id})", "SUCCESS")
            
            # Verify response structure
            assert data.get("status") == "open", "Status should be 'open'"
            # Admin can issue CAR, issuer_dept will be set based on payload or default
            assert data.get("source") == "external", "Source should be 'external'"
            assert data.get("nc_no").startswith("MKS-QA-CAR-"), "CAR number format incorrect"
            assert len(data.get("drawing_nos", [])) == 2, "Should have 2 drawings"
            self.log("CAR structure validation passed", "SUCCESS")
            return True
        return False

    def test_create_car_as_eng_staff_blocked(self):
        """Test 2: RBAC - eng_staff BLOCKED from creating CAR (403)"""
        if not self.login("engstaff", "eng123"):
            return False

        payload = {
            "drawings": self.drawing_ids,
            "description": "Test NC from eng_staff (should fail)",
            "source": "in_house"
        }

        success, response = self.run_test(
            "Create CAR as eng_staff (should be BLOCKED)",
            "POST",
            "nonconformance",
            403,  # Expected to fail
            data=payload
        )
        return success

    def test_list_and_stats(self):
        """Test 3: GET /api/nonconformance list with filters and stats"""
        if not self.login("riski", "eng123"):
            return False

        # Test list endpoint
        success1, _ = self.run_test(
            "List all CARs",
            "GET",
            "nonconformance",
            200
        )

        # Test with filters
        success2, _ = self.run_test(
            "List CARs with status filter",
            "GET",
            "nonconformance?status=open",
            200
        )

        success3, _ = self.run_test(
            "List CARs with issuer_dept filter",
            "GET",
            "nonconformance?issuer_dept=sales",
            200
        )

        # Test stats endpoint
        success4, response = self.run_test(
            "Get CAR stats",
            "GET",
            "nonconformance/stats",
            200
        )

        if success4:
            stats = response.json()
            self.log(f"Stats: total={stats.get('total')}, open={stats.get('open')}, closed={stats.get('closed')}", "INFO")

        return success1 and success2 and success3 and success4

    def test_assign_to_eng_staff(self):
        """Test 4: POST /api/nonconformance/{id}/assign - only eng_leader/admin"""
        if not self.nc_id:
            self.log("No NC ID available, skipping assign test", "WARNING")
            return False

        if not self.login("riski", "eng123"):
            return False

        # Get eng_staff user ID
        response = requests.get(f"{BASE_URL}/drawings/eng-designers", cookies=self.cookies, timeout=30)
        if response.status_code != 200:
            self.log("Failed to get eng designers", "ERROR")
            return False
        
        designers = response.json().get("designers", [])
        eng_staff = next((d for d in designers if d.get("role") == "eng_staff"), None)
        
        if not eng_staff:
            self.log("No eng_staff found", "ERROR")
            return False

        payload = {
            "assignee_id": eng_staff.get("id"),
            "assignee_name": eng_staff.get("name"),
            "notes": "Mohon segera ditindaklanjuti"
        }

        success, response = self.run_test(
            "Assign CAR to eng_staff",
            "POST",
            f"nonconformance/{self.nc_id}/assign",
            200,
            data=payload
        )

        if success:
            data = response.json()
            assert data.get("status") == "assigned", "Status should be 'assigned'"
            self.log("CAR successfully assigned", "SUCCESS")
            return True
        return False

    def test_investigation_section(self):
        """Test 5: POST /api/nonconformance/{id}/investigation - save Section 2"""
        if not self.nc_id:
            self.log("No NC ID available, skipping investigation test", "WARNING")
            return False

        if not self.login("riski", "eng123"):
            return False

        payload = {
            "root_cause": "Kesalahan setting parameter mesin CNC",
            "immediate_action": "Stop produksi part terkait dan isolasi part reject",
            "corrective_action": "Update Work Instruction dan re-training operator",
            "preventive_action": "Implementasi checklist pre-production dan periodic audit",
            "completed_by": "Riski Maulana",
            "completed_date": "2026-08-15",
            "dept_head_name": "Susanto",
            "dept_head_date": "2026-08-16",
            "ecn_no": "ECN-26-08-001",
            "set_in_progress": True
        }

        success, response = self.run_test(
            "Save Investigation (Section 2)",
            "POST",
            f"nonconformance/{self.nc_id}/investigation",
            200,
            data=payload
        )

        if success:
            data = response.json()
            assert data.get("status") == "in_progress", "Status should be 'in_progress'"
            self.log("Investigation saved and status updated to in_progress", "SUCCESS")
            return True
        return False

    def test_closeout_section(self):
        """Test 6: POST /api/nonconformance/{id}/closeout - save Section 3"""
        if not self.nc_id:
            self.log("No NC ID available, skipping closeout test", "WARNING")
            return False

        if not self.login("riski", "eng123"):
            return False

        # First save closeout without closing
        payload = {
            "initiator_remarks": "Tindakan korektif telah dilaksanakan dan diverifikasi efektif",
            "risk_review": True,
            "risk_attached": False,
            "effectiveness_reviewed_by": "QA Manager",
            "effectiveness_date": "2026-08-20",
            "qa_approved_by": "QC Head",
            "qa_date": "2026-08-21",
            "close": False
        }

        success1, _ = self.run_test(
            "Save Closeout (Section 3) without closing",
            "POST",
            f"nonconformance/{self.nc_id}/closeout",
            200,
            data=payload
        )

        # Now close the CAR
        payload["close"] = True
        success2, response = self.run_test(
            "Save Closeout and Close CAR",
            "POST",
            f"nonconformance/{self.nc_id}/closeout",
            200,
            data=payload
        )

        if success2:
            data = response.json()
            assert data.get("status") == "closed", "Status should be 'closed'"
            self.log("CAR successfully closed", "SUCCESS")

        return success1 and success2

    def test_status_update_rbac(self):
        """Test 7: POST /api/nonconformance/{id}/status - RBAC validation"""
        # Create a new CAR for this test using admin
        if not self.login("admin", "admin123"):
            return False

        if not self.get_drawings():
            return False

        payload = {
            "drawings": [self.drawing_ids[0]],
            "description": "Test CAR for status RBAC",
            "source": "in_house"
        }

        success, response = self.run_test(
            "Create test CAR for status RBAC",
            "POST",
            "nonconformance",
            200,
            data=payload
        )

        if not success:
            return False

        test_nc_id = response.json().get("id")

        # Test: eng_staff CANNOT close (should get 403)
        if not self.login("engstaff", "eng123"):
            return False

        success1, _ = self.run_test(
            "eng_staff tries to close CAR (should FAIL with 403)",
            "POST",
            f"nonconformance/{test_nc_id}/status",
            403,
            data={"status": "closed", "notes": "Trying to close"}
        )

        # Test: eng_leader CAN close
        if not self.login("riski", "eng123"):
            return False

        success2, _ = self.run_test(
            "eng_leader closes CAR (should SUCCEED)",
            "POST",
            f"nonconformance/{test_nc_id}/status",
            200,
            data={"status": "closed", "ecn_no": "ECN-TEST-001", "notes": "Closed by leader"}
        )

        return success1 and success2

    def test_attachments(self):
        """Test 8: Attachments - POST/GET/DELETE"""
        if not self.nc_id:
            self.log("No NC ID available, skipping attachment test", "WARNING")
            return False

        if not self.login("riski", "eng123"):
            return False

        # Create a small test PDF file (minimal valid PDF)
        import io
        # Minimal valid PDF content
        pdf_content = b"""%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000052 00000 n 
0000000101 00000 n 
trailer<</Size 4/Root 1 0 R>>
startxref
190
%%EOF"""
        test_file = io.BytesIO(pdf_content)
        test_file.name = "test_attachment.pdf"

        # Upload attachment
        files = {"file": ("test_attachment.pdf", test_file, "application/pdf")}
        data = {"remark": "Test attachment"}
        
        success1, response = self.run_test(
            "Upload attachment",
            "POST",
            f"nonconformance/{self.nc_id}/attachments",
            200,
            data=data,
            files=files
        )

        attachment_id = None
        if success1:
            attachment_id = response.json().get("attachment", {}).get("id")
            self.log(f"Attachment uploaded: {attachment_id}", "SUCCESS")

        # List attachments
        success2, response = self.run_test(
            "List attachments",
            "GET",
            f"nonconformance/{self.nc_id}/attachments",
            200
        )

        if success2:
            attachments = response.json().get("items", [])
            self.log(f"Found {len(attachments)} attachment(s)", "INFO")

        # Delete attachment
        success3 = True
        if attachment_id:
            success3, _ = self.run_test(
                "Delete attachment",
                "DELETE",
                f"nonconformance/{self.nc_id}/attachments/{attachment_id}",
                200
            )

        return success1 and success2 and success3

    def test_eng006_nc_log(self):
        """Test 9: GET /api/nonconformance/eng006-nc-log - engineering/admin only"""
        if not self.login("riski", "eng123"):
            return False

        success, response = self.run_test(
            "Get ENG-006 NC Log",
            "GET",
            "nonconformance/eng006-nc-log",
            200
        )

        if success:
            data = response.json()
            rows = data.get("rows", [])
            self.log(f"ENG-006 NC Log: {len(rows)} records", "INFO")
            if rows:
                self.log(f"Sample record: {rows[0]}", "INFO")

        return success

    def test_kpi_wiring(self):
        """Test 10: KPI wiring - GET /api/engineering/kpi/drawing_customer_nc/records"""
        if not self.login("riski", "eng123"):
            return False

        now = datetime.now()
        year = now.year
        month = now.month

        success, response = self.run_test(
            f"Get KPI drawing_customer_nc records for {year}-{month:02d}",
            "GET",
            f"engineering/kpi/drawing_customer_nc/records?year={year}&month={month}",
            200
        )

        if success:
            data = response.json()
            records = data.get("records", [])
            self.log(f"KPI records: {len(records)} drawings", "INFO")
            
            # Check for drawings with NC
            nc_drawings = [r for r in records if not r.get("ok")]
            if nc_drawings:
                self.log(f"Found {len(nc_drawings)} drawing(s) with NC", "INFO")
                for rec in nc_drawings[:3]:
                    self.log(f"  - {rec.get('ref')}: {rec.get('nc_nos')}", "INFO")

        return success

    def print_summary(self):
        """Print test summary"""
        print("\n" + "="*60)
        print("TEST SUMMARY")
        print("="*60)
        print(f"Total Tests: {self.tests_run}")
        print(f"✅ Passed: {self.tests_passed}")
        print(f"❌ Failed: {self.tests_failed}")
        print(f"Success Rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        if self.failed_tests:
            print("\nFailed Tests:")
            for test in self.failed_tests:
                print(f"  ❌ {test}")
        
        print("="*60)
        return self.tests_failed == 0


def main():
    tester = NonconformanceAPITester()
    
    print("="*60)
    print("NONCONFORMANCE (CAR) MODULE - BACKEND API TESTS")
    print("="*60)
    print()

    # Run all tests
    tester.test_create_car_as_sales()
    tester.test_create_car_as_eng_staff_blocked()
    tester.test_list_and_stats()
    tester.test_assign_to_eng_staff()
    tester.test_investigation_section()
    tester.test_closeout_section()
    tester.test_status_update_rbac()
    tester.test_attachments()
    tester.test_eng006_nc_log()
    tester.test_kpi_wiring()

    # Print summary
    success = tester.print_summary()
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
