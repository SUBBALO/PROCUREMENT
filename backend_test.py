"""
Backend API Testing for Drawing Revision & BOM Logic (Iter 36)
Tests new SCOPE-based revision flow and BOM submit-gate integration.
"""
import requests
import sys
import json
from datetime import datetime
from typing import Optional, Dict, Any

BASE_URL = "https://error-fix-dev.preview.emergentagent.com/api"

# Test credentials from review_request
CREDENTIALS = {
    "eng_leader": {"username": "qa_leader_tmp", "password": "QaTest12345"},
    "admin": {"username": "qa_admin_tmp", "password": "QaTest12345"},
    "eng_staff": {"username": "qa_eng_tmp", "password": "QaTest12345"},
}

class TestSession:
    def __init__(self):
        self.session = requests.Session()
        self.current_user = None
        self.cookies = {}
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.test_data = {}  # Store created test data for cleanup
        
    def log(self, msg: str, level: str = "INFO"):
        """Log test messages"""
        prefix = {
            "INFO": "ℹ️",
            "SUCCESS": "✅",
            "FAIL": "❌",
            "WARN": "⚠️",
        }.get(level, "•")
        print(f"{prefix} {msg}")
    
    def login(self, username: str, password: str) -> bool:
        """Login and store cookies"""
        self.tests_run += 1
        self.log(f"Logging in as {username}...", "INFO")
        try:
            resp = self.session.post(
                f"{BASE_URL}/auth/login",
                json={"username": username, "password": password},
                timeout=10
            )
            if resp.status_code == 200:
                self.cookies = self.session.cookies.get_dict()
                self.current_user = username
                self.tests_passed += 1
                self.log(f"Login successful as {username}", "SUCCESS")
                return True
            else:
                self.tests_failed += 1
                self.log(f"Login failed: {resp.status_code} - {resp.text[:200]}", "FAIL")
                return False
        except Exception as e:
            self.tests_failed += 1
            self.log(f"Login error: {str(e)}", "FAIL")
            return False
    
    def test_api(self, name: str, method: str, endpoint: str, 
                 expected_status: int, data: Optional[Dict] = None,
                 files: Optional[Dict] = None) -> tuple[bool, Any]:
        """Generic API test method"""
        self.tests_run += 1
        self.log(f"Testing: {name}", "INFO")
        
        url = f"{BASE_URL}{endpoint}"
        try:
            if method == "GET":
                resp = self.session.get(url, timeout=15)
            elif method == "POST":
                if files:
                    resp = self.session.post(url, data=data, files=files, timeout=15)
                else:
                    resp = self.session.post(url, json=data, timeout=15)
            elif method == "PUT":
                resp = self.session.put(url, json=data, timeout=15)
            elif method == "DELETE":
                resp = self.session.delete(url, timeout=15)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            success = resp.status_code == expected_status
            if success:
                self.tests_passed += 1
                self.log(f"✓ {name} - Status: {resp.status_code}", "SUCCESS")
                try:
                    return True, resp.json()
                except Exception:
                    return True, resp.text
            else:
                self.tests_failed += 1
                self.log(f"✗ {name} - Expected {expected_status}, got {resp.status_code}", "FAIL")
                self.log(f"  Response: {resp.text[:300]}", "FAIL")
                return False, None
                
        except Exception as e:
            self.tests_failed += 1
            self.log(f"✗ {name} - Error: {str(e)}", "FAIL")
            return False, None
    
    def create_test_drawing(self, with_bom: bool = True) -> Optional[str]:
        """Create a test drawing with optional BOM"""
        timestamp = datetime.now().strftime("%H%M%S")
        drawing_data = {
            "drawing_no": "",  # Auto-generate
            "customer_code": "ZZTEST",
            "customer_name": "ZZTEST Customer",
            "project_initial": "TST",
            "drawing_type": "Assembly",
            "title": f"Test Drawing {timestamp}",
            "revision": "Rev-0",
            "discipline": "Mechanical",
            "so_no": "999999",
            "project_name": f"Test Project {timestamp}",
            "class_material": "Test Material",
            "prepared_by": self.current_user or "test",
            "bom_link_mode": "create_new" if with_bom else "none",
            "bom_no": "",  # Auto-generate
        }
        
        success, result = self.test_api(
            "Create test drawing",
            "POST",
            "/drawings",
            200,
            drawing_data
        )
        
        if success and result:
            drawing_id = result.get("id")
            bom_id = result.get("bom_id")
            self.test_data["drawing_id"] = drawing_id
            self.test_data["drawing_no"] = result.get("drawing_no")
            if bom_id:
                self.test_data["bom_id"] = bom_id
                self.test_data["bom_no"] = result.get("bom_no")
            self.log(f"Created drawing: {result.get('drawing_no')} (ID: {drawing_id})", "INFO")
            if bom_id:
                self.log(f"Created BOM: {result.get('bom_no')} (ID: {bom_id})", "INFO")
            return drawing_id
        return None
    
    def add_bom_items(self, bom_id: str) -> bool:
        """Add test items to BOM"""
        items = [
            {
                "item_name": "Test Item 1",
                "item_specification": "Spec 1",
                "qty": 10,
                "uom": "PCS",
                "material": "Steel",
            },
            {
                "item_name": "Test Item 2",
                "item_specification": "Spec 2",
                "qty": 5,
                "uom": "PCS",
                "material": "Aluminum",
            }
        ]
        
        for item in items:
            success, _ = self.test_api(
                f"Add BOM item: {item['item_name']}",
                "POST",
                f"/bom/{bom_id}/items",
                200,
                item
            )
            if not success:
                return False
        return True
    
    def upload_dummy_pdf(self, drawing_id: str, drawing_no: str = "") -> bool:
        """Upload a dummy PDF to drawing"""
        # Create minimal valid PDF with drawing number embedded
        drawing_text = drawing_no if drawing_no else "Test Drawing"
        pdf_content = f"""%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length {len(drawing_text) + 30} >>
stream
BT /F1 12 Tf 100 700 Td ({drawing_text}) Tj ET
endstream
endobj
xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000317 00000 n
trailer
<< /Size 5 /Root 1 0 R >>
startxref
408
%%EOF""".encode('utf-8')
        
        files = {"file": ("test_drawing.pdf", pdf_content, "application/pdf")}
        data = {"force": "true"}
        
        url = f"{BASE_URL}/drawings/{drawing_id}/upload"
        try:
            resp = self.session.post(url, data=data, files=files, timeout=15)
            if resp.status_code == 200:
                self.log("PDF uploaded successfully", "SUCCESS")
                return True
            else:
                self.log(f"PDF upload failed: {resp.status_code}", "FAIL")
                try:
                    error_detail = resp.json()
                    self.log(f"  Error detail: {json.dumps(error_detail, indent=2)[:300]}", "FAIL")
                except Exception:
                    self.log(f"  Response: {resp.text[:300]}", "FAIL")
                return False
        except Exception as e:
            self.log(f"PDF upload error: {str(e)}", "FAIL")
            return False
    
    def set_work_category(self, drawing_id: str) -> bool:
        """Set work category (required before submit)"""
        success, _ = self.test_api(
            "Set work category",
            "POST",
            f"/drawings/{drawing_id}/work-category",
            200,
            {"work_category": "simple"}
        )
        return success
    
    def make_drawing_non_draft(self, drawing_id: str, as_leader: bool = False) -> bool:
        """Submit drawing and approve to make it non-draft"""
        # Set work category first
        if not self.set_work_category(drawing_id):
            return False
        
        # Submit for approval
        success, result = self.test_api(
            "Submit drawing for approval",
            "POST",
            f"/drawings/{drawing_id}/submit-for-approval",
            200,
            {"notes": "Test submission"}
        )
        
        if not success:
            return False
        
        approval_status = result.get("approval_status")
        self.log(f"Drawing approval status after submit: {approval_status}", "INFO")
        
        # If submitted as leader, it auto-advances to pending_qc
        # If not leader, need to approve as eng_head
        if not as_leader and approval_status == "pending_eng_head":
            # Need to login as leader to approve
            current_cookies = self.cookies.copy()
            current_user = self.current_user
            
            if self.login(CREDENTIALS["eng_leader"]["username"], CREDENTIALS["eng_leader"]["password"]):
                success, _ = self.test_api(
                    "Approve as eng_head",
                    "POST",
                    f"/drawings/{drawing_id}/approve/eng_head",
                    200,
                    {"notes": "Approved by leader"}
                )
                
                # Restore original session
                self.cookies = current_cookies
                self.current_user = current_user
                self.session.cookies.clear()
                for k, v in current_cookies.items():
                    self.session.cookies.set(k, v)
                
                return success
        
        return True
    
    def print_summary(self):
        """Print test summary"""
        print("\n" + "="*60)
        print("TEST SUMMARY")
        print("="*60)
        print(f"Total Tests: {self.tests_run}")
        print(f"Passed: {self.tests_passed} ✅")
        print(f"Failed: {self.tests_failed} ❌")
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        print(f"Success Rate: {success_rate:.1f}%")
        print("="*60)
        
        return self.tests_failed == 0


def test_scope_persist(session: TestSession) -> bool:
    """Test 1: SCOPE persist - verify scope field is saved in revision_request"""
    session.log("\n=== TEST 1: SCOPE Persist ===", "INFO")
    
    # Login as eng_staff
    if not session.login(CREDENTIALS["eng_staff"]["username"], CREDENTIALS["eng_staff"]["password"]):
        return False
    
    # Create drawing with BOM
    drawing_id = session.create_test_drawing(with_bom=True)
    if not drawing_id:
        return False
    
    # Upload PDF
    if not session.upload_dummy_pdf(drawing_id, session.test_data.get("drawing_no", "")):
        return False
    
    # Make drawing non-draft (controlled/approved)
    if not session.make_drawing_non_draft(drawing_id):
        return False
    
    # Request revision with scope='both'
    success, result = session.test_api(
        "Request revision with scope='both'",
        "POST",
        f"/drawings/{drawing_id}/request-revision",
        200,
        {
            "scope": "both",
            "current_desc": "Current state description",
            "proposed_desc": "Proposed changes description",
            "purpose_explanation": "Testing scope persist"
        }
    )
    
    if not success:
        return False
    
    # Verify scope is saved
    revision_request = result.get("revision_request", {})
    saved_scope = revision_request.get("scope")
    
    if saved_scope == "both":
        session.log(f"✓ Scope correctly saved as: {saved_scope}", "SUCCESS")
        return True
    else:
        session.log(f"✗ Scope not saved correctly. Expected 'both', got: {saved_scope}", "FAIL")
        return False


def test_start_revision_scope_both(session: TestSession) -> bool:
    """Test 2: start-revision scope='both' - both drawing and BOM get revised"""
    session.log("\n=== TEST 2: Start Revision scope='both' ===", "INFO")
    
    # Login as eng_staff
    if not session.login(CREDENTIALS["eng_staff"]["username"], CREDENTIALS["eng_staff"]["password"]):
        return False
    
    # Create drawing with BOM
    drawing_id = session.create_test_drawing(with_bom=True)
    if not drawing_id:
        return False
    
    bom_id = session.test_data.get("bom_id")
    if not bom_id:
        session.log("No BOM created", "FAIL")
        return False
    
    # Add items to BOM
    if not session.add_bom_items(bom_id):
        return False
    
    # Upload PDF
    if not session.upload_dummy_pdf(drawing_id, session.test_data.get("drawing_no", "")):
        return False
    
    # Make drawing non-draft
    if not session.make_drawing_non_draft(drawing_id):
        return False
    
    # Get initial state
    success, drawing_before = session.test_api(
        "Get drawing before revision",
        "GET",
        f"/drawings/{drawing_id}",
        200
    )
    if not success:
        return False
    
    success, bom_before = session.test_api(
        "Get BOM before revision",
        "GET",
        f"/bom/{bom_id}",
        200
    )
    if not success:
        return False
    
    drawing_rev_before = drawing_before.get("rev_no", 0)
    bom_rev_before = bom_before.get("rev_no", 0)
    drawing_status_before = drawing_before.get("approval_status")
    bom_status_before = bom_before.get("engineering_status")
    
    session.log(f"Before: Drawing rev={drawing_rev_before}, status={drawing_status_before}", "INFO")
    session.log(f"Before: BOM rev={bom_rev_before}, status={bom_status_before}", "INFO")
    
    # Request revision with scope='both'
    success, _ = session.test_api(
        "Request revision scope='both'",
        "POST",
        f"/drawings/{drawing_id}/request-revision",
        200,
        {
            "scope": "both",
            "current_desc": "Current state",
            "proposed_desc": "Proposed changes",
            "purpose_explanation": "Testing scope both"
        }
    )
    if not success:
        return False
    
    # Approve revision as leader
    current_cookies = session.cookies.copy()
    current_user = session.current_user
    
    if not session.login(CREDENTIALS["eng_leader"]["username"], CREDENTIALS["eng_leader"]["password"]):
        return False
    
    success, _ = session.test_api(
        "Approve revision as leader",
        "POST",
        f"/drawings/{drawing_id}/revision-decision",
        200,
        {"approve": True, "notes": "Approved for testing"}
    )
    
    # Restore eng_staff session
    session.cookies = current_cookies
    session.current_user = current_user
    session.session.cookies.clear()
    for k, v in current_cookies.items():
        session.session.cookies.set(k, v)
    
    if not success:
        return False
    
    # Start revision
    success, result = session.test_api(
        "Start revision",
        "POST",
        f"/drawings/{drawing_id}/start-revision",
        200
    )
    if not success:
        return False
    
    # Verify results
    new_rev = result.get("rev_no")
    new_status = result.get("approval_status")
    bom_revised = result.get("bom_revised")
    
    session.log(f"After: Drawing rev={new_rev}, status={new_status}", "INFO")
    session.log(f"After: BOM revised={bom_revised}", "INFO")
    
    # Check drawing
    if new_rev != drawing_rev_before + 1:
        session.log(f"✗ Drawing rev_no not incremented. Expected {drawing_rev_before + 1}, got {new_rev}", "FAIL")
        return False
    
    if new_status != "draft":
        session.log(f"✗ Drawing approval_status not 'draft'. Got: {new_status}", "FAIL")
        return False
    
    # Check BOM
    if not bom_revised or bom_revised.get("new_rev_no") != bom_rev_before + 1:
        session.log(f"✗ BOM rev_no not incremented correctly", "FAIL")
        return False
    
    # Verify BOM status changed to draft
    success, bom_after = session.test_api(
        "Get BOM after revision",
        "GET",
        f"/bom/{bom_id}",
        200
    )
    if not success:
        return False
    
    bom_status_after = bom_after.get("engineering_status")
    if bom_status_after != "draft":
        session.log(f"✗ BOM engineering_status not 'draft'. Got: {bom_status_after}", "FAIL")
        return False
    
    session.log("✓ scope='both' revision successful - both drawing and BOM revised", "SUCCESS")
    return True


def test_start_revision_scope_bom(session: TestSession) -> bool:
    """Test 3: start-revision scope='bom' - only BOM revised, drawing unchanged"""
    session.log("\n=== TEST 3: Start Revision scope='bom' ===", "INFO")
    
    # Login as eng_staff
    if not session.login(CREDENTIALS["eng_staff"]["username"], CREDENTIALS["eng_staff"]["password"]):
        return False
    
    # Create drawing with BOM
    drawing_id = session.create_test_drawing(with_bom=True)
    if not drawing_id:
        return False
    
    bom_id = session.test_data.get("bom_id")
    if not bom_id:
        return False
    
    # Add items to BOM
    if not session.add_bom_items(bom_id):
        return False
    
    # Upload PDF
    if not session.upload_dummy_pdf(drawing_id, session.test_data.get("drawing_no", "")):
        return False
    
    # Make drawing non-draft
    if not session.make_drawing_non_draft(drawing_id):
        return False
    
    # Get initial state
    success, drawing_before = session.test_api(
        "Get drawing before revision",
        "GET",
        f"/drawings/{drawing_id}",
        200
    )
    if not success:
        return False
    
    drawing_rev_before = drawing_before.get("rev_no", 0)
    drawing_status_before = drawing_before.get("approval_status")
    
    session.log(f"Before: Drawing rev={drawing_rev_before}, status={drawing_status_before}", "INFO")
    
    # Request revision with scope='bom'
    success, _ = session.test_api(
        "Request revision scope='bom'",
        "POST",
        f"/drawings/{drawing_id}/request-revision",
        200,
        {
            "scope": "bom",
            "current_desc": "Current BOM",
            "proposed_desc": "Updated BOM",
            "purpose_explanation": "Testing scope bom only"
        }
    )
    if not success:
        return False
    
    # Approve and start revision
    current_cookies = session.cookies.copy()
    current_user = session.current_user
    
    if not session.login(CREDENTIALS["eng_leader"]["username"], CREDENTIALS["eng_leader"]["password"]):
        return False
    
    session.test_api(
        "Approve revision",
        "POST",
        f"/drawings/{drawing_id}/revision-decision",
        200,
        {"approve": True, "notes": "Approved"}
    )
    
    # Restore session
    session.cookies = current_cookies
    session.current_user = current_user
    session.session.cookies.clear()
    for k, v in current_cookies.items():
        session.session.cookies.set(k, v)
    
    # Start revision
    success, result = session.test_api(
        "Start revision scope='bom'",
        "POST",
        f"/drawings/{drawing_id}/start-revision",
        200
    )
    if not success:
        return False
    
    # Get drawing after
    success, drawing_after = session.test_api(
        "Get drawing after revision",
        "GET",
        f"/drawings/{drawing_id}",
        200
    )
    if not success:
        return False
    
    drawing_rev_after = drawing_after.get("rev_no", 0)
    drawing_status_after = drawing_after.get("approval_status")
    
    session.log(f"After: Drawing rev={drawing_rev_after}, status={drawing_status_after}", "INFO")
    
    # Verify drawing unchanged
    if drawing_rev_after != drawing_rev_before:
        session.log(f"✗ Drawing rev_no changed. Expected {drawing_rev_before}, got {drawing_rev_after}", "FAIL")
        return False
    
    if drawing_status_after != drawing_status_before:
        session.log(f"✗ Drawing approval_status changed. Expected {drawing_status_before}, got {drawing_status_after}", "FAIL")
        return False
    
    session.log("✓ scope='bom' revision successful - drawing unchanged, BOM revised", "SUCCESS")
    return True


def test_start_revision_scope_drawing(session: TestSession) -> bool:
    """Test 4: start-revision scope='drawing' - only drawing revised, BOM unchanged"""
    session.log("\n=== TEST 4: Start Revision scope='drawing' ===", "INFO")
    
    # Login as eng_staff
    if not session.login(CREDENTIALS["eng_staff"]["username"], CREDENTIALS["eng_staff"]["password"]):
        return False
    
    # Create drawing with BOM
    drawing_id = session.create_test_drawing(with_bom=True)
    if not drawing_id:
        return False
    
    bom_id = session.test_data.get("bom_id")
    if not bom_id:
        return False
    
    # Add items to BOM
    if not session.add_bom_items(bom_id):
        return False
    
    # Upload PDF
    if not session.upload_dummy_pdf(drawing_id, session.test_data.get("drawing_no", "")):
        return False
    
    # Make drawing non-draft
    if not session.make_drawing_non_draft(drawing_id):
        return False
    
    # Get initial BOM state
    success, bom_before = session.test_api(
        "Get BOM before revision",
        "GET",
        f"/bom/{bom_id}",
        200
    )
    if not success:
        return False
    
    bom_rev_before = bom_before.get("rev_no", 0)
    bom_status_before = bom_before.get("engineering_status")
    
    session.log(f"Before: BOM rev={bom_rev_before}, status={bom_status_before}", "INFO")
    
    # Request revision with scope='drawing'
    success, _ = session.test_api(
        "Request revision scope='drawing'",
        "POST",
        f"/drawings/{drawing_id}/request-revision",
        200,
        {
            "scope": "drawing",
            "current_desc": "Current drawing",
            "proposed_desc": "Updated drawing",
            "purpose_explanation": "Testing scope drawing only"
        }
    )
    if not success:
        return False
    
    # Approve and start
    current_cookies = session.cookies.copy()
    current_user = session.current_user
    
    if not session.login(CREDENTIALS["eng_leader"]["username"], CREDENTIALS["eng_leader"]["password"]):
        return False
    
    session.test_api(
        "Approve revision",
        "POST",
        f"/drawings/{drawing_id}/revision-decision",
        200,
        {"approve": True, "notes": "Approved"}
    )
    
    session.cookies = current_cookies
    session.current_user = current_user
    session.session.cookies.clear()
    for k, v in current_cookies.items():
        session.session.cookies.set(k, v)
    
    success, result = session.test_api(
        "Start revision scope='drawing'",
        "POST",
        f"/drawings/{drawing_id}/start-revision",
        200
    )
    if not success:
        return False
    
    # Verify BOM unchanged
    success, bom_after = session.test_api(
        "Get BOM after revision",
        "GET",
        f"/bom/{bom_id}",
        200
    )
    if not success:
        return False
    
    bom_rev_after = bom_after.get("rev_no", 0)
    bom_status_after = bom_after.get("engineering_status")
    
    session.log(f"After: BOM rev={bom_rev_after}, status={bom_status_after}", "INFO")
    
    if bom_rev_after != bom_rev_before:
        session.log(f"✗ BOM rev_no changed. Expected {bom_rev_before}, got {bom_rev_after}", "FAIL")
        return False
    
    # BOM status might change, but rev_no should not
    session.log("✓ scope='drawing' revision successful - BOM rev_no unchanged", "SUCCESS")
    return True


def test_bom_submit_gate_non_leader(session: TestSession) -> bool:
    """Test 5: BOM submit-gate (non-leader) - drawing and BOM status after submit"""
    session.log("\n=== TEST 5: BOM Submit-gate (Non-leader) ===", "INFO")
    
    # Login as eng_staff
    if not session.login(CREDENTIALS["eng_staff"]["username"], CREDENTIALS["eng_staff"]["password"]):
        return False
    
    # Create drawing with BOM
    drawing_id = session.create_test_drawing(with_bom=True)
    if not drawing_id:
        return False
    
    bom_id = session.test_data.get("bom_id")
    if not bom_id:
        return False
    
    # Add items to BOM
    if not session.add_bom_items(bom_id):
        return False
    
    # Upload PDF
    if not session.upload_dummy_pdf(drawing_id, session.test_data.get("drawing_no", "")):
        return False
    
    # Set work category
    if not session.set_work_category(drawing_id):
        return False
    
    # Submit drawing for approval
    success, result = session.test_api(
        "Submit drawing (non-leader)",
        "POST",
        f"/drawings/{drawing_id}/submit-for-approval",
        200,
        {"notes": "Submitting as eng_staff"}
    )
    if not success:
        return False
    
    drawing_status = result.get("approval_status")
    session.log(f"Drawing status after submit: {drawing_status}", "INFO")
    
    # Check BOM status
    success, bom_result = session.test_api(
        "Get BOM after submit",
        "GET",
        f"/bom/{bom_id}",
        200
    )
    if not success:
        return False
    
    bom_status = bom_result.get("engineering_status")
    session.log(f"BOM status after submit: {bom_status}", "INFO")
    
    # Verify expected statuses
    if drawing_status != "pending_eng_head":
        session.log(f"✗ Drawing status incorrect. Expected 'pending_eng_head', got '{drawing_status}'", "FAIL")
        return False
    
    if bom_status != "pending_review":
        session.log(f"✗ BOM status incorrect. Expected 'pending_review', got '{bom_status}'", "FAIL")
        return False
    
    session.log("✓ Non-leader submit-gate working correctly", "SUCCESS")
    return True


def test_bom_submit_gate_leader(session: TestSession) -> bool:
    """Test 6: BOM submit-gate (leader) - auto-approve flow"""
    session.log("\n=== TEST 6: BOM Submit-gate (Leader) ===", "INFO")
    
    # Login as eng_leader
    if not session.login(CREDENTIALS["eng_leader"]["username"], CREDENTIALS["eng_leader"]["password"]):
        return False
    
    # Create drawing with BOM
    drawing_id = session.create_test_drawing(with_bom=True)
    if not drawing_id:
        return False
    
    bom_id = session.test_data.get("bom_id")
    if not bom_id:
        return False
    
    # Add items to BOM
    if not session.add_bom_items(bom_id):
        return False
    
    # Upload PDF
    if not session.upload_dummy_pdf(drawing_id, session.test_data.get("drawing_no", "")):
        return False
    
    # Set work category
    if not session.set_work_category(drawing_id):
        return False
    
    # Submit drawing for approval as leader
    success, result = session.test_api(
        "Submit drawing (leader)",
        "POST",
        f"/drawings/{drawing_id}/submit-for-approval",
        200,
        {"notes": "Submitting as eng_leader"}
    )
    if not success:
        return False
    
    drawing_status = result.get("approval_status")
    auto_verified = result.get("auto_leader_verified")
    session.log(f"Drawing status after submit: {drawing_status}", "INFO")
    session.log(f"Auto-verified: {auto_verified}", "INFO")
    
    # Check BOM status
    success, bom_result = session.test_api(
        "Get BOM after submit",
        "GET",
        f"/bom/{bom_id}",
        200
    )
    if not success:
        return False
    
    bom_status = bom_result.get("engineering_status")
    procurement_status = bom_result.get("procurement_status")
    session.log(f"BOM status after submit: {bom_status}", "INFO")
    session.log(f"BOM procurement_status: {procurement_status}", "INFO")
    
    # Verify expected statuses
    if drawing_status != "pending_qc":
        session.log(f"✗ Drawing status incorrect. Expected 'pending_qc', got '{drawing_status}'", "FAIL")
        return False
    
    if bom_status != "approved":
        session.log(f"✗ BOM status incorrect. Expected 'approved', got '{bom_status}'", "FAIL")
        return False
    
    if procurement_status != "leader_checked":
        session.log(f"✗ BOM procurement_status incorrect. Expected 'leader_checked', got '{procurement_status}'", "FAIL")
        return False
    
    session.log("✓ Leader submit-gate working correctly with auto-approve", "SUCCESS")
    return True


def main():
    """Main test runner"""
    print("\n" + "="*60)
    print("BACKEND API TESTING - Drawing Revision & BOM Logic")
    print("="*60)
    
    session = TestSession()
    
    # Run all tests
    tests = [
        ("SCOPE Persist", test_scope_persist),
        ("Start Revision scope='both'", test_start_revision_scope_both),
        ("Start Revision scope='bom'", test_start_revision_scope_bom),
        ("Start Revision scope='drawing'", test_start_revision_scope_drawing),
        ("BOM Submit-gate (Non-leader)", test_bom_submit_gate_non_leader),
        ("BOM Submit-gate (Leader)", test_bom_submit_gate_leader),
    ]
    
    results = {}
    for test_name, test_func in tests:
        try:
            # Reset test data for each test
            session.test_data = {}
            result = test_func(session)
            results[test_name] = result
        except Exception as e:
            session.log(f"Test '{test_name}' crashed: {str(e)}", "FAIL")
            results[test_name] = False
    
    # Print results
    print("\n" + "="*60)
    print("TEST RESULTS")
    print("="*60)
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {test_name}")
    
    # Print summary
    session.print_summary()
    
    # Return exit code
    return 0 if all(results.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
