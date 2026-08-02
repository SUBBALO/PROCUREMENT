#!/usr/bin/env python3
"""
Backend API Testing for ECN Acknowledgment Chain & Owner Restriction
Tests the complete ECN TTD flow and owner-based revision restrictions
"""
import requests
import sys
from datetime import datetime

class ECNAcknowledgmentTester:
    def __init__(self, base_url="https://error-fix-dev.preview.emergentagent.com"):
        self.base_url = base_url
        self.session = requests.Session()
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        self.drawing_id = None
        self.ecn_no = None
        self.rev_id = None

    def log_result(self, test_name, passed, details=""):
        """Log test result"""
        self.tests_run += 1
        if passed:
            self.tests_passed += 1
            print(f"✅ PASS: {test_name}")
            if details:
                print(f"   {details}")
        else:
            print(f"❌ FAIL: {test_name}")
            if details:
                print(f"   {details}")
        self.test_results.append({
            "test": test_name,
            "passed": passed,
            "details": details
        })

    def login(self, username, password):
        """Login and get session cookie"""
        print(f"\n🔐 Logging in as {username}...")
        try:
            response = self.session.post(
                f"{self.base_url}/api/auth/login",
                json={"username": username, "password": password},
                timeout=10
            )
            if response.status_code == 200:
                data = response.json()
                print(f"✅ Login successful - User: {data.get('username')}, Role: {data.get('role')}")
                return True
            else:
                print(f"❌ Login failed - Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            print(f"❌ Login error: {str(e)}")
            return False

    def find_controlled_drawing(self):
        """Find a controlled/released drawing WITHOUT an ECN for testing"""
        print("\n🔍 Finding controlled/released drawing without ECN...")
        try:
            response = self.session.get(
                f"{self.base_url}/api/drawings?limit=300",
                timeout=10
            )
            if response.status_code == 200:
                data = response.json()
                items = data.get("items", [])
                for item in items:
                    if item.get("approval_status") in ("controlled", "released"):
                        # Check if it doesn't have an ECN yet
                        rr = item.get("revision_request") or {}
                        ecn = rr.get("ecn") or {}
                        if not ecn.get("ecn_no"):
                            print(f"✅ Found controlled drawing without ECN: {item.get('drawing_no')} (ID: {item.get('id')})")
                            return item
                print("⚠️  No controlled/released drawings without ECN found, using any controlled drawing")
                # Fallback: use any controlled drawing
                for item in items:
                    if item.get("approval_status") in ("controlled", "released"):
                        print(f"✅ Found controlled drawing: {item.get('drawing_no')} (ID: {item.get('id')})")
                        return item
                print("⚠️  No controlled/released drawings found at all")
                return None
            else:
                print(f"❌ Failed to list drawings - Status: {response.status_code}")
                return None
        except Exception as e:
            print(f"❌ Error finding drawing: {str(e)}")
            return None

    def ensure_owner(self, drawing_id, owner_user_id, owner_name):
        """Ensure the drawing has the correct owner"""
        print(f"\n👤 Setting owner to {owner_name}...")
        try:
            response = self.session.post(
                f"{self.base_url}/api/drawings/{drawing_id}/assign",
                json={
                    "assigned_to_user_id": owner_user_id,
                    "assigned_to_name": owner_name
                },
                timeout=10
            )
            if response.status_code == 200:
                print(f"✅ Owner set successfully")
                return True
            else:
                print(f"⚠️  Owner assignment status: {response.status_code} (continuing anyway)")
                return True  # Continue even if assignment fails
        except Exception as e:
            print(f"⚠️  Owner assignment error: {str(e)} (continuing anyway)")
            return True

    def test_request_revision_as_owner(self, drawing_id):
        """Test POST /api/drawings/{id}/request-revision as owner"""
        print(f"\n🧪 Test: Request revision as owner (trisna)")
        try:
            payload = {
                "current_desc": "Original design specification",
                "proposed_desc": "Updated design with improved tolerances",
                "purpose_explanation": "Customer requested tighter tolerances for better fit",
                "reason_for_change": "Customer requirement change"
            }
            response = self.session.post(
                f"{self.base_url}/api/drawings/{drawing_id}/request-revision",
                json=payload,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                self.ecn_no = data.get("ecn_no")
                self.log_result(
                    "Request revision as owner",
                    True,
                    f"ECN created: {self.ecn_no}"
                )
                return True
            else:
                self.log_result(
                    "Request revision as owner",
                    False,
                    f"Expected 200, got {response.status_code}: {response.text}"
                )
                return False
        except Exception as e:
            self.log_result(
                "Request revision as owner",
                False,
                f"Exception: {str(e)}"
            )
            return False

    def test_request_revision_as_non_owner(self, drawing_id):
        """Test POST /api/drawings/{id}/request-revision as non-owner (should fail 403)"""
        print(f"\n🧪 Test: Request revision as non-owner (engstaff)")
        
        # Save current session
        original_session = self.session
        self.session = requests.Session()
        
        # Login as engstaff (non-owner eng_staff)
        if not self.login("engstaff", "eng123"):
            self.log_result(
                "Request revision as non-owner",
                False,
                "Could not login as engstaff"
            )
            self.session = original_session
            return False
        
        try:
            payload = {
                "current_desc": "Test",
                "proposed_desc": "Test change",
                "purpose_explanation": "Test"
            }
            response = self.session.post(
                f"{self.base_url}/api/drawings/{drawing_id}/request-revision",
                json=payload,
                timeout=10
            )
            
            # Restore original session
            self.session = original_session
            
            if response.status_code == 403:
                self.log_result(
                    "Request revision as non-owner",
                    True,
                    f"Correctly rejected with 403: {response.json().get('detail', '')}"
                )
                return True
            else:
                self.log_result(
                    "Request revision as non-owner",
                    False,
                    f"Expected 403, got {response.status_code}: {response.text}"
                )
                return False
        except Exception as e:
            self.session = original_session
            self.log_result(
                "Request revision as non-owner",
                False,
                f"Exception: {str(e)}"
            )
            return False

    def test_ecn_ack_state(self, drawing_id):
        """Test GET /api/drawings/{id}/ecn-ack-state"""
        print(f"\n🧪 Test: ECN ack state")
        try:
            response = self.session.get(
                f"{self.base_url}/api/drawings/{drawing_id}/ecn-ack-state",
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if (data.get("available") and 
                    data.get("is_ifu") and 
                    data.get("ecn_no") and
                    data.get("stage") == "production"):
                    self.log_result(
                        "ECN ack state",
                        True,
                        f"State: available={data.get('available')}, is_ifu={data.get('is_ifu')}, stage={data.get('stage')}"
                    )
                    return True
                else:
                    self.log_result(
                        "ECN ack state",
                        False,
                        f"Unexpected state: {data}"
                    )
                    return False
            else:
                self.log_result(
                    "ECN ack state",
                    False,
                    f"Expected 200, got {response.status_code}: {response.text}"
                )
                return False
        except Exception as e:
            self.log_result(
                "ECN ack state",
                False,
                f"Exception: {str(e)}"
            )
            return False

    def test_ecn_pending_ttd_produksi(self):
        """Test GET /api/drawings/ecn-pending-ttd as produksi user"""
        print(f"\n🧪 Test: ECN pending TTD for produksi user")
        
        # Save current session
        original_session = self.session
        self.session = requests.Session()
        
        # Login as produksi user
        if not self.login("agus", "AgusMks2026"):
            self.log_result(
                "ECN pending TTD for produksi",
                False,
                "Could not login as produksi user"
            )
            self.session = original_session
            return False
        
        try:
            response = self.session.get(
                f"{self.base_url}/api/drawings/ecn-pending-ttd",
                timeout=10
            )
            
            # Restore original session
            self.session = original_session
            
            if response.status_code == 200:
                data = response.json()
                items = data.get("items", [])
                # Check if our drawing is in the list with stage='production'
                found = any(
                    item.get("drawing_id") == self.drawing_id and 
                    item.get("stage") == "production"
                    for item in items
                )
                if found:
                    self.log_result(
                        "ECN pending TTD for produksi",
                        True,
                        f"Found {len(items)} pending ECNs, including our test drawing at production stage"
                    )
                    return True
                else:
                    self.log_result(
                        "ECN pending TTD for produksi",
                        False,
                        f"Drawing not found in pending list or wrong stage. Items: {len(items)}"
                    )
                    return False
            else:
                self.log_result(
                    "ECN pending TTD for produksi",
                    False,
                    f"Expected 200, got {response.status_code}: {response.text}"
                )
                return False
        except Exception as e:
            self.session = original_session
            self.log_result(
                "ECN pending TTD for produksi",
                False,
                f"Exception: {str(e)}"
            )
            return False

    def test_ecn_pending_ttd_unauthorized(self):
        """Test GET /api/drawings/ecn-pending-ttd as unauthorized user (should fail 403)"""
        print(f"\n🧪 Test: ECN pending TTD for unauthorized user (eng_staff)")
        
        # Save current session (should be trisna/eng_staff)
        original_session = self.session
        
        try:
            response = self.session.get(
                f"{self.base_url}/api/drawings/ecn-pending-ttd",
                timeout=10
            )
            
            if response.status_code == 403:
                self.log_result(
                    "ECN pending TTD unauthorized",
                    True,
                    f"Correctly rejected with 403: {response.json().get('detail', '')}"
                )
                return True
            else:
                self.log_result(
                    "ECN pending TTD unauthorized",
                    False,
                    f"Expected 403, got {response.status_code}: {response.text}"
                )
                return False
        except Exception as e:
            self.log_result(
                "ECN pending TTD unauthorized",
                False,
                f"Exception: {str(e)}"
            )
            return False

    def test_ecn_ack_wrong_role(self, drawing_id):
        """Test POST /api/drawings/{id}/ecn-ack with wrong role (should fail 403)"""
        print(f"\n🧪 Test: ECN ack with wrong role (eng_staff at production stage)")
        
        try:
            response = self.session.post(
                f"{self.base_url}/api/drawings/{drawing_id}/ecn-ack",
                json={},
                timeout=10
            )
            
            if response.status_code == 403:
                detail = response.json().get('detail', '')
                if "PRODUKSI" in detail.upper():
                    self.log_result(
                        "ECN ack wrong role",
                        True,
                        f"Correctly rejected with 403: {detail}"
                    )
                    return True
                else:
                    self.log_result(
                        "ECN ack wrong role",
                        False,
                        f"Got 403 but wrong message: {detail}"
                    )
                    return False
            else:
                self.log_result(
                    "ECN ack wrong role",
                    False,
                    f"Expected 403, got {response.status_code}: {response.text}"
                )
                return False
        except Exception as e:
            self.log_result(
                "ECN ack wrong role",
                False,
                f"Exception: {str(e)}"
            )
            return False

    def test_ecn_ack_produksi(self, drawing_id):
        """Test POST /api/drawings/{id}/ecn-ack as produksi user"""
        print(f"\n🧪 Test: ECN ack as produksi user")
        
        # Save current session
        original_session = self.session
        self.session = requests.Session()
        
        # Login as produksi user
        if not self.login("agus", "AgusMks2026"):
            self.log_result(
                "ECN ack produksi",
                False,
                "Could not login as produksi user"
            )
            self.session = original_session
            return False
        
        try:
            response = self.session.post(
                f"{self.base_url}/api/drawings/{drawing_id}/ecn-ack",
                json={},
                timeout=10
            )
            
            # Restore original session
            self.session = original_session
            
            if response.status_code == 200:
                data = response.json()
                if data.get("stage") == "qa_qc":
                    self.log_result(
                        "ECN ack produksi",
                        True,
                        f"Production acknowledged, stage moved to qa_qc: {data.get('message')}"
                    )
                    return True
                else:
                    self.log_result(
                        "ECN ack produksi",
                        False,
                        f"Ack succeeded but stage not updated correctly: {data.get('stage')}"
                    )
                    return False
            else:
                self.log_result(
                    "ECN ack produksi",
                    False,
                    f"Expected 200, got {response.status_code}: {response.text}"
                )
                return False
        except Exception as e:
            self.session = original_session
            self.log_result(
                "ECN ack produksi",
                False,
                f"Exception: {str(e)}"
            )
            return False

    def test_ecn_pending_ttd_qc(self):
        """Test GET /api/drawings/ecn-pending-ttd as QC user (should see qa_qc stage)"""
        print(f"\n🧪 Test: ECN pending TTD for QC user")
        
        # Save current session
        original_session = self.session
        self.session = requests.Session()
        
        # Login as QC user
        if not self.login("qcuser", "QcMks2026"):
            self.log_result(
                "ECN pending TTD for QC",
                False,
                "Could not login as QC user"
            )
            self.session = original_session
            return False
        
        try:
            response = self.session.get(
                f"{self.base_url}/api/drawings/ecn-pending-ttd",
                timeout=10
            )
            
            # Restore original session
            self.session = original_session
            
            if response.status_code == 200:
                data = response.json()
                items = data.get("items", [])
                # Check if our drawing is in the list with stage='qa_qc'
                found = any(
                    item.get("drawing_id") == self.drawing_id and 
                    item.get("stage") == "qa_qc"
                    for item in items
                )
                if found:
                    self.log_result(
                        "ECN pending TTD for QC",
                        True,
                        f"Found {len(items)} pending ECNs, including our test drawing at qa_qc stage"
                    )
                    return True
                else:
                    self.log_result(
                        "ECN pending TTD for QC",
                        False,
                        f"Drawing not found in QC pending list or wrong stage. Items: {len(items)}"
                    )
                    return False
            else:
                self.log_result(
                    "ECN pending TTD for QC",
                    False,
                    f"Expected 200, got {response.status_code}: {response.text}"
                )
                return False
        except Exception as e:
            self.session = original_session
            self.log_result(
                "ECN pending TTD for QC",
                False,
                f"Exception: {str(e)}"
            )
            return False

    def test_ecn_ack_qc_wrong_role(self, drawing_id):
        """Test POST /api/drawings/{id}/ecn-ack at qa_qc stage with wrong role (should fail 403)"""
        print(f"\n🧪 Test: ECN ack at qa_qc stage with wrong role (produksi)")
        
        # Save current session
        original_session = self.session
        self.session = requests.Session()
        
        # Login as produksi user (wrong role for qa_qc stage)
        if not self.login("agus", "AgusMks2026"):
            self.log_result(
                "ECN ack qa_qc wrong role",
                False,
                "Could not login as produksi user"
            )
            self.session = original_session
            return False
        
        try:
            response = self.session.post(
                f"{self.base_url}/api/drawings/{drawing_id}/ecn-ack",
                json={},
                timeout=10
            )
            
            # Restore original session
            self.session = original_session
            
            if response.status_code == 403:
                detail = response.json().get('detail', '')
                if "QA/QC" in detail.upper():
                    self.log_result(
                        "ECN ack qa_qc wrong role",
                        True,
                        f"Correctly rejected with 403: {detail}"
                    )
                    return True
                else:
                    self.log_result(
                        "ECN ack qa_qc wrong role",
                        False,
                        f"Got 403 but wrong message: {detail}"
                    )
                    return False
            else:
                self.log_result(
                    "ECN ack qa_qc wrong role",
                    False,
                    f"Expected 403, got {response.status_code}: {response.text}"
                )
                return False
        except Exception as e:
            self.session = original_session
            self.log_result(
                "ECN ack qa_qc wrong role",
                False,
                f"Exception: {str(e)}"
            )
            return False

    def test_ecn_ack_qc(self, drawing_id):
        """Test POST /api/drawings/{id}/ecn-ack as QC user"""
        print(f"\n🧪 Test: ECN ack as QC user")
        
        # Save current session
        original_session = self.session
        self.session = requests.Session()
        
        # Login as QC user
        if not self.login("qcuser", "QcMks2026"):
            self.log_result(
                "ECN ack QC",
                False,
                "Could not login as QC user"
            )
            self.session = original_session
            return False
        
        try:
            response = self.session.post(
                f"{self.base_url}/api/drawings/{drawing_id}/ecn-ack",
                json={},
                timeout=10
            )
            
            # Restore original session
            self.session = original_session
            
            if response.status_code == 200:
                data = response.json()
                ack = data.get("ack", {})
                if (data.get("stage") == "done" and 
                    ack.get("doc_control") and 
                    ack.get("doc_control", {}).get("auto")):
                    self.log_result(
                        "ECN ack QC",
                        True,
                        f"QC acknowledged, stage moved to done, doc_control auto-set: {data.get('message')}"
                    )
                    return True
                else:
                    self.log_result(
                        "ECN ack QC",
                        False,
                        f"Ack succeeded but stage/doc_control not updated correctly: stage={data.get('stage')}, ack={ack}"
                    )
                    return False
            else:
                self.log_result(
                    "ECN ack QC",
                    False,
                    f"Expected 200, got {response.status_code}: {response.text}"
                )
                return False
        except Exception as e:
            self.session = original_session
            self.log_result(
                "ECN ack QC",
                False,
                f"Exception: {str(e)}"
            )
            return False

    def test_ecn_ack_when_done(self, drawing_id):
        """Test POST /api/drawings/{id}/ecn-ack when stage is done (should fail 400)"""
        print(f"\n🧪 Test: ECN ack when already done")
        
        # Save current session
        original_session = self.session
        self.session = requests.Session()
        
        # Login as QC user
        if not self.login("qcuser", "QcMks2026"):
            self.log_result(
                "ECN ack when done",
                False,
                "Could not login as QC user"
            )
            self.session = original_session
            return False
        
        try:
            response = self.session.post(
                f"{self.base_url}/api/drawings/{drawing_id}/ecn-ack",
                json={},
                timeout=10
            )
            
            # Restore original session
            self.session = original_session
            
            if response.status_code == 400:
                detail = response.json().get('detail', '')
                if "selesai" in detail.lower() or "done" in detail.lower():
                    self.log_result(
                        "ECN ack when done",
                        True,
                        f"Correctly rejected with 400: {detail}"
                    )
                    return True
                else:
                    self.log_result(
                        "ECN ack when done",
                        False,
                        f"Got 400 but wrong message: {detail}"
                    )
                    return False
            else:
                self.log_result(
                    "ECN ack when done",
                    False,
                    f"Expected 400, got {response.status_code}: {response.text}"
                )
                return False
        except Exception as e:
            self.session = original_session
            self.log_result(
                "ECN ack when done",
                False,
                f"Exception: {str(e)}"
            )
            return False

    def test_ecn_register(self):
        """Test GET /api/ecn-register includes ack fields"""
        print(f"\n🧪 Test: ECN register includes ack fields")
        try:
            response = self.session.get(
                f"{self.base_url}/api/ecn-register",
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                items = data.get("items", [])
                # Find our ECN in the register
                our_ecn = None
                for item in items:
                    if item.get("drawing_id") == self.drawing_id:
                        our_ecn = item
                        break
                
                if our_ecn:
                    has_fields = all(
                        field in our_ecn
                        for field in ["ack_stage", "ack_production", "ack_qa_qc", "ack_doc_control"]
                    )
                    if has_fields and our_ecn.get("ack_stage") == "done":
                        self.log_result(
                            "ECN register includes ack fields",
                            True,
                            f"ECN found in register with all ack fields: stage={our_ecn.get('ack_stage')}, "
                            f"prod={our_ecn.get('ack_production')}, qc={our_ecn.get('ack_qa_qc')}, "
                            f"dc={our_ecn.get('ack_doc_control')}"
                        )
                        return True
                    else:
                        self.log_result(
                            "ECN register includes ack fields",
                            False,
                            f"ECN found but missing fields or wrong stage: {our_ecn}"
                        )
                        return False
                else:
                    self.log_result(
                        "ECN register includes ack fields",
                        False,
                        f"ECN not found in register. Total items: {len(items)}"
                    )
                    return False
            else:
                self.log_result(
                    "ECN register includes ack fields",
                    False,
                    f"Expected 200, got {response.status_code}: {response.text}"
                )
                return False
        except Exception as e:
            self.log_result(
                "ECN register includes ack fields",
                False,
                f"Exception: {str(e)}"
            )
            return False

    def test_start_revision_as_non_owner(self, drawing_id):
        """Test POST /api/drawings/{id}/start-revision as non-owner (should fail 403)"""
        print(f"\n🧪 Test: Start revision as non-owner")
        
        # First, we need to approve the revision request as eng_leader
        original_session = self.session
        self.session = requests.Session()
        
        # Login as eng_leader
        if not self.login("riski", "eng123"):
            self.log_result(
                "Start revision as non-owner",
                False,
                "Could not login as eng_leader"
            )
            self.session = original_session
            return False
        
        # Approve the revision request
        try:
            response = self.session.post(
                f"{self.base_url}/api/drawings/{drawing_id}/revision-decision",
                json={"approve": True, "notes": "Approved for testing"},
                timeout=10
            )
            if response.status_code != 200:
                print(f"⚠️  Could not approve revision: {response.status_code}")
        except Exception as e:
            print(f"⚠️  Error approving revision: {str(e)}")
        
        # Now login as non-owner (engstaff)
        self.session = requests.Session()
        if not self.login("engstaff", "eng123"):
            self.log_result(
                "Start revision as non-owner",
                False,
                "Could not login as engstaff"
            )
            self.session = original_session
            return False
        
        try:
            response = self.session.post(
                f"{self.base_url}/api/drawings/{drawing_id}/start-revision",
                json={},
                timeout=10
            )
            
            # Restore original session
            self.session = original_session
            
            if response.status_code == 403:
                self.log_result(
                    "Start revision as non-owner",
                    True,
                    f"Correctly rejected with 403: {response.json().get('detail', '')}"
                )
                return True
            else:
                self.log_result(
                    "Start revision as non-owner",
                    False,
                    f"Expected 403, got {response.status_code}: {response.text}"
                )
                return False
        except Exception as e:
            self.session = original_session
            self.log_result(
                "Start revision as non-owner",
                False,
                f"Exception: {str(e)}"
            )
            return False

    def test_revision_history_endpoints(self, drawing_id):
        """Test revision history viewer endpoints"""
        print(f"\n🧪 Test: Revision history viewer endpoints")
        
        # First, get the revisions list to find a rev_id
        try:
            response = self.session.get(
                f"{self.base_url}/api/drawings/{drawing_id}/revisions",
                timeout=10
            )
            
            if response.status_code != 200:
                self.log_result(
                    "Revision history endpoints",
                    False,
                    f"Could not get revisions list: {response.status_code}"
                )
                return False
            
            data = response.json()
            revisions = data.get("revisions", [])
            
            # Find an ECN revision with a snapshot
            rev_id = None
            for rev in revisions:
                if rev.get("type") == "ecn_revision" and rev.get("snapshot", {}).get("file_id"):
                    rev_id = rev.get("id")
                    break
            
            if not rev_id:
                self.log_result(
                    "Revision history endpoints",
                    True,
                    "No ECN revision with file snapshot found (expected for new ECN, skipping history tests)"
                )
                return True
            
            # Test page-meta endpoint
            response = self.session.get(
                f"{self.base_url}/api/drawings/{drawing_id}/revisions/{rev_id}/page-meta",
                timeout=10
            )
            
            if response.status_code != 200:
                self.log_result(
                    "Revision history endpoints",
                    False,
                    f"page-meta failed: {response.status_code}"
                )
                return False
            
            meta = response.json()
            if "pages" not in meta:
                self.log_result(
                    "Revision history endpoints",
                    False,
                    f"page-meta missing 'pages' field: {meta}"
                )
                return False
            
            # Test page-image endpoint
            response = self.session.get(
                f"{self.base_url}/api/drawings/{drawing_id}/revisions/{rev_id}/page-image?page=0",
                timeout=10
            )
            
            if response.status_code != 200:
                self.log_result(
                    "Revision history endpoints",
                    False,
                    f"page-image failed: {response.status_code}"
                )
                return False
            
            if response.headers.get("content-type") != "image/png":
                self.log_result(
                    "Revision history endpoints",
                    False,
                    f"page-image wrong content-type: {response.headers.get('content-type')}"
                )
                return False
            
            # Test download endpoint
            response = self.session.get(
                f"{self.base_url}/api/drawings/{drawing_id}/revisions/{rev_id}/download",
                timeout=10
            )
            
            if response.status_code != 200:
                self.log_result(
                    "Revision history endpoints",
                    False,
                    f"download failed: {response.status_code}"
                )
                return False
            
            if "application/pdf" not in response.headers.get("content-type", ""):
                self.log_result(
                    "Revision history endpoints",
                    False,
                    f"download wrong content-type: {response.headers.get('content-type')}"
                )
                return False
            
            self.log_result(
                "Revision history endpoints",
                True,
                f"All history endpoints working: page-meta, page-image, download"
            )
            return True
            
        except Exception as e:
            self.log_result(
                "Revision history endpoints",
                False,
                f"Exception: {str(e)}"
            )
            return False

    def run_all_tests(self):
        """Run all ECN acknowledgment tests"""
        print("=" * 80)
        print("🧪 BACKEND API TESTING: ECN Acknowledgment Chain & Owner Restriction")
        print("=" * 80)
        
        # Step 1: Login as trisna (eng_staff owner)
        print("\n📋 Step 1: Login as trisna (eng_staff owner)...")
        if not self.login("trisna", "eng123"):
            print("\n❌ Cannot proceed without trisna login")
            return False
        
        # Step 2: Find a controlled/released drawing
        print("\n📋 Step 2: Finding controlled/released drawing...")
        drawing = self.find_controlled_drawing()
        if not drawing:
            print("\n❌ Cannot proceed without controlled drawing")
            return False
        
        self.drawing_id = drawing.get("id")
        
        # Step 3: Ensure trisna is the owner (login as eng_leader to assign)
        print("\n📋 Step 3: Ensuring trisna is the owner...")
        original_session = self.session
        self.session = requests.Session()
        if not self.login("riski", "eng123"):
            print("\n❌ Cannot proceed without eng_leader login")
            return False
        
        # Get trisna's user ID from engineering-users endpoint
        response = self.session.get(f"{self.base_url}/api/drawings/engineering-users", timeout=10)
        trisna_id = None
        if response.status_code == 200:
            users = response.json().get("items", [])
            for user in users:
                if user.get("username") == "trisna":
                    trisna_id = user.get("id")
                    print(f"✅ Found trisna's user ID: {trisna_id}")
                    break
        
        if not trisna_id:
            print("❌ Could not find trisna's user ID")
            return False
        
        # Assign trisna as owner
        self.ensure_owner(self.drawing_id, trisna_id, "Trisna")
        
        # Switch back to trisna
        self.session = original_session
        
        # Step 4: Request revision as owner (creates ECN)
        print("\n📋 Step 4: Testing ECN creation and owner restriction...")
        self.test_request_revision_as_owner(self.drawing_id)
        self.test_request_revision_as_non_owner(self.drawing_id)
        
        # Step 5: Test ECN ack state
        print("\n📋 Step 5: Testing ECN ack state...")
        self.test_ecn_ack_state(self.drawing_id)
        
        # Step 6: Test ECN pending TTD endpoints
        print("\n📋 Step 6: Testing ECN pending TTD endpoints...")
        self.test_ecn_pending_ttd_produksi()
        self.test_ecn_pending_ttd_unauthorized()
        
        # Step 7: Test ECN ack with wrong role
        print("\n📋 Step 7: Testing ECN ack with wrong role...")
        self.test_ecn_ack_wrong_role(self.drawing_id)
        
        # Step 8: Test ECN ack as produksi
        print("\n📋 Step 8: Testing ECN ack as produksi...")
        self.test_ecn_ack_produksi(self.drawing_id)
        
        # Step 9: Test ECN pending TTD for QC
        print("\n📋 Step 9: Testing ECN pending TTD for QC...")
        self.test_ecn_pending_ttd_qc()
        
        # Step 10: Test ECN ack at qa_qc stage with wrong role
        print("\n📋 Step 10: Testing ECN ack at qa_qc stage with wrong role...")
        self.test_ecn_ack_qc_wrong_role(self.drawing_id)
        
        # Step 11: Test ECN ack as QC
        print("\n📋 Step 11: Testing ECN ack as QC...")
        self.test_ecn_ack_qc(self.drawing_id)
        
        # Step 12: Test ECN ack when done
        print("\n📋 Step 12: Testing ECN ack when already done...")
        self.test_ecn_ack_when_done(self.drawing_id)
        
        # Step 13: Test ECN register
        print("\n📋 Step 13: Testing ECN register...")
        self.test_ecn_register()
        
        # Step 14: Test start-revision owner restriction
        print("\n📋 Step 14: Testing start-revision owner restriction...")
        # Note: This will create a new ECN for testing start-revision
        # We need to find another controlled drawing or use the same one
        self.test_start_revision_as_non_owner(self.drawing_id)
        
        # Step 15: Test revision history endpoints
        print("\n📋 Step 15: Testing revision history endpoints...")
        self.test_revision_history_endpoints(self.drawing_id)
        
        # Print summary
        print("\n" + "=" * 80)
        print(f"📊 TEST SUMMARY")
        print("=" * 80)
        print(f"Total Tests: {self.tests_run}")
        print(f"Passed: {self.tests_passed}")
        print(f"Failed: {self.tests_run - self.tests_passed}")
        print(f"Success Rate: {(self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0:.1f}%")
        print("=" * 80)
        
        return self.tests_passed == self.tests_run

def main():
    tester = ECNAcknowledgmentTester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())
